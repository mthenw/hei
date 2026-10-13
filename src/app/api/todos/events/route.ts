import { heiForRequest } from "@/app/api/hei";
import { eventStream } from "../../event-stream";

/** The todo list as server-sent events: the whole list on connect and after every change. */
export async function GET(request: Request) {
  const { todos } = await heiForRequest();
  return eventStream(request, ({ send }) => {
    // One list at a time, in order, so a slow read never overwrites a newer list.
    let queue = Promise.resolve();
    const push = () => {
      queue = queue.then(async () => send(await todos.list()));
    };
    push();
    return todos.subscribe(push);
  });
}
