"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  CalendarEvent,
  CalendarOverview,
  CalendarSummary,
} from "@/calendar/calendars";
import { getCalendarEvents, getCalendarOverview } from "@/lib/chat-api";

type CalendarData = {
  overview: CalendarOverview | undefined;
  /** Bumped by the server after every change; views reload their events when it moves. */
  version: number;
  calendarsById: Map<number, CalendarSummary>;
  reload: () => void;
};

const CalendarContext = createContext<CalendarData | null>(null);

/** The accounts and calendars for everything under it, kept current through one connection. */
export function CalendarProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<CalendarOverview>();
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => {
    getCalendarOverview().then(setOverview, (error) =>
      console.warn("Could not load the calendars:", error),
    );
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/calendar/changes");
    source.onmessage = () => {
      setVersion((current) => current + 1);
      reload();
    };
    return () => source.close();
  }, [reload]);

  const value = useMemo(() => {
    const calendarsById = new Map(
      (overview?.accounts ?? []).flatMap((account) =>
        account.calendars.map((calendar) => [calendar.id, calendar] as const),
      ),
    );
    return { overview, version, calendarsById, reload };
  }, [overview, version, reload]);
  return <CalendarContext value={value}>{children}</CalendarContext>;
}

export function useCalendar(): CalendarData {
  const data = useContext(CalendarContext);
  if (data === null)
    throw new Error("useCalendar must be used inside CalendarProvider");
  return data;
}

/** Events of visible calendars between two instants, reloaded whenever the calendar changes. */
export function useCalendarEvents(
  from: number | undefined,
  to: number | undefined,
): CalendarEvent[] | undefined {
  const { version } = useCalendar();
  const [loaded, setLoaded] = useState<{
    key: string;
    events: CalendarEvent[];
  }>();
  const key = `${from}-${to}`;

  useEffect(() => {
    if (from === undefined || to === undefined) return;
    let current = true;
    // version is a dependency on purpose: a change on the server reloads the range.
    void version;
    getCalendarEvents(from, to).then(
      (events) => {
        if (current) setLoaded({ key: `${from}-${to}`, events });
      },
      (error) => console.warn("Could not load events:", error),
    );
    return () => {
      current = false;
    };
  }, [from, to, version]);

  // Keep showing the last range's events while the next loads, so moving between weeks doesn't flash empty.
  return loaded?.key === key ? loaded.events : loaded?.events;
}
