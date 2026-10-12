# Hei's own data lives in a separate SQLite database

Chats, profile, credentials, provider status — and later todos and calendar accounts — live in `app.sqlite` via Drizzle, beside pi-durable's `agent.sqlite`, rather than as typed pi-durable documents. pi-durable's storage is built for transcripts and checkpoints, has limited querying, and its API "changes without notice between releases"; keeping product data out of it gives real queries and migrations and insulates Hei from pi-durable churn. A chat row references its pi-durable conversation by id.

## Consequences

- Agent tools that change app data (e.g. todos in v3) write outside the Harness's transaction, so they are `replay: "unsafe"` unless written to be idempotent.
- Deleting a chat deletes in both stores.
