import { ChatListProvider } from "@/components/chat/chat-list";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ModelsProvider } from "@/components/chat/models";
import { SectionLayout } from "@/components/shell/section-layout";

export default function ChatLayout({ children }: LayoutProps<"/chat">) {
  return (
    <ChatListProvider>
      <ModelsProvider>
        <SectionLayout title="Chats" sidebar={<ChatSidebar />}>
          {children}
        </SectionLayout>
      </ModelsProvider>
    </ChatListProvider>
  );
}
