import { CalendarDaysIcon } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";
import { SectionLayout } from "@/components/shell/section-layout";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <SectionLayout title="Calendar">
      <ComingSoon
        icon={CalendarDaysIcon}
        title="Calendar"
        description="Connect your calendars and plan your week by talking to Hei. Coming soon."
      />
    </SectionLayout>
  );
}
