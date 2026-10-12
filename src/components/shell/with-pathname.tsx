"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, Suspense } from "react";

type Render = (pathname: string | undefined) => ReactNode;

/**
 * Render navigation that highlights the current path. Under Cache Components the pathname of a dynamic route is request
 * data, so it streams in behind Suspense; until then nothing is highlighted.
 */
export function WithPathname({ children }: { children: Render }) {
  return (
    <Suspense fallback={children(undefined)}>
      <CurrentPathname render={children} />
    </Suspense>
  );
}

function CurrentPathname({ render }: { render: Render }) {
  return render(usePathname());
}
