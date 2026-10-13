import { heiForRequest } from "@/app/api/hei";
import { badRequest, readBody, respond } from "../../respond";

/** Block time for a todo in the default calendar: `{ todoId, start, end }`, times as instants. */
export async function POST(request: Request) {
  return respond(async () => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    const { todoId, start, end } = body;
    if (
      typeof todoId !== "number" ||
      typeof start !== "string" ||
      typeof end !== "string"
    )
      return badRequest("Send { todoId, start, end }.");
    const { todos, calendars } = await heiForRequest();
    const todo = await todos.get(todoId);
    return Response.json(
      {
        event: await calendars.createBlock({
          todoId,
          title: todo.title,
          start,
          end,
        }),
      },
      { status: 201 },
    );
  });
}
