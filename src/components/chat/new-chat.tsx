"use client";

import { useRouter } from "next/navigation";
import { startChat } from "@/lib/chat-api";
import { ChatComposer } from "./chat-composer";

export function NewChat() {
  const router = useRouter();

  async function start(text: string) {
    const chatId = await startChat(text);
    router.push(`/chat/${chatId}`);
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        What can I help with?
      </h1>
      <div className="w-full max-w-3xl">
        <ChatComposer onSend={start} />
      </div>
    </div>
  );
}
