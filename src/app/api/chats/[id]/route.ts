import { badRequest, readBody, withChat } from "../request";

/** Rename a chat: `{ title }`. */
export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/chats/[id]">,
) {
  return withChat(params, async (chats, chatId) => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (typeof body.title !== "string")
      return badRequest("title must be a string.");
    await chats.rename(chatId, body.title);
    return new Response(null, { status: 204 });
  });
}

/** Delete a chat and stop its work. */
export async function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/chats/[id]">,
) {
  return withChat(params, async (chats, chatId) => {
    await chats.delete(chatId);
    return new Response(null, { status: 204 });
  });
}
