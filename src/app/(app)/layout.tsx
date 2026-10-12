import { BottomTabs } from "@/components/shell/bottom-tabs";
import { Rail } from "@/components/shell/rail";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <Rail />
      <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
      <BottomTabs />
    </div>
  );
}
