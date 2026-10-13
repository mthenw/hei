import { heiForRequest } from "@/app/api/hei";
import { respond } from "../../../respond";

/** Disconnect an account; its calendars and events leave Hei. */
export async function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/calendar/accounts/[id]">,
) {
  return respond(async () => {
    const { calendars } = await heiForRequest();
    await calendars.removeAccount(Number((await params).id));
    return new Response(null, { status: 204 });
  });
}
