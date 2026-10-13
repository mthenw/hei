import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { AppDatabase } from "@/db/database";
import { type TodoRow, todos } from "@/db/schema";
import { HeiError, isHeiError } from "@/lib/errors";
import { isDate, isTime, localDate } from "@/lib/todo-dates";

export type Priority = "high" | "normal" | "low";

export type AgentStatus =
  | "queued"
  | "working"
  | "needs_you"
  | "ready"
  | "failed"
  | "stopped";

/** A handed-off todo's agent. */
export type TodoAgent = {
  status: AgentStatus;
  /** The agent's chat, once it has started. */
  chatId: number | null;
  /** What the agent reported. */
  result: string | null;
  /** Why its last run failed. */
  error: string | null;
  handedOffAt: number;
};

export type Todo = {
  id: number;
  title: string;
  notes: string;
  /** "2026-10-17" in the Profile's time zone; null for Someday. */
  dueDate: string | null;
  /** "14:30"; only with a due date. */
  dueTime: string | null;
  priority: Priority;
  done: boolean;
  doneAt: number | null;
  createdAt: number;
  updatedAt: number;
  agent: TodoAgent | null;
};

export type NewTodo = {
  title: string;
  notes?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: Priority;
};

export type TodoChange = Partial<{
  title: string;
  notes: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: Priority;
  done: boolean;
}>;

/** What the Todos page shows: the todos, and what "today" is for grouping them. */
export type TodoList = { todos: Todo[]; today: string; timeZone: string };

const MAX_TITLE = 200;
const MAX_NOTES = 10_000;
/** How many done todos the list keeps: the Completed group shows the latest. */
const COMPLETED_SHOWN = 50;
const PRIORITIES: readonly Priority[] = ["high", "normal", "low"];

export class InvalidTodo extends HeiError<"InvalidTodo"> {
  constructor(message: string) {
    super("InvalidTodo", message);
  }

  static is(error: unknown): error is InvalidTodo {
    return isHeiError(error, "InvalidTodo");
  }
}

export class TodoNotFound extends HeiError<"TodoNotFound"> {
  constructor(readonly todoId: number) {
    super("TodoNotFound", `Todo ${todoId} not found`);
  }

  static is(error: unknown): error is TodoNotFound {
    return isHeiError(error, "TodoNotFound");
  }
}

export type TodosOptions = {
  /** The Profile's time zone, read on every use. */
  timeZone: () => string;
  now?: () => number;
};

/**
 * The user's todos in Hei's database. Every change notifies subscribers, so the Todos page stays current whether the
 * change came from the page, a chat or an agent.
 */
export class Todos {
  private readonly listeners = new Set<() => void>();
  private readonly closedListeners = new Set<(todo: Todo) => void>();
  private readonly now: () => number;

  constructor(
    private readonly db: AppDatabase,
    private readonly options: TodosOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  /** Today's date in the Profile's time zone. */
  today(): string {
    return localDate(this.now(), this.options.timeZone());
  }

  /** Every open todo and the most recently done ones. */
  async list(): Promise<TodoList> {
    const [open, done] = await Promise.all([
      this.db.select().from(todos).where(isNull(todos.doneAt)),
      this.db
        .select()
        .from(todos)
        .where(isNotNull(todos.doneAt))
        .orderBy(desc(todos.doneAt))
        .limit(COMPLETED_SHOWN),
    ]);
    return {
      todos: [...open, ...done].map(toTodo),
      today: this.today(),
      timeZone: this.options.timeZone(),
    };
  }

  async get(id: number): Promise<Todo> {
    return toTodo(await this.row(id));
  }

  async add(input: NewTodo): Promise<Todo> {
    const fields = validate({
      title: input.title,
      notes: input.notes ?? "",
      dueDate: input.dueDate ?? null,
      dueTime: input.dueTime ?? null,
      priority: input.priority ?? "normal",
    });
    const now = new Date(this.now());
    const row = await this.db
      .insert(todos)
      .values({ ...fields, createdAt: now, updatedAt: now })
      .returning()
      .get();
    this.changed();
    return toTodo(row);
  }

  /** Change some fields. `done: true` marks it done; `done: false` reopens it. */
  async update(id: number, change: TodoChange): Promise<Todo> {
    const current = await this.row(id);
    const fields = validate({
      title: change.title ?? current.title,
      notes: change.notes ?? current.notes,
      dueDate: change.dueDate !== undefined ? change.dueDate : current.dueDate,
      // Clearing the date clears the time with it.
      dueTime:
        change.dueTime !== undefined
          ? change.dueTime
          : change.dueDate === null
            ? null
            : current.dueTime,
      priority: change.priority ?? current.priority,
    });
    const doneAt =
      change.done === undefined
        ? current.doneAt
        : change.done
          ? (current.doneAt ?? new Date(this.now()))
          : null;
    const row = await this.db
      .update(todos)
      .set({ ...fields, doneAt, updatedAt: new Date(this.now()) })
      .where(eq(todos.id, id))
      .returning()
      .get();
    const todo = toTodo(row);
    this.changed();
    if (current.doneAt === null && doneAt !== null) this.closed(todo);
    return todo;
  }

  async delete(id: number): Promise<void> {
    const todo = await this.get(id);
    await this.db.delete(todos).where(eq(todos.id, id));
    this.changed();
    this.closed(todo);
  }

  /** Call `listener` after every change. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Call `listener` when a todo is marked done or deleted, so its agent can stop. */
  onClosed(listener: (todo: Todo) => void): () => void {
    this.closedListeners.add(listener);
    return () => this.closedListeners.delete(listener);
  }

  // --- Hand-off bookkeeping, for HandOffs ---

  /** Set or clear a todo's agent fields. */
  async setAgent(
    id: number,
    agent: Partial<{
      status: AgentStatus | null;
      chatId: number | null;
      result: string | null;
      error: string | null;
      handedOffAt: number | null;
    }>,
  ): Promise<Todo> {
    const row = await this.db
      .update(todos)
      .set({
        ...(agent.status !== undefined ? { agentStatus: agent.status } : {}),
        ...(agent.chatId !== undefined ? { agentChatId: agent.chatId } : {}),
        ...(agent.result !== undefined ? { agentResult: agent.result } : {}),
        ...(agent.error !== undefined ? { agentError: agent.error } : {}),
        ...(agent.handedOffAt !== undefined
          ? {
              handedOffAt:
                agent.handedOffAt === null ? null : new Date(agent.handedOffAt),
            }
          : {}),
      })
      .where(eq(todos.id, id))
      .returning()
      .get();
    if (row === undefined) throw new TodoNotFound(id);
    this.changed();
    return toTodo(row);
  }

  /** The todo whose agent works in `chatId`, if any. */
  async byAgentChat(chatId: number): Promise<Todo | undefined> {
    const row = await this.db
      .select()
      .from(todos)
      .where(eq(todos.agentChatId, chatId))
      .get();
    return row && toTodo(row);
  }

  /** Open todos whose agent has one of `statuses`, longest handed off first. */
  async withAgentStatus(statuses: AgentStatus[]): Promise<Todo[]> {
    const rows = await this.db
      .select()
      .from(todos)
      .where(and(inArray(todos.agentStatus, statuses), isNull(todos.doneAt)))
      .orderBy(todos.handedOffAt, todos.id);
    return rows.map(toTodo);
  }

  private async row(id: number): Promise<TodoRow> {
    const row = await this.db
      .select()
      .from(todos)
      .where(eq(todos.id, id))
      .get();
    if (row === undefined) throw new TodoNotFound(id);
    return row;
  }

  private changed() {
    for (const listener of this.listeners) listener();
  }

  private closed(todo: Todo) {
    for (const listener of this.closedListeners) listener(todo);
  }
}

type Fields = {
  title: string;
  notes: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: Priority;
};

function validate(fields: Fields): Fields {
  const title = fields.title.replace(/\s+/g, " ").trim();
  if (title.length === 0 || title.length > MAX_TITLE)
    throw new InvalidTodo(`A title must be 1 to ${MAX_TITLE} characters.`);
  if (fields.notes.length > MAX_NOTES)
    throw new InvalidTodo(`Notes must be at most ${MAX_NOTES} characters.`);
  if (fields.dueDate !== null && !isDate(fields.dueDate))
    throw new InvalidTodo("A due date must be a date written as YYYY-MM-DD.");
  if (fields.dueTime !== null && !isTime(fields.dueTime))
    throw new InvalidTodo("A due time must be written as HH:MM, 24-hour.");
  if (fields.dueTime !== null && fields.dueDate === null)
    throw new InvalidTodo("A due time needs a due date.");
  if (!PRIORITIES.includes(fields.priority))
    throw new InvalidTodo("Priority must be high, normal or low.");
  return { ...fields, title, notes: fields.notes.trim() };
}

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueDate: row.dueDate,
    dueTime: row.dueTime,
    priority: row.priority,
    done: row.doneAt !== null,
    doneAt: row.doneAt?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    agent:
      row.agentStatus === null
        ? null
        : {
            status: row.agentStatus,
            chatId: row.agentChatId,
            result: row.agentResult,
            error: row.agentError,
            handedOffAt: row.handedOffAt?.getTime() ?? row.createdAt.getTime(),
          },
  };
}
