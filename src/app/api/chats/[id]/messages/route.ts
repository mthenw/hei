import { readMessage, withChat } from "../../request";

/** Send a message; while Hei is busy it waits for the current run as a follow-up. */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/chats/[id]/messages">,
) {
  return withChat(params, async (chats, chatId) => {
    const message = await readMessage(request);
    if (message instanceof Response) return message;
    await chats.send(chatId, message);
    return new Response(null, { status: 202 });
  });
}
