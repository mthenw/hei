import { heiForRequest } from "@/app/api/hei";
import { badRequest, readBody, respond } from "../respond";
import { readTodoChange } from "./request";

/** Every open todo and the latest done ones, with today's date for grouping them. */
export async function GET() {
  const { todos } = await heiForRequest();
  return Response.json(await todos.list());
}

/** Add a todo: `{ title, notes?, dueDate?, dueTime?, priority? }`. */
export async function POST(request: Request) {
  return respond(async () => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    const change = readTodoChange(body);
    if (change instanceof Response) return change;
    const { title, done: _done, ...rest } = change;
    if (title === undefined) return badRequest("title is required.");
    const { todos } = await heiForRequest();
    return Response.json(
      { todo: await todos.add({ title, ...rest }) },
      { status: 201 },
    );
  });
}
