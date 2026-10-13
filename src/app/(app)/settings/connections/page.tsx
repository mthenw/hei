import type { Metadata } from "next";
import { ConnectionsPanel } from "@/components/settings/connections-panel";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsPage() {
  return <ConnectionsPanel />;
}
