import { heiForRequest } from "@/app/api/hei";
import { respond } from "../../../../respond";

/** Decline the plan (Not now); nothing changes. */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/calendar/plans/[id]/dismiss">,
) {
  return respond(async () => {
    const { calendarPlans } = await heiForRequest();
    return Response.json({
      plan: await calendarPlans.dismiss(Number((await params).id)),
    });
  });
}
