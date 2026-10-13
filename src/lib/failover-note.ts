import type { ModelRef } from "@earendil-works/pi-durable";

/** Transcript entry kind Hei writes when a provider's limit stops a reply. */
export const FAILOVER_ENTRY = "hei.failover";

/**
 * What a failover entry records. With `to`, the chat switched to that model; with `resubmitted`, Hei sent that message
 * again on it, and the original is omitted from the model's context. Without `to`, there was nowhere to switch.
 */
export type FailoverNote = {
  /** e.g. "ChatGPT usage limit reached". */
  reason: string;
  to?: ModelRef;
  resubmitted?: string;
  /** What the user can do about it, when nothing could be switched to. */
  hint?: string;
};
