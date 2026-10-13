import { heiForRequest } from "@/app/api/hei";
import { respond } from "../../../respond";

/** Remove a todo's time block (the Undo after dragging a todo onto the calendar). */
export async function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/calendar/blocks/[id]">,
) {
  return respond(async () => {
    const { calendars } = await heiForRequest();
    await calendars.removeBlock(Number((await params).id));
    return new Response(null, { status: 204 });
  });
}
