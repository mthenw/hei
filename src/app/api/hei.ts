import { connection } from "next/server";
import { getHei, type Hei } from "@/server/hei";

/**
 * Hei, for a route handler. `connection()` first: under Cache Components, \`next build\` runs GET handlers to try to
 * prerender them until they read request data, and opening Hei there would open the storage from a second process,
 * the build, beside the running server.
 */
export async function heiForRequest(): Promise<Hei> {
  await connection();
  return getHei();
}
