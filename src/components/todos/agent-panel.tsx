"use client";

import { BotIcon, MessageSquareIcon, SquareIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { handOffTodo, stopTodoAgent } from "@/lib/chat-api";
import type { Todo } from "@/todos/todos";
import { AgentBadge } from "./agent-badge";

/** A todo's agent: hand it off, follow it, stop it, and read what it reported. */
export function AgentPanel({ todo }: { todo: Todo }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const agent = todo.agent;
  const active = agent?.status === "queued" || agent?.status === "working";

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <BotIcon className="size-4" />
          Agent
          {agent && (
            <span className="text-xs font-normal">
              <AgentBadge agent={agent} />
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {agent?.chatId != null && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/chat/${agent.chatId}`}>
                <MessageSquareIcon data-icon="inline-start" />
                Open chat
              </Link>
            </Button>
          )}
          {active ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void act(() => stopTodoAgent(todo.id))}
            >
              <SquareIcon data-icon="inline-start" />
              Stop
            </Button>
          ) : (
            !todo.done && (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void act(() => handOffTodo(todo.id))}
              >
                <BotIcon data-icon="inline-start" />
                {agent ? "Hand off again" : "Hand off"}
              </Button>
            )
          )}
        </div>
      </div>
      {agent === null && (
        <p className="text-xs text-muted-foreground">
          An agent works on this in a chat of its own, asks you there if it
          needs to, and reports back here.
        </p>
      )}
      {agent?.status === "queued" && (
        <p className="text-xs text-muted-foreground">
          Two agents are working; this one starts when one of them finishes.
        </p>
      )}
      {agent?.status === "needs_you" && (
        <p className="text-xs text-muted-foreground">
          It has a question for you in its chat.
        </p>
      )}
      {agent?.status === "failed" && agent.error && (
        <p className="text-xs text-destructive">{agent.error}</p>
      )}
      {agent?.result && (
        // Reports are read in a small panel: headings at text size.
        <div className="max-h-60 min-w-0 overflow-y-auto text-sm [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-sm [&_h4]:text-sm">
          <MessageResponse>{agent.result}</MessageResponse>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
