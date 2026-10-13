"use client";

import {
  ChevronDownIcon,
  GlobeIcon,
  LoaderCircleIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { SearchResult } from "@/agent/web/jina";
import type { WebToolDetails } from "@/agent/web/tools";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ToolPart } from "@/lib/chat-stream";
import { Favicon, hostOf } from "./sources";

export function isWebTool(part: ToolPart): boolean {
  return part.name === "web_search" || part.name === "web_fetch";
}

/** A web search or page read, in one line; a search opens to show what it found. */
export function WebToolView({ part }: { part: ToolPart }) {
  const working = part.status === "pending" || part.status === "running";
  const failed = part.status === "error" || part.status === "interrupted";
  const details = part.details as WebToolDetails | undefined;

  if (part.name === "web_search") {
    const query = String(part.args.query ?? "");
    const results = details?.kind === "search" ? details.results : [];
    const label = working ? (
      <Shimmer as="span">{`Searching “${query}”`}</Shimmer>
    ) : failed ? (
      `Couldn’t search “${query}”`
    ) : (
      `Searched “${query}” · ${results.length} ${results.length === 1 ? "result" : "results"}`
    );
    return (
      <Collapsible className="group/web not-prose">
        <CollapsibleTrigger
          disabled={working || results.length === 0}
          className="flex max-w-full items-center gap-2 text-sm text-muted-foreground enabled:hover:text-foreground"
        >
          <StatusIcon working={working} failed={failed} icon={<SearchIcon />} />
          <span className="truncate">{label}</span>
          {results.length > 0 && (
            <ChevronDownIcon className="size-3.5 shrink-0 transition-transform group-data-[state=open]/web:rotate-180" />
          )}
        </CollapsibleTrigger>
        {failed && <ToolError part={part} />}
        <CollapsibleContent>
          <ul className="mt-2 flex flex-col gap-1.5 border-l pl-4">
            {results.map((result) => (
              <SearchResultRow key={result.url} result={result} />
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  const url = String(part.args.url ?? "");
  const title = details?.kind === "page" ? details.title : hostOf(url);
  return (
    <div className="not-prose flex flex-col">
      <div className="flex max-w-full items-center gap-2 text-sm text-muted-foreground">
        <StatusIcon working={working} failed={failed} icon={<GlobeIcon />} />
        {working ? (
          <Shimmer as="span">{`Reading ${hostOf(url)}`}</Shimmer>
        ) : (
          <span className="flex min-w-0 items-center gap-1">
            {failed ? "Couldn’t read" : "Read"}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate underline-offset-2 hover:text-foreground hover:underline"
            >
              {title}
            </a>
          </span>
        )}
      </div>
      {failed && <ToolError part={part} />}
    </div>
  );
}

function SearchResultRow({ result }: { result: SearchResult }) {
  return (
    <li className="flex min-w-0 items-center gap-2 text-sm">
      <Favicon url={result.url} />
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        title={result.snippet}
        className="truncate text-foreground underline-offset-2 hover:underline"
      >
        {result.title}
      </a>
      <span className="shrink-0 text-xs text-muted-foreground">
        {hostOf(result.url)}
        {result.date && ` · ${result.date}`}
      </span>
    </li>
  );
}

function StatusIcon({
  working,
  failed,
  icon,
}: {
  working: boolean;
  failed: boolean;
  icon: ReactNode;
}) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5">
      {working ? (
        <LoaderCircleIcon className="animate-spin" />
      ) : failed ? (
        <TriangleAlertIcon className="text-destructive" />
      ) : (
        icon
      )}
    </span>
  );
}

function ToolError({ part }: { part: ToolPart }) {
  const message =
    part.status === "interrupted"
      ? "Interrupted before it finished."
      : part.result;
  if (!message) return null;
  return <p className="mt-1 pl-6 text-xs text-destructive">{message}</p>;
}
