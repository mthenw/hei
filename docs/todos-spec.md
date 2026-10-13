# Hei — Todos and hand-off

A todo list on the Todos page that Hei can manage from any chat, and hand-off: giving a todo to a background agent that works on it in its own chat. Built before the calendar (v2), so dragging todos onto the calendar waits for it. Decisions agreed on 13 October 2026; the questions were parked in [parked.md](./parked.md). Vocabulary in [CONTEXT.md](../CONTEXT.md).

## Todos

A **todo** has a title, notes, an optional due date with an optional time, a priority (high, normal or low; normal by default), and is open or done. Dates are local dates in the Profile's time zone.

### Todos page
- **Today** — open todos due today or earlier; overdue ones show their date in red.
- **Upcoming** — open todos due later, grouped by day ("Tomorrow", "Thu 16 Oct").
- **Someday** — open todos without a date.
- **Completed** — collapsed at the end: the 50 most recently done, newest first.
- Within a group: high priority first, then todos with a time by time, then the rest by creation. High shows a coral mark; low is dimmed.
- A quick-add field at the top adds a todo with a title, optional date and time, and priority. Clicking a todo opens an editor for every field, Delete, and the hand-off controls.
- Ticking the checkbox marks a todo done; unticking reopens it.
- The page is live: changes from a chat, an agent or another device appear at once.

### Under the chat list
The chat sidebar (the drawer on phones) ends with the open todos: Today, Upcoming and Someday, ticked or opened in the same editor. A one-line field adds a todo to Someday, and the header links to the Todos page. Chats and todos each take half of the sidebar's height and scroll on their own.

### Hei and todos
Every chat, hand-off agents included, gets the todo tools:
- `list_todos`, `add_todo`, `update_todo` (any field, done included), `delete_todo`, `hand_off_todo`.
- Hei adds, edits and completes todos when asked, without confirming first. Before deleting it asks in the chat.
- Each call shows in the chat as one line, e.g. "Added “Buy milk” · Fri 17 Oct", linking to the Todos page.

## Hand-off

Handing off a todo (from its editor, or by asking Hei) starts an **agent**: a chat of its own whose first message is the todo (title, date, priority, notes). The agent runs with Hei's tools (web, places, todos) on the default model, with failover, and may do anything those tools allow without asking.

| Agent status | Meaning |
|---|---|
| Queued | Waiting: two agents are working already. |
| Working | The agent is on it. |
| Needs you | It stopped to ask something; answer in its chat and it carries on. |
| Ready for review | It reported a result, shown on the todo. You mark the todo done. |
| Failed | A model error ended its run. Sending in its chat retries. |
| Stopped | You stopped it. Sending in its chat resumes. |

- **Asking.** When the agent needs a decision or something only the user knows, it asks one question and ends its turn; the todo shows "Needs you". A message in the agent's chat sets it working again.
- **Reporting.** The agent calls `report_result` with a short result (what it found or did, with links), which shows on the todo. It never marks the todo done.
- **At most two agents work at once**; further hand-offs wait in line in the order they were made, and start as running ones stop working. An agent waiting for the user doesn't count.
- **Its chat** is a normal chat in the sidebar, titled after the todo: open it to read the work, steer, stop, or regenerate.
- **Restarts.** pi-durable resumes a working agent's run; Hei follows it to its end and starts queued agents.
- Marking a todo done or deleting it stops its agent. The chat stays.
- No push notifications yet: they need Web Push, which needs HTTPS.

## Architecture

- `todos` table in `app.sqlite` ([ADR 0002](./adr/0002-separate-app-database.md)), with the agent's status, chat, result and hand-off time on the todo.
- `Todos` (`src/todos/todos.ts`) owns todo rows and notifies subscribers; the Todos page follows it over SSE like the chat list.
- `HandOffs` (`src/todos/hand-offs.ts`) starts agents through `Chats`, follows each run to its end, sets the status, and keeps the queue.
- Agents are chats configured with one more extension, `hand-off` (its instructions and `report_result`), added with pi-durable's per-conversation `extensions: { add }`; other chats never see it. [ADR 0006](./adr/0006-hand-off-agents-as-chats.md).

## Build order

1. **Todos** — table, `Todos`, API and live Todos page with quick add and editor.
2. **Hei's todo tools** — the `todos` extension and their one-line display in chats.
3. **Hand-off** — `HandOffs`, the `hand-off` extension, queue, status on the todo, `hand_off_todo`.
4. **Polish** — phone pass, smoke test, docs.

All four are in (13 October 2026). Tests cover the tools and every agent status with a scripted model: reporting, asking and answering, the queue, stopping, and keeping `report_result` out of other chats. The smoke test hands a todo to the dev model, which answers without reporting, so the agent ends at "Needs you". Not yet seen with a real model: an agent reporting a result, and Hei managing todos from a chat.
