import { heiForRequest } from "@/app/api/hei";

/** The connected accounts and their calendars, and the time zone to show events in. */
export async function GET() {
  const { calendars } = await heiForRequest();
  return Response.json(await calendars.overview());
}
