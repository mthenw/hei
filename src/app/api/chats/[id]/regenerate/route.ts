import { readBody, readRequestId, withChat } from "../../request";

/** Answer the chat's last message again, in place of its reply. */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/chats/[id]/regenerate">,
) {
  return withChat(params, async (chats, chatId) => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    const requestId = readRequestId(body.requestId);
    if (requestId instanceof Response) return requestId;
    await chats.regenerate(chatId, requestId);
    return new Response(null, { status: 202 });
  });
}
