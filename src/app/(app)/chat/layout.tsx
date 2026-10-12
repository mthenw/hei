import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { SectionLayout } from "@/components/shell/section-layout";

export default function ChatLayout({ children }: LayoutProps<"/chat">) {
  return (
    <SectionLayout title="Chats" sidebar={<ChatSidebar />}>
      {children}
    </SectionLayout>
  );
}
