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
An authorised link from Hei to an outside account, such as a ChatGPT plan or, later, a calendar account.
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

### Later versions

**Plan card**:
Hei's proposed calendar change, shown for Approve / Not now before anything is applied.

**Hand-off**:
Giving a todo to a background agent, which works on it in its own Conversation.
_Avoid_: Delegation
