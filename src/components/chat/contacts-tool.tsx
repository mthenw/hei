"use client";

import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  MailIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import type {
  ContactToolDetails,
  EmailDraft,
  EmailRecipient,
} from "@/contacts/tools";
import type { ToolPart } from "@/lib/chat-stream";
import { StatusIcon, ToolError } from "./web-tool";

const CONTACT_TOOLS = new Set(["find_contacts", "draft_email"]);

export function isContactsTool(part: ToolPart): boolean {
  return CONTACT_TOOLS.has(part.name);
}

/** Looking someone up shows as one line; an email draft as a card to copy or open in Gmail. */
export function ContactsToolView({ part }: { part: ToolPart }) {
  const working = part.status === "pending" || part.status === "running";
  const failed = part.status === "error" || part.status === "interrupted";
  const details = part.details as ContactToolDetails | undefined;

  if (details?.kind === "email")
    return <EmailDraftCard draft={details.draft} account={details.account} />;

  const drafting = part.name === "draft_email";
  const label = working ? (
    <Shimmer as="span">
      {drafting ? "Writing the email" : "Looking through your contacts"}
    </Shimmer>
  ) : failed || details === undefined ? (
    drafting ? (
      "Couldn’t write the email"
    ) : (
      "Couldn’t look through your contacts"
    )
  ) : (
    `Looked for “${details.query}” in your contacts · ${details.count === 0 ? "nobody" : details.count === 1 ? "1 person" : `${details.count} people`}`
  );
  return (
    <div className="not-prose flex flex-col">
      <div className="flex max-w-full items-center gap-2 text-sm text-muted-foreground">
        <StatusIcon
          working={working}
          failed={failed}
          icon={drafting ? <MailIcon /> : <UsersIcon />}
        />
        <span className="truncate">{label}</span>
      </div>
      {failed && <ToolError part={part} />}
    </div>
  );
}

/** An email for the user to send: Copy takes the body, Open in Gmail opens a filled-in message. */
function EmailDraftCard({
  draft,
  account,
}: {
  draft: EmailDraft;
  account: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.warn("Could not copy the email:", error);
    }
  }

  return (
    <div className="not-prose flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2 text-sm">
        <MailIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 font-medium">
          {draft.subject || "(No subject)"}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">To</dt>
        <dd className="min-w-0 break-words">{recipients(draft.to)}</dd>
        {draft.cc.length > 0 && (
          <>
            <dt className="text-muted-foreground">Cc</dt>
            <dd className="min-w-0 break-words">{recipients(draft.cc)}</dd>
          </>
        )}
      </dl>
      <p className="max-h-80 overflow-y-auto border-t pt-3 text-sm whitespace-pre-wrap">
        {draft.body}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" asChild>
          <a
            href={gmailCompose(draft, account)}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLinkIcon data-icon="inline-start" />
            Open in Gmail
          </a>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void copy()}>
          {copied ? (
            <CheckIcon data-icon="inline-start" />
          ) : (
            <CopyIcon data-icon="inline-start" />
          )}
          {copied ? "Copied" : "Copy text"}
        </Button>
      </div>
    </div>
  );
}

function recipients(list: EmailRecipient[]): string {
  return list
    .map((recipient) =>
      recipient.name
        ? `${recipient.name} <${recipient.email}>`
        : recipient.email,
    )
    .join(", ");
}

/** Gmail's compose window, filled in, in the Google account Hei is connected to. */
function gmailCompose(draft: EmailDraft, account: string | null): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: draft.to.map((recipient) => recipient.email).join(","),
    ...(draft.cc.length > 0
      ? { cc: draft.cc.map((recipient) => recipient.email).join(",") }
      : {}),
    su: draft.subject,
    body: draft.body,
    ...(account ? { authuser: account } : {}),
  });
  return `https://mail.google.com/mail/?${params}`;
}
