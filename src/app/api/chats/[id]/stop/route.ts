import { withChat } from "../../request";

/** Stop the current run and withdraw queued messages. */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/chats/[id]/stop">,
) {
  return withChat(params, async (agent, chatId) => {
    await agent.stop(chatId);
    return new Response(null, { status: 204 });
  });
}
