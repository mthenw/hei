import { heiForRequest } from "@/app/api/hei";

/** Which accounts and keys Hei can use. Never includes a secret. */
export async function GET() {
  const { connections } = await heiForRequest();
  return Response.json(await connections.status());
}
