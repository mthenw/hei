import { ChatNotFound, ModelUnavailable } from "@/agent";
import { InvalidTitle } from "@/chats";
import { SignInError } from "@/connections/connections";
import { CredentialsUnavailable } from "@/connections/credential-store";

/** Run a route handler, answering Hei's known errors with a status and their message. */
export async function respond(
  handle: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handle();
  } catch (error) {
    const status = statusOf(error);
    if (status === undefined) throw error;
    return Response.json({ error: (error as Error).message }, { status });
  }
}

function statusOf(error: unknown): number | undefined {
  if (ChatNotFound.is(error)) return 404;
  if (
    InvalidTitle.is(error) ||
    ModelUnavailable.is(error) ||
    SignInError.is(error)
  )
    return 400;
  if (CredentialsUnavailable.is(error)) return 409;
  return undefined;
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

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
