import type { Metadata } from "next";

export const metadata: Metadata = { title: "New chat" };

export default function NewChatPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        What can I help with?
      </h1>
    </div>
  );
}
