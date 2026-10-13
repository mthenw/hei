import { heiForRequest } from "@/app/api/hei";

/** The browser key and map ID for Google's map and place cards; `browserKey` is null when none is set. */
export async function GET() {
  const { maps } = await heiForRequest();
  return Response.json(maps);
}
