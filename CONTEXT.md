# Hei

A single-user personal assistant: chat, a calendar you can talk to, and a todo list whose items can be handed to agents.

## Language

### Conversations

**Chat**:
A user-visible thread in the sidebar, backed by exactly one pi-durable conversation.
_Avoid_: Thread, session

**Conversation**:
The pi-durable record behind a Chat — transcript, inbox, and run state. Used only when talking about the agent runtime.

**Run**:
One pass of the agent answering a submission, from first model request to settled result, possibly with many tool calls.
_Avoid_: Turn (a run contains turns)

**Follow-up**:
A message sent while a Run is in progress, queued to run after it.

**Regenerate**:
Answering a Chat's last message again, in place of its reply. The model never sees the reply it replaces.
_Avoid_: Retry (that is pi-durable retrying a failed model request by itself)

**Source**:
A web page a reply cites, shown as a numbered marker and a chip under the reply.
_Avoid_: Reference, link

### People and settings

**Profile**:
What Hei knows about the user that they wrote themselves — About me, timezone, language rule.

**Assistant instructions**:
The editable persona prompt that shapes how Hei behaves, kept apart from the Profile.
_Avoid_: System prompt (in user-facing text)

**Connection**:
An authorised link from Hei to an outside account, such as a ChatGPT plan or a calendar account.
_Avoid_: Integration

### Models

**Provider**:
A source of model access: ChatGPT (via Sign in with ChatGPT) or Claude (via API key).

**Failover**:
Switching a Chat to the other Provider after its current one hits a limit. Sticky: the Chat stays switched.
_Avoid_: Round robin

**Paused provider**:
A Provider Hei skips after a limit error until its pause expires or a probe succeeds.

**Side job**:
A small model task outside any Chat's Run, such as generating a Chat title.

### Todos

**Todo**:
An item on the Todos page: a title, notes, an optional due date and time, and a priority (high, normal or low).
_Avoid_: Task (a pi-durable task is something else)

**Hand-off**:
Giving a todo to an Agent.
_Avoid_: Delegation

**Agent**:
A Chat that works on a handed-off todo in the background, with one more extension than other chats. It reports its result on the todo or asks the user in its Chat.

**Agent status**:
Where a todo's Agent is: Queued, Working, Needs you, Ready for review, Failed or Stopped.

### Calendar

**Calendar account**:
A Google sign-in or an ICS link, with one or more calendars. A Google sign-in may also allow its contacts.
_Avoid_: Integration

**Plan card**:
Hei's proposed calendar changes, shown in a chat for Approve / Not now; nothing changes before Approve, and Undo reverses an applied plan.
_Avoid_: Suggestion

**Time block**:
An event made for a todo by dropping it on a time in the calendar, linked to that todo.

### Contacts

**Contact**:
A person from a Google account's contacts: a saved contact from the address book, or an other contact Gmail keeps from mail the user exchanged.
_Avoid_: Person (in code), address book entry

**Mention**:
A contact named in a message or todo with `@`, stored as `@[Name](contact:ID)` and shown as the tinted name.
_Avoid_: Tag

**Email draft**:
An email Hei wrote for the user to send, shown in a chat as a card with Open in Gmail and Copy text. Hei never sends email.
