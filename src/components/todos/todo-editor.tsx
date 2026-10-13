"use client";

import { Trash2Icon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteTodo, updateTodo } from "@/lib/chat-api";
import type { Priority, Todo } from "@/todos/todos";
import { AgentPanel } from "./agent-panel";
import { PrioritySelect } from "./priority-select";

/** Edit every field of a todo, or delete it. */
export function TodoEditor({
  todo,
  onClose,
}: {
  /** The todo being edited; undefined closes the editor. */
  todo: Todo | undefined;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={todo !== undefined}
      onOpenChange={(open) => !open && onClose()}
    >
      {/* Never taller than the screen: a long agent result scrolls with the form. */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {/* Keyed by todo, so the form starts from the todo it opened on. */}
        {todo && <EditorForm key={todo.id} todo={todo} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditorForm({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes);
  const [dueDate, setDueDate] = useState(todo.dueDate ?? "");
  const [dueTime, setDueTime] = useState(todo.dueTime ?? "");
  const [priority, setPriority] = useState<Priority>(todo.priority);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    void run(() =>
      updateTodo(todo.id, {
        title,
        notes,
        dueDate: dueDate || null,
        dueTime: dueDate && dueTime ? dueTime : null,
        priority,
      }),
    );
  }

  return (
    // min-w-0: as a grid item the form would otherwise grow to fit a wide table in the agent's result.
    <form onSubmit={save} className="flex min-w-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Edit todo</DialogTitle>
        <DialogDescription className="sr-only">
          Change the todo’s title, notes, due date and priority.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="todo-title">Title</FieldLabel>
          <Input
            id="todo-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="todo-notes">Notes</FieldLabel>
          <Textarea
            id="todo-notes"
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="todo-date">Due date</FieldLabel>
            <Input
              id="todo-date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="todo-time">Time</FieldLabel>
            <Input
              id="todo-time"
              type="time"
              value={dueTime}
              disabled={dueDate === ""}
              onChange={(event) => setDueTime(event.target.value)}
            />
          </Field>
          <Field className="col-span-2 sm:col-span-1">
            <FieldLabel htmlFor="todo-priority">Priority</FieldLabel>
            <PrioritySelect
              id="todo-priority"
              value={priority}
              onChange={setPriority}
            />
          </Field>
        </div>
      </FieldGroup>
      <AgentPanel todo={todo} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter className="flex-row items-center justify-between">
        {confirmingDelete ? (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void run(() => deleteTodo(todo.id))}
          >
            <Trash2Icon data-icon="inline-start" />
            Delete for good
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2Icon data-icon="inline-start" />
            Delete
          </Button>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || title.trim() === ""}>
            Save
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
