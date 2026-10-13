import { heiForRequest } from "@/app/api/hei";
import { CALENDAR_COLORS, type CalendarColor } from "@/calendar/calendars";
import { badRequest, readBody, respond } from "../../../respond";

/** Change a calendar: any of `{ visible, color, isDefault }`. */
export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/calendar/calendars/[id]">,
) {
  return respond(async () => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    const change: {
      visible?: boolean;
      color?: CalendarColor;
      isDefault?: boolean;
    } = {};
    for (const key of ["visible", "isDefault"] as const) {
      if (body[key] === undefined) continue;
      if (typeof body[key] !== "boolean")
        return badRequest(`${key} must be true or false.`);
      change[key] = body[key];
    }
    if (body.color !== undefined) {
      if (!CALENDAR_COLORS.includes(body.color as CalendarColor))
        return badRequest(
          `color must be one of ${CALENDAR_COLORS.join(", ")}.`,
        );
      change.color = body.color as CalendarColor;
    }
    const { calendars } = await heiForRequest();
    return Response.json({
      calendar: await calendars.updateCalendar(
        Number((await params).id),
        change,
      ),
    });
  });
}
