import type { ModelRef } from "@earendil-works/pi-durable";
import type { ChatId, Message } from "@/agent";
import type { Chats } from "@/chats";
import { getHei } from "@/server/hei";
import { badRequest, readBody, respond } from "../respond";

export { readBody };

const MAX_CONTENT_LENGTH = 100_000;
const MAX_REQUEST_ID_LENGTH = 200;

/** Read `{ content, requestId }` from a body, or answer 400. */
export function readMessage(body: Record<string, unknown>): Message | Response {
  const { content, requestId } = body;
  if (typeof content !== "string" || content.trim() === "")
    return badRequest("content must be a non-empty string.");
  if (content.length > MAX_CONTENT_LENGTH)
    return badRequest(
      `content must be at most ${MAX_CONTENT_LENGTH} characters.`,
    );
  if (
    typeof requestId !== "string" ||
    requestId === "" ||
    requestId.length > MAX_REQUEST_ID_LENGTH
  )
    return badRequest("requestId must be a non-empty string.");
  return { content, requestId };
}

/** Read an optional `model: { provider, modelId }`, or answer 400. */
export function readModel(value: unknown): ModelRef | undefined | Response {
  if (value === undefined) return undefined;
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ModelRef).provider === "string" &&
    typeof (value as ModelRef).modelId === "string"
  ) {
    const { provider, modelId } = value as ModelRef;
    return { provider, modelId };
  }
  return badRequest("model must be { provider, modelId }.");
}

/** Run `handle` for the chat named by the `[id]` segment; an unknown chat answers 404. */
export async function withChat(
  params: Promise<{ id: string }>,
  handle: (chats: Chats, chatId: ChatId) => Promise<Response>,
): Promise<Response> {
  const { id } = await params;
  const chatId = Number(id);
  if (!Number.isSafeInteger(chatId) || chatId <= 0)
    return Response.json({ error: "Chat not found." }, { status: 404 });
  return respond(async () => handle((await getHei()).chats, chatId));
}
