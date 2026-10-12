import { getChats } from "@/chats";
import { readMessage } from "./request";

/** Start a chat with its first message. Retrying with the same request id returns the same chat. */
export async function POST(request: Request) {
  const message = await readMessage(request);
  if (message instanceof Response) return message;
  const chats = await getChats();
  const chatId = await chats.start(message);
  return Response.json({ chatId }, { status: 201 });
}
