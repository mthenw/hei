"use client";

import { PanelLeftIcon } from "lucide-react";
import { type MouseEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type SectionLayoutProps = {
  title: string;
  /** Section sidebar: a column beside the content on desktop, a drawer on phones. */
  sidebar?: ReactNode;
  children: ReactNode;
};

export function SectionLayout({
  title,
  sidebar,
  children,
}: SectionLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Picking a link in the drawer navigates away, so the drawer should close.
  function closeOnLinkClick(event: MouseEvent) {
    if ((event.target as HTMLElement).closest("a")) setDrawerOpen(false);
  }

  return (
    <>
      {sidebar && (
        <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
          {sidebar}
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b pt-[env(safe-area-inset-top)] md:hidden">
          <div className="flex h-12 items-center gap-1 px-2">
            {sidebar && (
              <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <PanelLeftIcon />
                    <span className="sr-only">Open {title}</span>
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  showCloseButton={false}
                  className="w-72 bg-sidebar p-0 pt-[env(safe-area-inset-top)]"
                  onClickCapture={closeOnLinkClick}
                >
                  <SheetTitle className="sr-only">{title}</SheetTitle>
                  {sidebar}
                </SheetContent>
              </Sheet>
            )}
            <span className="truncate px-1 text-sm font-medium">{title}</span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </>
  );
}
