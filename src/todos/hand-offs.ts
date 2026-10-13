import { Type } from "@earendil-works/pi-ai";
import {
  defineExtension,
  defineTool,
  type Extension,
  section,
} from "@earendil-works/pi-durable";
import type { ChatId, Outcome } from "@/agent";
import type { Chats } from "@/chats";
import { formatDue } from "@/lib/todo-dates";
import { InvalidTodo, type Todo, type Todos } from "./todos";
import type { TodoToolDetails } from "./tools";

/** At most this many agents work at once; the ChatGPT plan's limits are shared by all of them. */
const MAX_WORKING = 2;

/** How a hand-off agent works: on its own, asking only when it must, and reporting on the todo. */
export const AGENT_INSTRUCTIONS = [
  "This chat is a todo the user handed to you to work on in the background. Its first message is the todo, with any due date, priority and notes.",
  "Work on it on your own with your tools: research, compare options, read pages, find places, draft text. Don't ask permission for that.",
  "If you need a decision or something only the user knows, ask one short, specific question and end your turn. The user will answer here.",
  "When you have a result, call report_result with it: what you found or did, with links where useful. It is read on the todo, apart from this chat, so lead with the answer in a sentence or two, then only the detail that matters; no headings, and no references to maps, numbered places or earlier messages. Then end with a one-line reply. Don't mark the todo done; the user reviews your result first.",
  "If the user writes again, carry on from there and report again when you have a new result.",
].join("\n");

/**
 * What only hand-off agents get: their instructions and report_result (ADR 0006). The tool finds its todo through the
 * chat it runs in, so it needs no HandOffs.
 */
export function handOffExtension(todos: Todos): Extension {
  const reportResult = defineTool({
    name: "report_result",
    description:
      "Report your result on the todo, for the user to review: what you found or did, short and concrete, with links where useful.",
    parameters: Type.Object({ result: Type.String() }),
    // Repeating it writes the same result again.
    replay: "safe",
    execute: async (args, api) => {
      const todo = await todos.byAgentChat(api.conversationId);
      if (todo === undefined)
        throw new Error("This chat no longer works on a todo.");
      await todos.setAgent(todo.id, {
        status: "ready",
        result: args.result.trim(),
        error: null,
      });
      const details: TodoToolDetails = {
        kind: "todo",
        action: "reported",
        todo: {
          id: todo.id,
          title: todo.title,
          dueDate: todo.dueDate,
          dueTime: todo.dueTime,
        },
        today: todos.today(),
      };
      return {
        content: [
          {
            type: "text",
            text: "Reported. The user will review it on the todo.",
          },
        ],
        details,
      };
    },
  });
  return defineExtension({
    name: "hand-off",
    tools: [reportResult],
    sections: [section("hand-off", () => AGENT_INSTRUCTIONS)],
  });
}

export type HandOffsOptions = {
  todos: Todos;
  chats: Chats;
  agent: {
    waitForIdle(chatId: ChatId): Promise<void>;
    lastOutcome(chatId: ChatId): Promise<Outcome>;
  };
  /** The extension agent chats get, from `handOffExtension`. */
  extension: Extension;
  maxWorking?: number;
  now?: () => number;
};

/**
 * Hands todos to agents: each agent is a chat that has the hand-off extension (ADR 0006). HandOffs starts agents up to
 * the limit, follows each run to its end to set the todo's agent status, and starts the next queued todo when one stops
 * working.
 */
export class HandOffs {
  private readonly todos: Todos;
  private readonly chats: Chats;
  private readonly maxWorking: number;
  private readonly now: () => number;
  /** Per agent chat, the latest run being followed; an older follow that ends after a newer message started stands down. */
  private readonly runs = new Map<ChatId, number>();
  /** Starting queued agents, one pass at a time. */
  private filling: Promise<void> = Promise.resolve();
  /** Follows still running, for tests and shutdown. */
  private readonly following = new Set<Promise<void>>();
  /** Agent chats being stopped: their run ends as stopped, whatever it left behind. */
  private readonly stopping = new Set<ChatId>();

  constructor(private readonly options: HandOffsOptions) {
    this.todos = options.todos;
    this.chats = options.chats;
    this.maxWorking = options.maxWorking ?? MAX_WORKING;
    this.now = options.now ?? Date.now;

    this.chats.observe((event) => {
      if (event.type === "sent") return this.resumed(event.chatId);
      if (event.type === "stopping") return this.stoppingChat(event.chatId);
      return this.chatDeleted(event.chatId);
    });
    this.todos.onClosed((todo) => {
      this.todoClosed(todo).catch((error: unknown) =>
        console.warn(
          `Hand-off: could not stop todo ${todo.id}'s agent:`,
          error,
        ),
      );
    });
  }

  /** Follow agents a previous process left working, and start queued ones. Call once, after the Agent resumed. */
  async resume(): Promise<void> {
    for (const todo of await this.todos.withAgentStatus(["working"])) {
      if (todo.agent?.chatId == null) {
        // Stopped between claiming a place and starting its chat: start it again.
        await this.todos.setAgent(todo.id, { status: "queued" });
        continue;
      }
      this.follow(todo.agent.chatId);
    }
    await this.fill();
  }

  /** Hand a todo to an agent. It starts now, or waits in line while the limit is reached. */
  async handOff(todoId: number): Promise<Todo> {
    const todo = await this.todos.get(todoId);
    if (todo.done) throw new InvalidTodo("This todo is done; reopen it first.");
    const active =
      todo.agent?.status === "queued" || todo.agent?.status === "working";
    if (!active) {
      await this.todos.setAgent(todoId, {
        status: "queued",
        chatId: null,
        result: null,
        error: null,
        handedOffAt: this.now(),
      });
      await this.fill();
    }
    return this.todos.get(todoId);
  }

  /** Stop a todo's agent, or take it out of the queue. Its chat stays. */
  async stop(todoId: number): Promise<void> {
    const todo = await this.todos.get(todoId);
    if (todo.agent?.status === "queued")
      await this.todos.setAgent(todoId, { status: "stopped" });
    else if (todo.agent?.status === "working" && todo.agent.chatId !== null)
      // The run ends as aborted, and following it marks the agent stopped.
      await this.chats.stop(todo.agent.chatId);
  }

  /** Resolves once every followed run has been settled. */
  async settled(): Promise<void> {
    while (this.following.size > 0)
      await Promise.allSettled([...this.following]);
    await this.filling;
  }

  /** Start queued agents, oldest hand-off first, while fewer than the limit are working. */
  private fill(): Promise<void> {
    this.filling = this.filling
      .then(async () => {
        const working = await this.todos.withAgentStatus(["working"]);
        let room = this.maxWorking - working.length;
        for (const todo of await this.todos.withAgentStatus(["queued"])) {
          if (room <= 0) break;
          room--;
          await this.start(todo);
        }
      })
      .catch((error: unknown) =>
        console.warn("Hand-off: could not start queued agents:", error),
      );
    return this.filling;
  }

  private async start(todo: Todo) {
    // Claim the place first, so the agent counts as working before its chat exists.
    await this.todos.setAgent(todo.id, { status: "working" });
    try {
      const chatId = await this.chats.start(
        {
          content: brief(todo, this.todos.today()),
          // The same hand-off never starts two chats, even if started again after a crash.
          requestId: `hand-off-${todo.id}-${todo.agent?.handedOffAt ?? 0}`,
        },
        undefined,
        [this.options.extension],
      );
      await this.todos.setAgent(todo.id, { chatId });
      this.follow(chatId);
    } catch (error) {
      await this.todos.setAgent(todo.id, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** The user wrote in an agent's chat (or regenerated its reply): the agent is working again. */
  private async resumed(chatId: ChatId) {
    const todo = await this.todos.byAgentChat(chatId);
    if (todo === undefined || todo.done) return;
    this.stopping.delete(chatId);
    await this.todos.setAgent(todo.id, { status: "working", error: null });
    this.follow(chatId);
  }

  /** A stop may land before the agent said anything, which would look like a failure; remember it was a stop. */
  private async stoppingChat(chatId: ChatId) {
    if ((await this.todos.byAgentChat(chatId)) !== undefined)
      this.stopping.add(chatId);
  }

  private async chatDeleted(chatId: ChatId) {
    const todo = await this.todos.byAgentChat(chatId);
    if (todo?.agent === null || todo === undefined) return;
    // Deleting the chat stopped the agent; the todo keeps its result and can be handed off again.
    await this.todos.setAgent(todo.id, {
      chatId: null,
      status: todo.agent.status === "working" ? "stopped" : todo.agent.status,
    });
    await this.fill();
  }

  private async todoClosed(todo: Todo) {
    if (todo.agent?.status === "working" && todo.agent.chatId !== null)
      await this.chats.stop(todo.agent.chatId);
    else if (todo.agent?.status === "queued" && todo.done)
      await this.todos.setAgent(todo.id, { status: "stopped" });
  }

  /** Follow the chat's current run to its end, then set the agent's status from how it ended. */
  private follow(chatId: ChatId) {
    const run = (this.runs.get(chatId) ?? 0) + 1;
    this.runs.set(chatId, run);
    const following = (async () => {
      // Failover may send the message again; then the chat goes idle once the last attempt ends.
      await this.chats.settled(chatId);
      await this.options.agent.waitForIdle(chatId);
      if (this.runs.get(chatId) !== run) return;
      this.runs.delete(chatId);
      await this.settle(chatId);
    })()
      .catch((error: unknown) =>
        console.warn(`Hand-off: lost track of chat ${chatId}:`, error),
      )
      .finally(() => this.following.delete(following));
    this.following.add(following);
  }

  private async settle(chatId: ChatId) {
    const todo = await this.todos.byAgentChat(chatId);
    const stopped = this.stopping.delete(chatId);
    // A report during the run already set the status; otherwise the run's end decides it.
    if (todo?.agent?.status === "working") {
      const outcome: Outcome = stopped
        ? { kind: "stopped" }
        : await this.options.agent.lastOutcome(chatId);
      await this.todos.setAgent(todo.id, {
        status:
          outcome.kind === "answered"
            ? "needs_you"
            : outcome.kind === "stopped"
              ? "stopped"
              : "failed",
        error: outcome.kind === "failed" ? outcome.error : null,
      });
    }
    await this.fill();
  }
}

/** The agent's first message: the todo. Its first line, the title, also titles the chat. */
function brief(todo: Todo, today: string): string {
  const facts = [
    todo.dueDate &&
      `Due: ${formatDue(todo.dueDate, todo.dueTime, today)} (${todo.dueDate}${todo.dueTime ? ` ${todo.dueTime}` : ""})`,
    todo.priority !== "normal" && `Priority: ${todo.priority}`,
  ].filter(Boolean);
  return [todo.title, facts.join("\n"), todo.notes]
    .filter((part) => part !== "")
    .join("\n\n");
}
