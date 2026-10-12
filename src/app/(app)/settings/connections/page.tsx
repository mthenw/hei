import { PlugIcon } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsPage() {
  return (
    <ComingSoon
      icon={PlugIcon}
      title="Connections"
      description="Connect your ChatGPT plan and check which API keys are configured. Coming soon."
    />
  );
}
