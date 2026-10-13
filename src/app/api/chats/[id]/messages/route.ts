import { readBody, readMessage, withChat } from "../../request";

/** Send a message; while Hei is busy it waits for the current run as a follow-up. */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/chats/[id]/messages">,
) {
  return withChat(params, async (chats, chatId) => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    const message = readMessage(body);
    if (message instanceof Response) return message;
    await chats.send(chatId, message);
    return new Response(null, { status: 202 });
  });
}
