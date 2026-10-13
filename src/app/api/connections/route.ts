import { connection } from "next/server";
import { getHei } from "@/server/hei";

/** Which accounts and keys Hei can use. Never includes a secret. */
export async function GET() {
  await connection();
  const { connections } = await getHei();
  return Response.json(await connections.status());
}
