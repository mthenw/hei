"use client";

import { GlobeIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useState,
} from "react";
import { MentionChip } from "@/components/contacts/mention-text";
import type { Citation, Citations } from "@/lib/citations";
import { cn } from "@/lib/utils";

const CitationsContext = createContext<Citations | undefined>(undefined);

/** Makes a reply's citation numbers available to the links rendered inside it. */
export function CitationsProvider({
  citations,
  children,
}: {
  citations: Citations;
  children: ReactNode;
}) {
  return <CitationsContext value={citations}>{children}</CitationsContext>;
}

/**
 * Streamdown's link renderer: a link to one of the reply's sources becomes its number, any other link opens in a new
 * tab as usual. Reads the numbers from context, so it stays current while the reply streams.
 */
export function CitationLink({
  href,
  children,
  // The markdown renderer passes its syntax-tree node; it is not an <a> attribute.
  node: _node,
  ...props
}: ComponentProps<"a"> & { node?: unknown }) {
  const citations = useContext(CitationsContext);
  // A mention of a contact, from mentionsAsLinks.
  if (href?.startsWith("#contact-"))
    return <MentionChip>{children}</MentionChip>;
  const number = href ? citations?.numberOf(href) : undefined;
  if (href && number !== undefined)
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={typeof children === "string" ? children : href}
        className="mx-0.5 inline-flex h-4 min-w-4 -translate-y-px items-center justify-center rounded-sm bg-muted px-1 align-middle font-mono text-[10px] text-muted-foreground no-underline hover:bg-primary hover:text-primary-foreground"
      >
        {number}
      </a>
    );
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2"
      {...props}
    >
      {children}
    </a>
  );
}

/** The cited pages under a reply, numbered as in the text. */
export function SourceChips({ cited }: { cited: Citation[] }) {
  if (cited.length === 0) return null;
  return (
    <ol aria-label="Sources" className="flex flex-wrap gap-1.5">
      {cited.map((source) => (
        <li key={source.url}>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title={source.title}
            className="flex max-w-56 items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <span className="font-mono text-[10px]">{source.number}</span>
            <Favicon url={source.url} />
            <span className="truncate">{hostOf(source.url)}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

/** A site's icon, fetched from the site itself; a globe when it has none. */
export function Favicon({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const host = hostOf(url);
  if (failed || host === url)
    return <GlobeIcon className={cn("size-3.5 shrink-0", className)} />;
  return (
    // biome-ignore lint/performance/noImgElement: a tiny icon from an arbitrary site; next/image would need every host allowed.
    <img
      src={`https://${host}/favicon.ico`}
      alt=""
      width={14}
      height={14}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("size-3.5 shrink-0 rounded-sm", className)}
    />
  );
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
