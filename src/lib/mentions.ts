/**
 * A mention of a contact in a chat message or a todo: "@[Anna Kowalska](contact:42)". The name keeps the text readable
 * anywhere Hei doesn't render mentions; the id is the contact's id in Hei. While typing, a mention is just "@Anna
 * Kowalska", and the names picked from the contact list turn into mentions when the text is saved or sent.
 */
const MENTION = /@\[([^[\]\n]+)\]\(contact:(\d+)\)/g;

export type Mention = { name: string; contactId: number };

/** Text and mentions, in order. */
export type MentionSegment = string | Mention;

/** Names picked while typing, and the contacts they stand for. */
export type PickedMentions = ReadonlyMap<string, number>;

export function mentionOf(name: string, contactId: number): string {
  return `@[${mentionName(name)}](contact:${contactId})`;
}

/** A name as a mention can carry it: one line, without brackets. */
export function mentionName(name: string): string {
  return name.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim();
}

export function splitMentions(text: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION)) {
    if (match.index > last) segments.push(text.slice(last, match.index));
    segments.push({ name: match[1], contactId: Number(match[2]) });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push(text.slice(last));
  return segments;
}

/** The contacts a text mentions, each once, in order. */
export function mentionedContacts(text: string): number[] {
  return [
    ...new Set([...text.matchAll(MENTION)].map((match) => Number(match[2]))),
  ];
}

/** Markdown with each mention as a link to "#contact-ID", which survives the markdown renderer's URL filter. */
export function mentionsAsLinks(markdown: string): string {
  return markdown.replace(
    MENTION,
    (_, name: string, id: string) => `[@${name}](#contact-${id})`,
  );
}

/** The text with each mention as the plain name, for places that don't show mentions, such as Google Calendar. */
export function withoutMentions(text: string): string {
  return text.replace(MENTION, (_, name: string) => name);
}

/** Text as the user types it: each mention as "@Name", and the names that stand for contacts. */
export function toTyped(text: string): {
  text: string;
  picked: PickedMentions;
} {
  const picked = new Map<string, number>();
  const typed = text.replace(MENTION, (_, name: string, id: string) => {
    picked.set(name, Number(id));
    return `@${name}`;
  });
  return { text: typed, picked };
}

/** Typed text with the picked names that are still in it turned back into mentions. */
export function fromTyped(text: string, picked: PickedMentions): string {
  if (picked.size === 0) return text;
  // Longest first, so "@Anna Kowalska" isn't taken as "@Anna" followed by text; a name ends where a word does.
  const names = [...picked.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `@(${names.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}_])`,
    "gu",
  );
  return text.replace(pattern, (whole, name: string) => {
    const id = picked.get(name);
    return id === undefined ? whole : mentionOf(name, id);
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A mention being typed: where its "@" is, and what follows it up to the caret. */
export type TypedMention = { start: number; query: string };

const MAX_QUERY = 40;

/**
 * The mention being typed before the caret: an "@" at the start of a word, then up to three words. "me@example.com"
 * is an address, and "@ " or a second space ends it.
 */
export function typingMention(
  value: string,
  caret: number,
): TypedMention | undefined {
  const before = value.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start === -1) return undefined;
  if (start > 0 && !/[\s([{"'“‘]/.test(before[start - 1])) return undefined;
  const query = before.slice(start + 1);
  if (
    query.length > MAX_QUERY ||
    /^\s|\s\s|[\n@]/.test(query) ||
    query.split(" ").length > 3
  )
    return undefined;
  return { start, query };
}
