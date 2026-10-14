import { heiForRequest } from "@/app/api/hei";

/** Each Google account's contacts: allowed or not, how many, and the last sync. */
export async function GET() {
  const { contacts } = await heiForRequest();
  return Response.json(await contacts.status());
}
