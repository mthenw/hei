import { Type } from "@earendil-works/pi-ai";
import {
  defineExtension,
  defineTool,
  type Extension,
  section,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import { formatDue } from "@/lib/todo-dates";
import { groupTodos } from "@/lib/todo-groups";
import type { AgentStatus, Todo, TodoChange, Todos } from "./todos";

/** What a todo tool's result carries for the chat: what happened, to which todo. */
export type TodoToolDetails = {
  kind: "todo";
  action:
    | "listed"
    | "added"
    | "updated"
    | "completed"
    | "reopened"
    | "deleted"
    | "handed_off"
    | "reported";
  todo?: Pick<Todo, "id" | "title" | "dueDate" | "dueTime">;
  /** For "listed": how many open todos there are. */
  open?: number;
  /** The date the result was made on, for saying the due date as "Tomorrow". */
  today: string;
};

/** How Hei should use the todo tools. */
export const TODO_INSTRUCTIONS = [
  "You can manage the user's todo list with list_todos, add_todo, update_todo and delete_todo.",
  "Add, change and complete todos when the user asks, without asking for confirmation. Before deleting a todo, ask the user to confirm.",
  "Due dates are YYYY-MM-DD and times HH:MM (24-hour), in the user's time zone; today's date is above. Give a time only when the user mentions one. Priority is high, normal or low; keep it normal unless the user says otherwise.",
  "Call list_todos before changing a todo you haven't seen in this chat. Refer to todos by title, not by id. The user sees each change in the chat, so confirm it in a few words.",
].join("\n");

const HAND_OFF_INSTRUCTIONS =
  "hand_off_todo gives a todo to a background agent that works on it in a chat of its own and reports back on the todo. Use it when the user asks to hand a todo off, or to have it worked on in the background.";

export type TodosExtensionOptions = {
  /** Start an agent on a todo; without it, Hei offers no hand_off_todo. */
  handOff?: (todoId: number) => Promise<Todo>;
};

/** The todo list as an extension: the tools and the instructions for using them. Every chat gets it. */
export function todosExtension(
  todos: Todos,
  options: TodosExtensionOptions = {},
): Extension {
  return defineExtension({
    name: "todos",
    tools: todoTools(todos, options),
    sections: [
      section("todos", () =>
        options.handOff
          ? `${TODO_INSTRUCTIONS}\n${HAND_OFF_INSTRUCTIONS}`
          : TODO_INSTRUCTIONS,
      ),
    ],
  });
}

const DateOrNull = Type.Union([Type.String(), Type.Null()]);

export function todoTools(
  todos: Todos,
  options: TodosExtensionOptions = {},
): ToolRegistration[] {
  const result = (
    text: string,
    action: TodoToolDetails["action"],
    todo?: Todo,
    open?: number,
  ) => {
    const details: TodoToolDetails = {
      kind: "todo",
      action,
      ...(todo
        ? {
            todo: {
              id: todo.id,
              title: todo.title,
              dueDate: todo.dueDate,
              dueTime: todo.dueTime,
            },
          }
        : {}),
      ...(open !== undefined ? { open } : {}),
      today: todos.today(),
    };
    return { content: [{ type: "text" as const, text }], details };
  };

  const listTodos = defineTool({
    name: "list_todos",
    description:
      "List the user's open todos, grouped into Today (including overdue), Upcoming and Someday, with ids, due dates, priorities, notes and any agent's status.",
    parameters: Type.Object({
      include_completed: Type.Optional(
        Type.Boolean({ description: "Also list recently completed todos." }),
      ),
    }),
    replay: "safe",
    execute: async (args) => {
      const list = await todos.list();
      const open = list.todos.filter((todo) => !todo.done).length;
      return result(
        listText(list.todos, list.today, args.include_completed ?? false),
        "listed",
        undefined,
        open,
      );
    },
  });

  const addTodo = defineTool({
    name: "add_todo",
    description: "Add a todo to the user's list.",
    parameters: Type.Object({
      title: Type.String({ description: "Short and actionable." }),
      notes: Type.Optional(Type.String()),
      due_date: Type.Optional(
        Type.String({ description: "YYYY-MM-DD. Leave out for no date." }),
      ),
      due_time: Type.Optional(
        Type.String({ description: "HH:MM, 24-hour; needs a due date." }),
      ),
      priority: Type.Optional(
        Type.Union([
          Type.Literal("high"),
          Type.Literal("normal"),
          Type.Literal("low"),
        ]),
      ),
    }),
    // Not safe to repeat after a crash: it would add the todo twice.
    execute: async (args) => {
      const todo = await todos.add({
        title: args.title,
        notes: args.notes,
        dueDate: args.due_date ?? null,
        dueTime: args.due_time ?? null,
        priority: args.priority,
      });
      return result(`Added ${describe(todo, todos.today())}.`, "added", todo);
    },
  });

  const updateTodo = defineTool({
    name: "update_todo",
    description:
      "Change a todo: any of its fields, or mark it done or not done. Set due_date to null to remove the date.",
    parameters: Type.Object({
      id: Type.Integer(),
      title: Type.Optional(Type.String()),
      notes: Type.Optional(Type.String()),
      due_date: Type.Optional(DateOrNull),
      due_time: Type.Optional(DateOrNull),
      priority: Type.Optional(
        Type.Union([
          Type.Literal("high"),
          Type.Literal("normal"),
          Type.Literal("low"),
        ]),
      ),
      done: Type.Optional(Type.Boolean()),
    }),
    replay: "safe",
    execute: async (args) => {
      const before = await todos.get(args.id);
      const change: TodoChange = {
        title: args.title,
        notes: args.notes,
        dueDate: args.due_date,
        dueTime: args.due_time,
        priority: args.priority,
        done: args.done,
      };
      const todo = await todos.update(args.id, change);
      const action =
        args.done === true && !before.done
          ? "completed"
          : args.done === false && before.done
            ? "reopened"
            : "updated";
      const verb = {
        completed: "Completed",
        reopened: "Reopened",
        updated: "Updated",
      }[action];
      return result(`${verb} ${describe(todo, todos.today())}.`, action, todo);
    },
  });

  const deleteTodo = defineTool({
    name: "delete_todo",
    description:
      "Delete a todo for good. Ask the user to confirm in the chat first.",
    parameters: Type.Object({ id: Type.Integer() }),
    replay: "safe",
    execute: async (args) => {
      const todo = await todos.get(args.id);
      await todos.delete(args.id);
      return result(`Deleted "${todo.title}".`, "deleted", todo);
    },
  });

  const tools: ToolRegistration[] = [
    listTodos,
    addTodo,
    updateTodo,
    deleteTodo,
  ];
  const { handOff } = options;
  if (handOff)
    tools.push(
      defineTool({
        name: "hand_off_todo",
        description:
          "Give a todo to a background agent. It works on the todo in a chat of its own, asks the user there if it needs to, and reports its result on the todo.",
        parameters: Type.Object({ id: Type.Integer() }),
        replay: "safe",
        execute: async (args) => {
          const todo = await handOff(args.id);
          const queued = todo.agent?.status === "queued";
          return result(
            queued
              ? `Handed off "${todo.title}". Two agents are busy, so it starts when one finishes.`
              : `Handed off "${todo.title}". An agent is working on it.`,
            "handed_off",
            todo,
          );
        },
      }),
    );
  return tools;
}

const AGENT_LABELS: Record<AgentStatus, string> = {
  queued: "queued",
  working: "working",
  needs_you: "waiting for the user",
  ready: "result ready",
  failed: "failed",
  stopped: "stopped",
};

/** One todo in a line, as the model reads it. */
function line(todo: Todo, today: string): string {
  const parts = [
    `#${todo.id} ${todo.title}`,
    todo.dueDate &&
      `due ${formatDue(todo.dueDate, todo.dueTime, today)} (${todo.dueDate}${todo.dueTime ? ` ${todo.dueTime}` : ""})`,
    todo.priority !== "normal" && `${todo.priority} priority`,
    todo.agent && `agent ${AGENT_LABELS[todo.agent.status]}`,
  ].filter(Boolean);
  const notes = todo.notes
    ? `\n   Notes: ${todo.notes.replace(/\s+/g, " ").slice(0, 300)}`
    : "";
  const result = todo.agent?.result
    ? `\n   Agent's result: ${todo.agent.result.replace(/\s+/g, " ").slice(0, 300)}`
    : "";
  return `- ${parts.join(" · ")}${notes}${result}`;
}

function listText(all: Todo[], today: string, withCompleted: boolean): string {
  const groups = groupTodos(all, today);
  const sections = [
    ["Today", groups.today],
    ["Upcoming", groups.upcoming.flatMap((day) => day.todos)],
    ["Someday", groups.someday],
    ...(withCompleted
      ? [["Recently completed", groups.completed] as const]
      : []),
  ] as const;
  const text = sections
    .filter(([, todos]) => todos.length > 0)
    .map(
      ([title, todos]) =>
        `${title}:\n${todos.map((todo) => line(todo, today)).join("\n")}`,
    )
    .join("\n\n");
  return text || "The todo list is empty.";
}

function describe(todo: Todo, today: string): string {
  return `"${todo.title}"${todo.dueDate ? `, due ${formatDue(todo.dueDate, todo.dueTime, today)}` : ""}`;
}
