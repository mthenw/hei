import type { ModelRef } from "@earendil-works/pi-durable";
import { nanoid } from "nanoid";
import type { ModelChoice } from "@/agent/model-catalog";
import type { ConnectionStatus } from "@/connections/connections";
import type { ProfileChange, ProfileData } from "@/profile/profile";

// Request ids make retries safe: the server admits a message with a given id once. nanoid rather than
// crypto.randomUUID(), which browsers expose only on HTTPS or localhost (not on the LAN dev address).
const newRequestId = () => nanoid();

export async function startChat(
  content: string,
  model?: ModelRef,
): Promise<number> {
  const response = await post("/api/chats", {
    content,
    requestId: newRequestId(),
    model,
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

export async function regenerateReply(chatId: number) {
  await post(`/api/chats/${chatId}/regenerate`, {
    requestId: newRequestId(),
  });
}

export async function stopChat(chatId: number) {
  await post(`/api/chats/${chatId}/stop`);
}

export async function renameChat(chatId: number, title: string) {
  await request("PATCH", `/api/chats/${chatId}`, { title });
}

export async function deleteChat(chatId: number) {
  await request("DELETE", `/api/chats/${chatId}`);
}

export async function setChatModel(chatId: number, model: ModelRef) {
  await request("PATCH", `/api/chats/${chatId}`, { model });
}

export type AvailableModels = {
  models: ModelChoice[];
  defaultModel: ModelRef;
};

export async function getModels(): Promise<AvailableModels> {
  return (await request("GET", "/api/models")).json();
}

export type ProfileResponse = {
  profile: ProfileData;
  defaultInstructions: string;
};

export async function getProfile(): Promise<ProfileResponse> {
  return (await request("GET", "/api/profile")).json();
}

export async function updateProfile(
  change: ProfileChange,
): Promise<ProfileData> {
  const { profile } = await (
    await request("PATCH", "/api/profile", change)
  ).json();
  return profile;
}

export async function getConnections(): Promise<ConnectionStatus> {
  return (await request("GET", "/api/connections")).json();
}

export async function startChatGPTSignIn(): Promise<{ authUrl: string }> {
  return (await post("/api/connections/chatgpt/sign-in")).json();
}

export async function finishChatGPTSignIn(redirectUrl: string) {
  await post("/api/connections/chatgpt/sign-in/finish", { redirectUrl });
}

export async function cancelChatGPTSignIn() {
  await request("DELETE", "/api/connections/chatgpt/sign-in");
}

export async function disconnectChatGPT() {
  await request("DELETE", "/api/connections/chatgpt");
}

function post(url: string, body?: unknown): Promise<Response> {
  return request("POST", url, body);
}

async function request(
  method: string,
  url: string,
  body?: unknown,
): Promise<Response> {
  const response = await fetch(url, {
    method,
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
