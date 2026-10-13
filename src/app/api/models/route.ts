import { connection } from "next/server";
import { getHei } from "@/server/hei";

/** The models a chat can run on right now, and the one new chats start on. */
export async function GET() {
  // Depends on sign-ins and keys at request time, so never prerender it.
  await connection();
  const { agent } = await getHei();
  const [models, defaultModel] = await Promise.all([
    agent.availableModels(),
    agent.catalog.defaultModel(),
  ]);
  return Response.json({ models, defaultModel });
}
