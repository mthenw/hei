import type { ReactNode } from "react";

/** Title row at the top of a section sidebar, with optional actions on the right. */
export function SidebarHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 pr-2 pl-4">
      <h2 className="truncate text-sm font-medium">{title}</h2>
      {children}
    </div>
  );
}
