const MAX_TITLE_LENGTH = 60;

/** A provisional title from the first message: its first line, cut at a word boundary. */
export function titleFromMessage(content: string): string {
  const firstLine =
    content
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .find((line) => line.length > 0) ?? "";
  if (firstLine.length === 0) return "New chat";
  if (firstLine.length <= MAX_TITLE_LENGTH) return firstLine;
  const cut = firstLine.slice(0, MAX_TITLE_LENGTH);
  // The cut may already end on a word; otherwise back up to the last word boundary, unless that leaves too little.
  const endsOnWord = firstLine[MAX_TITLE_LENGTH] === " ";
  const lastSpace = cut.lastIndexOf(" ");
  const words =
    endsOnWord || lastSpace <= MAX_TITLE_LENGTH / 2
      ? cut
      : cut.slice(0, lastSpace);
  return `${words.replace(/[\s.,;:!?-]+$/, "")}…`;
}
