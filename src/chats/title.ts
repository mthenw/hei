const MAX_TITLE_LENGTH = 60;

/** Instructions for the side-job model that titles a chat after its first exchange. */
export const TITLE_INSTRUCTIONS = [
  "Write a title for this chat between a user and their assistant.",
  "Use at most six words, in the language of the user's message.",
  'Name the topic, not the request: "Team dinner venue", not "User asks for a restaurant".',
  "Reply with the title only: no quotes, no trailing punctuation.",
].join("\n");

/** The input the title model sees: the opening exchange, trimmed to keep the request small. */
export function titleInput(firstMessage: string, answer: string): string {
  return `User: ${firstMessage.slice(0, 2000)}\n\nAssistant: ${answer.slice(0, 2000)}`;
}

/** A model's reply cleaned into a title, or nothing if it isn't usable. */
export function cleanTitle(reply: string): string | undefined {
  const title = firstLine(reply)
    .replace(/^(title:\s*)/i, "")
    .replace(/^["'“”‘’`*_#]+|["'“”‘’`*_]+$/g, "")
    .replace(/[\s.;:]+$/, "")
    .trim();
  if (title.length === 0) return undefined;
  return title.length <= MAX_TITLE_LENGTH ? title : titleFromMessage(title);
}

/** A provisional title from the first message: its first line, cut at a word boundary. */
export function titleFromMessage(content: string): string {
  const line = firstLine(content);
  if (line.length === 0) return "New chat";
  if (line.length <= MAX_TITLE_LENGTH) return line;
  const cut = line.slice(0, MAX_TITLE_LENGTH);
  // The cut may already end on a word; otherwise back up to the last word boundary, unless that leaves too little.
  const endsOnWord = line[MAX_TITLE_LENGTH] === " ";
  const lastSpace = cut.lastIndexOf(" ");
  const words =
    endsOnWord || lastSpace <= MAX_TITLE_LENGTH / 2
      ? cut
      : cut.slice(0, lastSpace);
  return `${words.replace(/[\s.,;:!?-]+$/, "")}…`;
}

function firstLine(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .find((line) => line.length > 0) ?? ""
  );
}
