import { getHei } from "@/server/hei";
import { respond } from "../respond";
import { readBody, readMessage, readModel } from "./request";

/**
 * Start a chat: `{ content, requestId, model? }`. Retrying with the same request id returns the same chat. Without a
 * model the chat starts on the default one.
 */
export async function POST(request: Request) {
  return respond(async () => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    const message = readMessage(body);
    if (message instanceof Response) return message;
    const model = readModel(body.model);
    if (model instanceof Response) return model;
    const { chats } = await getHei();
    const chatId = await chats.start(message, model);
    return Response.json({ chatId }, { status: 201 });
  });
}
