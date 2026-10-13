import { heiForRequest } from "@/app/api/hei";

/** Sync every account now; answers once done. */
export async function POST() {
  const { calendars } = await heiForRequest();
  await calendars.syncNow();
  return new Response(null, { status: 204 });
}
