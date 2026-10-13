import { heiForRequest } from "@/app/api/hei";

/** The models a chat can run on right now, and the one new chats start on. */
export async function GET() {
  const { agent } = await heiForRequest();
  const [models, defaultModel] = await Promise.all([
    agent.availableModels(),
    agent.catalog.defaultModel(),
  ]);
  return Response.json({ models, defaultModel });
}
