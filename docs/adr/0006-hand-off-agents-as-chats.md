# Hand-off agents are chats with one more extension

A handed-off todo gets an agent that is an ordinary Chat: a row in `chats` and a top-level, ownerless pi-durable conversation, started through `Chats` like any chat. What makes it an agent is one extra extension, `hand-off` — instructions for working on a todo and the `report_result` tool — added to that conversation alone with `configure({ extensions: { add: [handOff] } })`. The Harness's default extension list leaves `hand-off` out, so other chats never see it.

Being a chat gives the agent everything chats already have, for free: the sidebar, live streaming, stop, regenerate, failover to the other account, resume after a restart, and a place for the user to answer when it asks something. The user can open it and steer it like any conversation.

`report_result` finds its todo through the calling conversation's ID (`ToolExecutionApi.conversationId`), which is the chat's ID.

## Considered options

- **Task-owned subagent conversations** (pi-durable's background subagent pattern) — the agent's lifetime ties to a parent task, which a todo is not; it would also need its own UI to watch and steer.
- **A chat with agent instructions** in the conversation's own `instructions` field — that would carry the text, but offers no way to give `report_result` to agents alone.
- **Chats with an added extension (chosen, 2026-10-13).**

## Consequences

- Agent status lives on the todo (`HandOffs` derives it from each run's end: reported, asked, failed or stopped), not in pi-durable.
- The concurrency limit (two working agents) is Hei's: pi-durable runs every conversation it is given.
- Agent chats appear in the sidebar among other chats.
