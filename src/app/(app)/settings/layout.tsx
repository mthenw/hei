import { SettingsSidebar } from "@/components/settings/settings-sidebar";
import { SectionLayout } from "@/components/shell/section-layout";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <SectionLayout title="Settings" sidebar={<SettingsSidebar />}>
      {children}
    </SectionLayout>
  );
}
