import type { Metadata } from "next";
import { SectionLayout } from "@/components/shell/section-layout";
import { TodosView } from "@/components/todos/todos-view";

export const metadata: Metadata = { title: "Todos" };

export default function TodosPage() {
  return (
    <SectionLayout title="Todos">
      <TodosView />
    </SectionLayout>
  );
}
