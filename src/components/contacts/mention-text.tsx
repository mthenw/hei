import { Fragment, type ReactNode } from "react";
import { splitMentions } from "@/lib/mentions";

/** Text with its mentions of contacts shown as names: a message, a todo's title. */
export function MentionText({ text }: { text: string }) {
  return (
    <>
      {splitMentions(text).map((segment, index) =>
        typeof segment === "string" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the segments of one text; they only change with the text.
          <Fragment key={index}>{segment}</Fragment>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: as above.
          <MentionChip key={index}>@{segment.name}</MentionChip>
        ),
      )}
    </>
  );
}

/** A mentioned person: their name, tinted with the accent. */
export function MentionChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-sm bg-primary/15 px-0.5 font-medium text-primary">
      {children}
    </span>
  );
}
