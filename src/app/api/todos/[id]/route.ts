import { readBody } from "../../respond";
import { readTodoChange, withTodo } from "../request";

/** Change a todo: any of `{ title, notes, dueDate, dueTime, priority, done }`. */
export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/todos/[id]">,
) {
  return withTodo(params, async (todos, todoId) => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    const change = readTodoChange(body);
    if (change instanceof Response) return change;
    return Response.json({ todo: await todos.update(todoId, change) });
  });
}

/** Delete a todo; its agent stops, and its chat stays. */
export async function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/todos/[id]">,
) {
  return withTodo(params, async (todos, todoId) => {
    await todos.delete(todoId);
    return new Response(null, { status: 204 });
  });
}
