import { eventStream } from "../../../event-stream";
import { withChat } from "../../request";

/**
 * A chat's live state as server-sent events. Each message is a JSON array of pi-durable agent events: first the
 * snapshot, then one batch per commit. A reconnecting client gets a fresh snapshot; nothing is replayed.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/chats/[id]/events">,
) {
  return withChat(params, async (chats, chatId) => {
    const watch = await chats.watch(chatId);
    return eventStream(request, ({ send, close }) => {
      send([watch.snapshot]);
      watch.start(async (events) => send(events));
      // The watch ends when the agent closes; ending the response makes the browser reconnect.
      void watch.closed.then(close);
      return () => void watch.stop();
    });
  });
}
