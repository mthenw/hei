import { heiForRequest } from "@/app/api/hei";
import { respond } from "../../../../respond";

/** Reverse what applying the plan did. */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/calendar/plans/[id]/undo">,
) {
  return respond(async () => {
    const { calendarPlans } = await heiForRequest();
    return Response.json({
      plan: await calendarPlans.undo(Number((await params).id)),
    });
  });
}
