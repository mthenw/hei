"use client";

import type { ModelRef } from "@earendil-works/pi-durable";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { startChat } from "@/lib/chat-api";
import { ChatComposer } from "./chat-composer";
import { ModelPicker } from "./model-picker";
import { useModels } from "./models";

export function NewChat() {
  const router = useRouter();
  const { defaultModel } = useModels();
  // Until the user picks one, a new chat starts on whatever the default is when it is sent.
  const [picked, setPicked] = useState<ModelRef>();

  async function start(text: string) {
    const chatId = await startChat(text, picked);
    router.push(`/chat/${chatId}`);
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        What can I help with?
      </h1>
      <div className="w-full max-w-3xl">
        <ChatComposer
          onSend={start}
          tools={
            <ModelPicker value={picked ?? defaultModel} onChange={setPicked} />
          }
        />
      </div>
    </div>
  );
}
