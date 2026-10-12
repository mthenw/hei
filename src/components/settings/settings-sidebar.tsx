"use client";

import { PlugIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { isPathActive } from "@/components/shell/sections";
import { SidebarHeader } from "@/components/shell/sidebar-header";
import { WithPathname } from "@/components/shell/with-pathname";
import { Button } from "@/components/ui/button";

const pages = [
  { href: "/settings/profile", label: "Profile", icon: UserIcon },
  { href: "/settings/connections", label: "Connections", icon: PlugIcon },
];

export function SettingsSidebar() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarHeader title="Settings" />
      <WithPathname>
        {(pathname) => (
          <nav aria-label="Settings" className="flex flex-col gap-0.5 px-2">
            {pages.map((page) => {
              const Icon = page.icon;
              const active = isPathActive(pathname, page.href);
              return (
                <Button
                  key={page.href}
                  asChild
                  variant={active ? "secondary" : "ghost"}
                  className="justify-start"
                >
                  <Link
                    href={page.href}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon data-icon="inline-start" />
                    {page.label}
                  </Link>
                </Button>
              );
            })}
          </nav>
        )}
      </WithPathname>
    </div>
  );
}
