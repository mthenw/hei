"use client";

import { SectionLayout } from "@/components/shell/section-layout";
import { CalendarSidebar } from "./calendar-sidebar";
import { CalendarView } from "./calendar-view";
import { CalendarProvider } from "./use-calendar";

export function CalendarPage() {
  return (
    <CalendarProvider>
      <SectionLayout title="Calendar" sidebar={<CalendarSidebar />}>
        <CalendarView />
      </SectionLayout>
    </CalendarProvider>
  );
}
