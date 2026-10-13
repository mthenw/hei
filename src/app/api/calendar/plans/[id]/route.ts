import { heiForRequest } from "@/app/api/hei";
import { respond } from "../../../respond";

/** A plan Hei proposed: its changes and where it stands. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/calendar/plans/[id]">,
) {
  return respond(async () => {
    const { calendarPlans } = await heiForRequest();
    return Response.json({
      plan: await calendarPlans.get(Number((await params).id)),
    });
  });
}
