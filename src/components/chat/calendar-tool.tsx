"use client";

import {
  ArrowRightIcon,
  CalendarDaysIcon,
  CalendarPlusIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PlanChange, PlanView } from "@/calendar/plans";
import type { CalendarToolDetails } from "@/calendar/tools";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { formatWhen } from "@/lib/calendar-format";
import { decideCalendarPlan, getCalendarPlan } from "@/lib/chat-api";
import type { ToolPart } from "@/lib/chat-stream";
import { StatusIcon, ToolError } from "./web-tool";

const CALENDAR_TOOLS = new Set([
  "list_events",
  "find_free_time",
  "propose_calendar_changes",
]);

export function isCalendarTool(part: ToolPart): boolean {
  return CALENDAR_TOOLS.has(part.name);
}

/** Reading the calendar shows as one line; a proposed plan as a card to approve. */
export function CalendarToolView({ part }: { part: ToolPart }) {
  const working = part.status === "pending" || part.status === "running";
  const failed = part.status === "error" || part.status === "interrupted";
  const details = part.details as CalendarToolDetails | undefined;

  if (part.name === "propose_calendar_changes" && details?.kind === "plan")
    return <PlanCard planId={details.planId} />;

  const label = working ? (
    <Shimmer as="span">
      {part.name === "propose_calendar_changes"
        ? "Preparing a plan"
        : "Looking at your calendar"}
    </Shimmer>
  ) : failed ? (
    part.name === "propose_calendar_changes" ? (
      "Couldn’t prepare the plan"
    ) : (
      "Couldn’t read your calendar"
    )
  ) : details?.kind === "calendar" && details.action === "free" ? (
    `Looked for free time · ${details.count} ${details.count === 1 ? "slot" : "slots"}`
  ) : (
    `Looked at your calendar · ${details?.kind === "calendar" ? details.count : 0} ${details?.kind === "calendar" && details.count === 1 ? "event" : "events"}`
  );
  return (
    <div className="not-prose flex flex-col">
      <Link
        href="/calendar"
        className="flex max-w-full items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <StatusIcon
          working={working}
          failed={failed}
          icon={<CalendarDaysIcon />}
        />
        <span className="truncate">{label}</span>
      </Link>
      {failed && <ToolError part={part} />}
    </div>
  );
}

const STATUS: Record<PlanView["status"], string> = {
  pending: "",
  applied: "Done",
  dismissed: "Not now",
  undone: "Undone",
  failed: "Stopped",
};

/** Hei's proposed changes: nothing happens until Approve; once applied, Undo reverses them. */
function PlanCard({ planId }: { planId: number }) {
  const [plan, setPlan] = useState<PlanView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let current = true;
    getCalendarPlan(planId).then(
      (loaded) => current && setPlan(loaded),
      (cause) =>
        current &&
        setError(cause instanceof Error ? cause.message : String(cause)),
    );
    return () => {
      current = false;
    };
  }, [planId]);

  async function decide(decision: "approve" | "dismiss" | "undo") {
    setBusy(true);
    setError(undefined);
    try {
      setPlan(await decideCalendarPlan(planId, decision));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  if (plan === undefined)
    return error ? <p className="text-sm text-destructive">{error}</p> : null;
  const canUndo =
    plan.status === "applied" ||
    (plan.status === "failed" && plan.error !== null);
  return (
    <div className="not-prose flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2 text-sm">
        <CalendarPlusIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 font-medium">{plan.summary}</span>
        {STATUS[plan.status] && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {STATUS[plan.status]}
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {plan.changes.map((change, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a plan's changes never change order.
          <ChangeRow key={index} change={change} timeZone={plan.timeZone} />
        ))}
      </ul>
      {(plan.error || error) && (
        <p className="text-xs text-destructive">{plan.error ?? error}</p>
      )}
      {plan.status === "pending" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void decide("approve")}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void decide("dismiss")}
          >
            Not now
          </Button>
        </div>
      )}
      {canUndo && (
        <Button
          size="sm"
          variant="outline"
          className="w-fit"
          disabled={busy}
          onClick={() => void decide("undo")}
        >
          Undo
        </Button>
      )}
    </div>
  );
}

function ChangeRow({
  change,
  timeZone,
}: {
  change: PlanChange;
  timeZone: string;
}) {
  const Icon =
    change.action === "create"
      ? PlusIcon
      : change.action === "move"
        ? ArrowRightIcon
        : Trash2Icon;
  const when =
    change.action === "move"
      ? `${formatWhen({ allDay: change.allDay, ...change.from }, timeZone)} → ${formatWhen({ allDay: change.allDay, ...change.to }, timeZone)}`
      : formatWhen(change, timeZone);
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon
        className={
          change.action === "delete"
            ? "mt-0.5 size-3.5 shrink-0 text-destructive"
            : "mt-0.5 size-3.5 shrink-0 text-muted-foreground"
        }
      />
      <span className="flex min-w-0 flex-col">
        <span
          className={
            change.action === "delete"
              ? "line-through decoration-muted-foreground"
              : undefined
          }
        >
          {change.title}
        </span>
        <span className="text-xs text-muted-foreground">
          {when} · {change.calendarName}
        </span>
      </span>
    </li>
  );
}
