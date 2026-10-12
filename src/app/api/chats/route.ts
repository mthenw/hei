import { getAgent } from "@/agent";
import { readMessage } from "./request";

/** Start a chat with its first message. */
export async function POST(request: Request) {
  const message = await readMessage(request);
  if (message instanceof Response) return message;
  const agent = await getAgent();
  const chatId = await agent.startChat(message);
  return Response.json({ chatId }, { status: 201 });
}
