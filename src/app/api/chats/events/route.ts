import { getHei } from "@/server/hei";
import { eventStream } from "../../event-stream";

/** The chat list as server-sent events: the whole list on connect and after every change. */
export async function GET(request: Request) {
  const { chats } = await getHei();
  return eventStream(request, ({ send }) => {
    // One list at a time, in order, so a slow read never overwrites a newer list.
    let queue = Promise.resolve();
    const push = () => {
      queue = queue.then(async () => send(await chats.list()));
    };
    push();
    return chats.subscribe(push);
  });
}
