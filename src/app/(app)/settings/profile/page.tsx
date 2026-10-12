import { UserIcon } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <ComingSoon
      icon={UserIcon}
      title="Profile"
      description="Tell Hei about yourself, your timezone and how it should behave. Coming soon."
    />
  );
}
