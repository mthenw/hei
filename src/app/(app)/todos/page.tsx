import { ListTodoIcon } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";
import { SectionLayout } from "@/components/shell/section-layout";

export const metadata: Metadata = { title: "Todos" };

export default function TodosPage() {
  return (
    <SectionLayout title="Todos">
      <ComingSoon
        icon={ListTodoIcon}
        title="Todos"
        description="Keep a todo list and hand items to Hei to work on. Coming soon."
      />
    </SectionLayout>
  );
}
