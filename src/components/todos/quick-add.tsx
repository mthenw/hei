"use client";

import { PlusIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  MentionPopover,
  useMentionPicker,
} from "@/components/contacts/mention-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addTodo } from "@/lib/chat-api";
import { fromTyped } from "@/lib/mentions";
import type { Priority } from "@/todos/todos";
import { PrioritySelect } from "./priority-select";

/** A todo in one line: title, then optionally a date, a time and a priority. */
export function QuickAdd() {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [picked] = useState(() => new Map<string, number>());
  const picker = useMentionPicker<HTMLInputElement>({
    value: title,
    onValueChange: setTitle,
    picked,
  });

  async function add(event: FormEvent) {
    event.preventDefault();
    if (title.trim() === "" || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await addTodo({
        title: fromTyped(title, picked),
        dueDate: dueDate || null,
        dueTime: dueDate && dueTime ? dueTime : null,
        priority,
      });
      // Date and priority stay, for adding several alike.
      setTitle("");
      picked.clear();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={add} className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-2 sm:flex-row sm:items-center">
        <MentionPopover picker={picker}>
          <Input
            aria-label="New todo"
            placeholder="Add a todo"
            value={title}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            {...picker.fieldProps}
          />
        </MentionPopover>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
          <Input
            type="date"
            aria-label="Due date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="w-auto"
          />
          {dueDate && (
            <Input
              type="time"
              aria-label="Due time"
              value={dueTime}
              onChange={(event) => setDueTime(event.target.value)}
              className="w-auto"
            />
          )}
          <PrioritySelect value={priority} onChange={setPriority} />
          {/* Icon only on phones, so it fits beside the date and priority. */}
          <Button
            type="submit"
            aria-label="Add"
            disabled={title.trim() === "" || saving}
            className="ml-auto max-sm:size-9 max-sm:px-0 sm:ml-0"
          >
            <PlusIcon data-icon="inline-start" />
            <span className="max-sm:sr-only">Add</span>
          </Button>
        </div>
      </div>
      {error && <p className="px-1 text-xs text-destructive">{error}</p>}
    </form>
  );
}
