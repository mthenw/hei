import { heiForRequest } from "@/app/api/hei";
import { respond } from "../../../../respond";

/** Apply the plan's changes to the calendars. */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/calendar/plans/[id]/approve">,
) {
  return respond(async () => {
    const { calendarPlans } = await heiForRequest();
    return Response.json({
      plan: await calendarPlans.approve(Number((await params).id)),
    });
  });
}
