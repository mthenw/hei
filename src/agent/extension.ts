import type { Message } from "@earendil-works/pi-ai";
import {
  defineExtension,
  type Extension,
  GenerationTask,
  hook,
  section,
} from "@earendil-works/pi-durable";
import { DEFAULT_TIME_ZONE, todayLine } from "./today";

/** Hei's behaviour until the user writes their own assistant instructions. */
export const DEFAULT_INSTRUCTIONS = [
  "Answer first and keep it brief. Skip filler.",
  "Before doing anything that changes something outside this chat, such as sending, booking, buying or deleting, ask first.",
].join("\n");

/** What the prompt needs from the user's Profile. */
export type Persona = {
  about: string;
  timeZone: string;
  replyLanguage: string | null;
  instructions: string | null;
};

export type PersonaSource = { get(): Persona };

const DEFAULT_PERSONA: Persona = {
  about: "",
  timeZone: DEFAULT_TIME_ZONE,
  replyLanguage: null,
  instructions: null,
};

/**
 * Hei's own prompt, from the user's Profile: who Hei is and how it behaves, what the user said about themselves, and
 * today's date. Each user message is stamped with the local time it was sent, for the request only; the stamp depends on
 * the message alone, so earlier requests' cached context stays valid. Read on every request, so Profile edits apply to
 * the next one.
 */
export function heiExtension(
  persona: PersonaSource = { get: () => DEFAULT_PERSONA },
  now: () => Date = () => new Date(),
): Extension {
  return defineExtension({
    name: "hei",
    sections: [
      section("preamble", () => preamble(persona.get()), { tag: false }),
      section("about_user", () => aboutUser(persona.get())),
      section("today", () => todayLine(now(), persona.get().timeZone)),
    ],
    hooks: [
      hook(GenerationTask, {
        beforeRequest: (request) => ({
          messages: stampUserMessages(request.messages, persona.get().timeZone),
        }),
      }),
    ],
  });
}

function preamble(persona: Persona): string {
  return [
    "You are Hei, a personal assistant for one person.",
    persona.instructions ?? DEFAULT_INSTRUCTIONS,
    persona.replyLanguage
      ? `Always reply in ${persona.replyLanguage}, whatever language the user writes in.`
      : "Reply in the language the user writes in.",
    "Each user message starts with the local date and time it was sent, in <sent> tags; the user doesn't see them.",
  ].join("\n");
}

function aboutUser(persona: Persona): string | undefined {
  if (persona.about === "") return undefined;
  return `What the user has told you about themselves:\n${persona.about}`;
}

/** Prefix every user message with its send time, e.g. "<sent>13 Oct 2026, 11:42</sent>". */
export function stampUserMessages(
  messages: readonly Message[],
  timeZone: string,
): Message[] {
  const format = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
  return messages.map((message) => {
    if (message.role !== "user" || !message.timestamp) return message;
    const stamp = {
      type: "text" as const,
      text: `<sent>${format.format(message.timestamp)}</sent>`,
    };
    const content =
      typeof message.content === "string"
        ? [{ type: "text" as const, text: message.content }]
        : message.content;
    return { ...message, content: [stamp, ...content] };
  });
}
