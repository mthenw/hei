import { heiForRequest } from "@/app/api/hei";
import { badRequest, respond } from "../../respond";

/** At most this much at once: six weeks, the month view's span. */
const MAX_SPAN = 43 * 86_400_000;

/** Events of visible calendars between `from` and `to` (epoch milliseconds). */
export async function GET(request: Request) {
  return respond(async () => {
    const params = new URL(request.url).searchParams;
    const from = Number(params.get("from"));
    const to = Number(params.get("to"));
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from)
      return badRequest(
        "from and to must be times in milliseconds, from before to.",
      );
    if (to - from > MAX_SPAN)
      return badRequest("Ask for at most six weeks at once.");
    const { calendars } = await heiForRequest();
    return Response.json({ events: await calendars.events(from, to) });
  });
}
