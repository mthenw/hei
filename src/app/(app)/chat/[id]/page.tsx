import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChatView } from "@/components/chat/chat-view";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage({ params }: PageProps<"/chat/[id]">) {
  // Under Cache Components params are request data, so reading them needs a Suspense boundary.
  return (
    <Suspense>
      <ChatFromParams params={params} />
    </Suspense>
  );
}

async function ChatFromParams({
  params,
}: Pick<PageProps<"/chat/[id]">, "params">) {
  const { id } = await params;
  const chatId = Number(id);
  if (!Number.isSafeInteger(chatId) || chatId <= 0) notFound();
  return <ChatView key={chatId} chatId={chatId} />;
}
