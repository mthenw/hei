import {
  type Agent,
  type ChatId,
  ChatNotFound,
  getAgent,
  type Message,
} from "@/agent";

const MAX_CONTENT_LENGTH = 100_000;
const MAX_REQUEST_ID_LENGTH = 200;

/** Read `{ content, requestId }` from a JSON body, or answer 400. */
export async function readMessage(
  request: Request,
): Promise<Message | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("The body must be JSON.");
  }
  if (typeof body !== "object" || body === null)
    return badRequest("The body must be an object.");
  const { content, requestId } = body as Record<string, unknown>;
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

/** Run `handle` for the chat named by the `[id]` segment, answering 404 for an unknown chat. */
export async function withChat(
  params: Promise<{ id: string }>,
  handle: (agent: Agent, chatId: ChatId) => Promise<Response>,
): Promise<Response> {
  const { id } = await params;
  const chatId = Number(id);
  if (!Number.isSafeInteger(chatId) || chatId <= 0) return notFound();
  try {
    return await handle(await getAgent(), chatId);
  } catch (error) {
    if (ChatNotFound.is(error)) return notFound();
    throw error;
  }
}

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

function notFound() {
  return Response.json({ error: "Chat not found." }, { status: 404 });
}
