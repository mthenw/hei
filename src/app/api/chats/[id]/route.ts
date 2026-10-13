import { badRequest } from "../../respond";
import { readBody, readModel, withChat } from "../request";

/** Change a chat: `{ title }` renames it, `{ model }` switches the model it runs on. */
export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/chats/[id]">,
) {
  return withChat(params, async (chats, chatId) => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    const model = readModel(body.model);
    if (model instanceof Response) return model;
    if (body.title !== undefined && typeof body.title !== "string")
      return badRequest("title must be a string.");
    if (body.title === undefined && model === undefined)
      return badRequest("Send a title or a model.");
    if (model !== undefined) await chats.setModel(chatId, model);
    if (typeof body.title === "string") await chats.rename(chatId, body.title);
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
