const MINUTE = 60 * 1000;

export type Limit = {
  kind: "usage_limit" | "credits" | "rate_limit" | "unavailable";
  /** How long to skip the provider before trying it again. */
  pauseMs: number;
  /** Completes "<account> …", e.g. "usage limit reached". */
  label: string;
};

/**
 * Which plan or account limit a model error reports, if any. Only these errors switch a chat to another provider; any
 * other failure is shown as it is.
 */
export function classifyLimit(errorText: string): Limit | undefined {
  // ChatGPT plan (Sign in with ChatGPT) and Codex usage windows; OpenAI gives no reset time.
  if (
    /subscription_sharing_usage_limit_exceeded|usage_limit_reached|usage limit/i.test(
      errorText,
    )
  )
    return {
      kind: "usage_limit",
      pauseMs: 30 * MINUTE,
      label: "usage limit reached",
    };
  // Anthropic API credits used up, or a spend cap reached; also OpenAI quota.
  if (
    /credit balance is too low|insufficient_quota|out of extra usage|spend limit|billing/i.test(
      errorText,
    )
  )
    return { kind: "credits", pauseMs: 60 * MINUTE, label: "credits used up" };
  // Still rate limited after pi-durable's retries.
  if (/rate_limit_error|rate.?limit|too many requests|\b429\b/i.test(errorText))
    return {
      kind: "rate_limit",
      pauseMs: 5 * MINUTE,
      label: "rate limit reached",
    };
  // ChatGPT plan usage temporarily unavailable, still failing after retries.
  if (/subscription_sharing_(usage|user)_unavailable/i.test(errorText))
    return {
      kind: "unavailable",
      pauseMs: 5 * MINUTE,
      label: "temporarily unavailable",
    };
  return undefined;
}

/** The account a provider stands for, in the words the UI uses. */
export function accountName(provider: string): string {
  if (provider === "openai") return "ChatGPT";
  if (provider === "anthropic") return "Claude";
  if (provider === "hei-dev") return "Dev model";
  return provider;
}
