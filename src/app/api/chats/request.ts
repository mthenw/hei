import { type ChatId, ChatNotFound, type Message } from "@/agent";
import { type Chats, getChats, InvalidTitle } from "@/chats";

const MAX_CONTENT_LENGTH = 100_000;
const MAX_REQUEST_ID_LENGTH = 200;

/** Read a JSON object body, or answer 400. */
export async function readBody(
  request: Request,
): Promise<Record<string, unknown> | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("The body must be JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return badRequest("The body must be an object.");
  return body as Record<string, unknown>;
}

/** Read `{ content, requestId }` from a JSON body, or answer 400. */
export async function readMessage(
  request: Request,
): Promise<Message | Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;
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

/**
 * Run `handle` for the chat named by the `[id]` segment. An unknown chat answers 404 and an invalid title 400.
 */
export async function withChat(
  params: Promise<{ id: string }>,
  handle: (chats: Chats, chatId: ChatId) => Promise<Response>,
): Promise<Response> {
  const { id } = await params;
  const chatId = Number(id);
  if (!Number.isSafeInteger(chatId) || chatId <= 0) return notFound();
  try {
    return await handle(await getChats(), chatId);
  } catch (error) {
    if (ChatNotFound.is(error)) return notFound();
    if (InvalidTitle.is(error)) return badRequest(error.message);
    throw error;
  }
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

function notFound() {
  return Response.json({ error: "Chat not found." }, { status: 404 });
}
