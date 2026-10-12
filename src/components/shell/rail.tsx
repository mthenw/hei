"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  isSectionActive,
  primarySections,
  type Section,
  settingsSection,
} from "./sections";
import { WithPathname } from "./with-pathname";

/** Desktop navigation: a thin icon rail on the left edge. */
export function Rail() {
  return (
    <WithPathname>
      {(pathname) => (
        <nav
          aria-label="Sections"
          className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-3 text-muted-foreground md:flex"
        >
          <Link
            href="/chat"
            aria-label="Hei"
            className="mb-3 flex size-8 items-center justify-center rounded-md bg-primary font-mono text-sm font-semibold text-primary-foreground"
          >
            h
          </Link>
          {primarySections.map((section) => (
            <RailLink
              key={section.href}
              section={section}
              active={isSectionActive(pathname, section)}
            />
          ))}
          <div className="mt-auto">
            <RailLink
              section={settingsSection}
              active={isSectionActive(pathname, settingsSection)}
            />
          </div>
        </nav>
      )}
    </WithPathname>
  );
}

function RailLink({ section, active }: { section: Section; active: boolean }) {
  const Icon = section.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant={active ? "secondary" : "ghost"} size="icon-lg">
          <Link href={section.href} aria-current={active ? "page" : undefined}>
            <Icon />
            <span className="sr-only">{section.label}</span>
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{section.label}</TooltipContent>
    </Tooltip>
  );
}
