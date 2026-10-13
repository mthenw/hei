import { heiForRequest } from "@/app/api/hei";
import { eventStream } from "../../event-stream";

/** A ping on connect and after every calendar change; the page then reloads what it shows. */
export async function GET(request: Request) {
  const { calendars } = await heiForRequest();
  return eventStream(request, ({ send }) => {
    let version = 0;
    send({ version });
    return calendars.subscribe(() => send({ version: ++version }));
  });
}
