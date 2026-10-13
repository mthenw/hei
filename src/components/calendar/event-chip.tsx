"use client";

import { ExternalLinkIcon, MapPinIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type {
  CalendarColor,
  CalendarEvent,
  CalendarSummary,
} from "@/calendar/calendars";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatWhen } from "@/lib/calendar-format";
import { clockTime } from "@/lib/calendar-layout";
import { cn } from "@/lib/utils";

/** The calendar's colour as a CSS variable, for the chip's bar and tint. */
export function colorStyle(color: CalendarColor | undefined): CSSProperties {
  return { "--cal": `var(--cal-${color ?? "blue"})` } as CSSProperties;
}

/** An event in the grid: a tinted chip with a bar in its calendar's colour; click for details. */
export function EventChip({
  event,
  calendar,
  timeZone,
  compact = false,
  className,
  style,
}: {
  event: CalendarEvent;
  calendar: CalendarSummary | undefined;
  timeZone: string;
  /** One line, for the month grid and the all-day row. */
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          style={{ ...colorStyle(calendar?.color), ...style }}
          className={cn(
            "flex min-w-0 flex-col overflow-hidden rounded-[5px] border-l-[3px] border-(--cal) bg-[color-mix(in_oklab,var(--cal)_24%,var(--background))] px-1.5 text-left text-xs leading-tight text-foreground hover:bg-[color-mix(in_oklab,var(--cal)_34%,var(--background))]",
            compact ? "py-0.5" : "py-1",
            className,
          )}
        >
          <span className="truncate font-medium">
            {compact && !event.allDay && (
              <span className="mr-1 font-normal text-muted-foreground tabular-nums">
                {clockTime(event.start, timeZone)}
              </span>
            )}
            {event.title}
          </span>
          {!compact && !event.allDay && (
            <span className="truncate text-muted-foreground tabular-nums">
              {clockTime(event.start, timeZone)}–
              {clockTime(event.end, timeZone)}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <EventDetails event={event} calendar={calendar} timeZone={timeZone} />
      </PopoverContent>
    </Popover>
  );
}

function EventDetails({
  event,
  calendar,
  timeZone,
}: {
  event: CalendarEvent;
  calendar: CalendarSummary | undefined;
  timeZone: string;
}) {
  return (
    <div
      className="flex flex-col gap-2 text-sm"
      style={colorStyle(calendar?.color)}
    >
      <p className="font-medium">{event.title}</p>
      <p className="text-muted-foreground">{formatWhen(event, timeZone)}</p>
      {calendar && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-(--cal)" />
          {calendar.name}
        </p>
      )}
      {event.location && (
        <Detail icon={<MapPinIcon className="size-3.5" />}>
          {event.location}
        </Detail>
      )}
      {event.notes && (
        <p className="line-clamp-6 text-xs whitespace-pre-wrap text-muted-foreground">
          {event.notes}
        </p>
      )}
      {event.url && (
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Open in {calendar?.writable ? "Google Calendar" : "its calendar"}
          <ExternalLinkIcon className="size-3" />
        </a>
      )}
    </div>
  );
}

function Detail({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}
