import { heiForRequest } from "@/app/api/hei";
import type { Priority, TodoChange, Todos } from "@/todos/todos";
import { badRequest, respond } from "../respond";

const PRIORITIES: readonly string[] = ["high", "normal", "low"];

/** Read the todo fields a body sets, checking only their types; `Todos` checks the values. */
export function readTodoChange(
  body: Record<string, unknown>,
): TodoChange | Response {
  const change: TodoChange = {};
  for (const key of ["title", "notes"] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "string")
      return badRequest(`${key} must be a string.`);
    change[key] = body[key];
  }
  for (const key of ["dueDate", "dueTime"] as const) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && typeof body[key] !== "string")
      return badRequest(`${key} must be a string or null.`);
    change[key] = body[key];
  }
  if (body.priority !== undefined) {
    if (
      typeof body.priority !== "string" ||
      !PRIORITIES.includes(body.priority)
    )
      return badRequest("priority must be high, normal or low.");
    change.priority = body.priority as Priority;
  }
  if (body.done !== undefined) {
    if (typeof body.done !== "boolean")
      return badRequest("done must be true or false.");
    change.done = body.done;
  }
  return change;
}

/** Run `handle` for the todo named by the `[id]` segment; an unknown todo answers 404. */
export async function withTodo(
  params: Promise<{ id: string }>,
  handle: (todos: Todos, todoId: number) => Promise<Response>,
): Promise<Response> {
  const { id } = await params;
  const todoId = Number(id);
  if (!Number.isSafeInteger(todoId) || todoId <= 0)
    return Response.json({ error: "Todo not found." }, { status: 404 });
  return respond(async () => handle((await heiForRequest()).todos, todoId));
}
