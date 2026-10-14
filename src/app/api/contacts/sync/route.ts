import { heiForRequest } from "@/app/api/hei";

/** Sync every account's contacts now; answers once done. */
export async function POST() {
  const { contacts } = await heiForRequest();
  await contacts.syncNow();
  return new Response(null, { status: 204 });
}
