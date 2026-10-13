# Model access: ChatGPT Plus via Sign in with ChatGPT first, Claude via API key as backup

Hei uses the user's ChatGPT Plus plan through OpenAI's Sign in with ChatGPT (pi-ai `openai` provider) as the default, and Claude through a personal pay-as-you-go `ANTHROPIC_API_KEY` (~$20/month spend cap) as the backup and for side jobs. It never uses Claude subscription OAuth.

pi-ai can log in with a Claude Pro/Max/Team subscription, but only by presenting itself as Claude Code (Claude Code's OAuth client id, user-agent, system prompt and tool names). Anthropic's terms forbid third-party apps from routing requests through plan credentials or misrepresenting their identity, and Anthropic enforces it by billing such traffic as extra usage or rejecting it. OpenAI explicitly allows plan usage via Sign in with ChatGPT for personal projects that run locally or self-hosted. Claude stays second because its budget is real money; the ChatGPT plan is already paid for.

## Considered options

- **Claude Team plan API credits** ($20 per Standard seat, pooled across the team) — compliant, but they belong to the team's shared balance and need a Team Owner to link a Console org.
- **pi-ai `openai-codex` provider** — uses the Codex CLI's client id against ChatGPT's private backend; OpenAI's docs direct third parties to Sign in with ChatGPT instead.

## Consequences

- Failover is Hei's job: pi-durable has no cross-provider fallback. Hei matches limit errors on an `unanswered` run, calls `conversation.configure()` with the other model and resubmits. pi-ai rewrites cross-provider history (thinking → text, tool-call ids normalised), at the cost of the prompt cache.
- Sign in with ChatGPT needs a stable per-install device id and returns only to `127.0.0.1:1455`, so the Connections page also accepts a pasted redirect URL.
- A publicly hosted Hei would fall outside OpenAI's personal-project allowance.
- pi-ai will use a Claude subscription if it finds one, so Hei closes both ways in: its credential store refuses to store a sign-in for any provider except `openai`, and the auth context it gives pi-ai hides `ANTHROPIC_OAUTH_TOKEN`.

Sources: [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance), [API credits for Max and Team plans](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers), [Sign in with ChatGPT](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt), [SIWC errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery).
