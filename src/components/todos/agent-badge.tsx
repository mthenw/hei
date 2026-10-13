"use client";

import { BotIcon, LoaderCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentStatus, TodoAgent } from "@/todos/todos";

const STATUS: Record<AgentStatus, { label: string; className: string }> = {
  queued: { label: "Queued", className: "text-muted-foreground" },
  working: { label: "Working", className: "text-foreground" },
  needs_you: { label: "Needs you", className: "text-primary" },
  ready: { label: "Ready for review", className: "text-emerald-400" },
  failed: { label: "Failed", className: "text-destructive" },
  stopped: { label: "Stopped", className: "text-muted-foreground" },
};

export function agentStatusLabel(status: AgentStatus): string {
  return STATUS[status].label;
}

/** The agent's status in a few words, for a todo's row. */
export function AgentBadge({ agent }: { agent: TodoAgent }) {
  const { label, className } = STATUS[agent.status];
  return (
    <span className={cn("flex items-center gap-1", className)}>
      {agent.status === "working" ? (
        <LoaderCircleIcon className="size-3 animate-spin" />
      ) : (
        <BotIcon className="size-3" />
      )}
      {label}
    </span>
  );
}
