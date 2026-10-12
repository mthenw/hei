import { nanoid } from "nanoid";

// Request ids make retries safe: the server admits a message with a given id once. nanoid rather than
// crypto.randomUUID(), which browsers expose only on HTTPS or localhost (not on the LAN dev address).
const newRequestId = () => nanoid();

export async function startChat(content: string): Promise<number> {
  const response = await post("/api/chats", {
    content,
    requestId: newRequestId(),
  });
  const { chatId } = (await response.json()) as { chatId: number };
  return chatId;
}

export async function sendMessage(chatId: number, content: string) {
  await post(`/api/chats/${chatId}/messages`, {
    content,
    requestId: newRequestId(),
  });
}

export async function stopChat(chatId: number) {
  await post(`/api/chats/${chatId}/stop`);
}

async function post(url: string, body?: unknown): Promise<Response> {
  const response = await fetch(url, {
    method: "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response
      .json()
      .then((json: { error?: string }) => json.error)
      .catch(() => undefined);
    throw new Error(detail ?? `Request failed (${response.status})`);
  }
  return response;
}
