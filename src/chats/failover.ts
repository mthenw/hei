import type { ModelRef } from "@earendil-works/pi-durable";
import type { Agent, ChatId, Message, Sent } from "@/agent";
import { accountName, classifyLimit } from "@/agent/limits";
import type { ProviderPauses } from "@/agent/provider-pauses";

/** At most this many switches for one message; with two accounts, one is all there is to try. */
const MAX_SWITCHES = 2;

/**
 * Moves a chat to another account when its provider hits a limit (ADR 0004). The switch sticks: the chat stays on the
 * new model until the user changes it.
 */
export class Failover {
  constructor(
    private readonly agent: Agent,
    private readonly pauses: ProviderPauses,
  ) {}

  /** Before sending, move a chat off a paused provider, if another account can take it. */
  async beforeSend(chatId: ChatId): Promise<void> {
    const model = await this.agent.chatModel(chatId);
    if (model === undefined) return;
    const pause = this.pauses.active(model.provider);
    if (pause === undefined) return;
    const backup = await this.agent.catalog.backupFor(model);
    // Nowhere to go: send anyway, and let the paused provider answer if it has recovered.
    if (backup === undefined) return;
    await this.agent.setModel(chatId, backup);
    await this.agent.writeFailover(chatId, {
      reason: `${accountName(model.provider)} ${pause.reason}`,
      to: backup,
    });
  }

  /**
   * Follow a sent message to its answer. When a provider limit stops the reply, pause that provider, switch the chat
   * to another account and send the message again there. Resolves to the final answer's text, if any.
   */
  async deliver(
    chatId: ChatId,
    message: Message,
    sent: Sent,
    switches = 0,
  ): Promise<string | undefined> {
    const settled = await sent.settled();
    if (settled.status === "done") return settled.answer;
    if (settled.reason !== "model_error" || switches >= MAX_SWITCHES)
      return undefined;
    const limit = classifyLimit(settled.detail ?? "");
    if (limit === undefined) return undefined;
    const model = await this.agent.chatModel(chatId);
    if (model === undefined) return undefined;

    await this.pauses.pause(model.provider, limit.pauseMs, limit.label);
    const reason = `${accountName(model.provider)} ${limit.label}`;
    const backup = await this.agent.catalog.backupFor(model);
    if (backup === undefined) {
      await this.agent.writeFailover(chatId, {
        reason,
        hint: await this.hintFor(model),
      });
      return undefined;
    }

    await this.agent.setModel(chatId, backup);
    // The failed message is sent again; the note hides the first copy from the model.
    await this.agent.writeFailover(
      chatId,
      { reason, to: backup, resubmitted: message.content },
      settled.entry,
    );
    const again = {
      content: message.content,
      requestId: `${message.requestId}:switch${switches + 1}`,
    };
    return this.deliver(
      chatId,
      again,
      await this.agent.send(chatId, again),
      switches + 1,
    );
  }

  /** What the user can do when no other account could take over. */
  private async hintFor(failed: ModelRef): Promise<string> {
    const other = (await this.agent.catalog.available()).find(
      (choice) =>
        choice.provider !== failed.provider && choice.family !== "Development",
    );
    if (other !== undefined) {
      const pause = this.pauses.active(other.provider);
      if (pause !== undefined)
        return `${accountName(other.provider)} is paused too (${pause.reason}). Try again later.`;
    }
    if (failed.provider === "openai")
      return "Add ANTHROPIC_API_KEY to .env so Hei can switch to Claude, or try again later.";
    if (failed.provider === "anthropic")
      return "Connect ChatGPT in Settings → Connections so Hei can switch to it, or try again later.";
    return "Try again later.";
  }
}
