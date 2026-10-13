"use client";

import {
  CheckIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CALENDAR_COLORS, type CalendarSummary } from "@/calendar/calendars";
import { SidebarHeader } from "@/components/shell/sidebar-header";
import { TodoEditor } from "@/components/todos/todo-editor";
import { useTodoList } from "@/components/todos/use-todo-list";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { syncCalendars, updateCalendar } from "@/lib/chat-api";
import { formatDue } from "@/lib/todo-dates";
import { compareTodos } from "@/lib/todo-groups";
import { cn } from "@/lib/utils";
import { colorStyle } from "./event-chip";
import { TodoChip } from "./todo-chip";
import { useCalendar } from "./use-calendar";

/** The connected calendars: show or hide each, recolour it, pick the one new events go to. */
export function CalendarSidebar() {
  const { overview } = useCalendar();
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    try {
      await syncCalendars();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarHeader title="Calendars">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={syncing}
              onClick={() => void sync()}
            >
              <RefreshCwIcon className={cn(syncing && "animate-spin")} />
              <span className="sr-only">Sync now</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Sync now</TooltipContent>
        </Tooltip>
      </SidebarHeader>
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
        <div className="flex flex-col gap-4 px-2 pb-4">
          {overview?.accounts.map((account) => (
            <section key={account.id} className="flex flex-col gap-0.5">
              <h3 className="flex items-center gap-1 truncate px-2 py-1 text-xs font-medium text-muted-foreground">
                {account.name}
                {account.error && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TriangleAlertIcon className="size-3 shrink-0 text-destructive" />
                    </TooltipTrigger>
                    <TooltipContent>{account.error}</TooltipContent>
                  </Tooltip>
                )}
              </h3>
              {account.calendars.map((calendar) => (
                <CalendarRow key={calendar.id} calendar={calendar} />
              ))}
            </section>
          ))}
          <SidebarTodoList />
          <Button
            asChild
            variant="ghost"
            className="justify-start font-normal text-muted-foreground"
          >
            <Link href="/settings/connections">
              <PlusIcon data-icon="inline-start" />
              Connect a calendar
            </Link>
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}

function CalendarRow({ calendar }: { calendar: CalendarSummary }) {
  const change = (update: Parameters<typeof updateCalendar>[1]) =>
    updateCalendar(calendar.id, update).catch((error) =>
      console.warn("Could not change the calendar:", error),
    );

  return (
    <div
      style={colorStyle(calendar.color)}
      className="group/calendar flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
    >
      <Checkbox
        checked={calendar.visible}
        onCheckedChange={(checked) =>
          void change({ visible: checked === true })
        }
        aria-label={`Show ${calendar.name}`}
        className="border-(--cal) data-checked:border-(--cal) data-checked:bg-(--cal) dark:data-checked:bg-(--cal)"
      />
      <span className="min-w-0 flex-1 truncate text-sm">{calendar.name}</span>
      {calendar.isDefault && (
        <span className="text-[10px] text-muted-foreground">default</span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 group-hover/calendar:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
          >
            <MoreHorizontalIcon />
            <span className="sr-only">Options for {calendar.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Colour</DropdownMenuLabel>
            {CALENDAR_COLORS.map((color) => (
              <DropdownMenuItem
                key={color}
                onSelect={() => void change({ color })}
              >
                <span
                  style={colorStyle(color)}
                  className="size-3 rounded-full bg-(--cal)"
                />
                <span className="capitalize">{color}</span>
                {calendar.color === color && <CheckIcon className="ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {calendar.writable && !calendar.isDefault && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => void change({ isDefault: true })}
              >
                Use for new events
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Open todos, dated ones first, to drag onto the calendar: a time gets a block, a day a due date. */
function SidebarTodoList() {
  const { todos, today } = useTodoList();
  const [editing, setEditing] = useState<number>();
  const open = todos
    .filter((todo) => !todo.done)
    .sort(
      (a, b) =>
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
        compareTodos(a, b),
    );

  return (
    <section className="flex flex-col gap-1">
      <h3 className="flex items-baseline gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
        Todos
        <span className="font-normal">drag onto the calendar</span>
      </h3>
      {open.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">Nothing to do.</p>
      ) : (
        open.map((todo) => (
          <div key={todo.id} className="flex items-center gap-2 px-1">
            <TodoChip
              todo={todo}
              onOpen={setEditing}
              className="min-w-0 flex-1 py-1"
            />
            {todo.dueDate && today && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {formatDue(todo.dueDate, todo.dueTime, today)}
              </span>
            )}
          </div>
        ))
      )}
      <TodoEditor
        todo={todos.find((todo) => todo.id === editing)}
        onClose={() => setEditing(undefined)}
      />
    </section>
  );
}
