"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isSectionActive, primarySections, settingsSection } from "./sections";

const tabs = [...primarySections, settingsSection];

/** Phone navigation: a tab bar along the bottom edge, above the home indicator. */
export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="flex shrink-0 border-t bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = isSectionActive(pathname, tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            data-active={active}
            className="group relative flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground data-[active=true]:text-foreground"
          >
            <span
              aria-hidden
              className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary opacity-0 group-data-[active=true]:opacity-100"
            />
            <Icon className="size-5" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
