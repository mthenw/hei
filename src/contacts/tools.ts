import { type Message, Type } from "@earendil-works/pi-ai";
import {
  defineExtension,
  defineTool,
  type Extension,
  GenerationTask,
  hook,
  section,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import { mentionedContacts, mentionOf, splitMentions } from "@/lib/mentions";
import type { Contact, Contacts } from "./contacts";

export type EmailRecipient = { name: string | null; email: string };

/** An email Hei wrote for the user to send. */
export type EmailDraft = {
  to: EmailRecipient[];
  cc: EmailRecipient[];
  subject: string;
  body: string;
};

/** What a contacts tool's result carries for the chat. */
export type ContactToolDetails =
  | { kind: "contacts"; query: string; count: number }
  | {
      kind: "email";
      draft: EmailDraft;
      /** The Google account to open Gmail in, when one is connected. */
      account: string | null;
    };

/** How Hei should treat mentions, look people up, and write email. */
export const CONTACTS_INSTRUCTIONS = [
  "The user can mention people from their contacts, written @[Name](contact:ID). A user message that mentions someone ends with their details in <contacts> tags, which the user doesn't see.",
  "find_contacts looks people up by name, address or company. Use it when the user names someone without a mention, or when you need the details of someone mentioned elsewhere, such as in a todo.",
  "When you add or change a todo about someone in the contacts, mention them in it the same way, e.g. “Call @[Anna Kowalska](contact:42)”. In replies and calendar events, write names plainly.",
  "To write an email for the user, call draft_email. The user sees the draft as a card with Copy and Open in Gmail, so don't repeat it in your reply. Hei can't send email; the user sends it from Gmail.",
].join("\n");

const MAX_FOUND = 10;
const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/;

export type ContactsExtensionOptions = {
  /** The Google account to open Gmail drafts in. */
  gmailAccount?: () => Promise<string | null>;
};

/** Contacts as an extension: the tools, the instructions, and the details of mentioned people. Every chat gets it. */
export function contactsExtension(
  contacts: Contacts,
  options: ContactsExtensionOptions = {},
): Extension {
  return defineExtension({
    name: "contacts",
    tools: contactTools(contacts, options),
    sections: [section("contacts", () => CONTACTS_INSTRUCTIONS)],
    hooks: [
      hook(GenerationTask, {
        beforeRequest: async (request) => {
          const ids = new Set(
            request.messages.flatMap((message) =>
              message.role === "user" ? mentionedContacts(textOf(message)) : [],
            ),
          );
          if (ids.size === 0) return undefined;
          const found = await contacts.get([...ids]);
          return {
            messages: addContactDetails(
              request.messages,
              new Map(found.map((contact) => [contact.id, contact])),
            ),
          };
        },
      }),
    ],
  });
}

export function contactTools(
  contacts: Contacts,
  options: ContactsExtensionOptions = {},
): ToolRegistration[] {
  const findContacts = defineTool({
    name: "find_contacts",
    description:
      "Find people in the user's contacts by name, email address or company. Each has an id, addresses, phone numbers and organization, and the mention to use for them in a todo.",
    parameters: Type.Object({
      query: Type.String({ description: "A name, address or company." }),
    }),
    replay: "safe",
    execute: async (args) => {
      const found = await contacts.search(args.query, MAX_FOUND);
      const details: ContactToolDetails = {
        kind: "contacts",
        query: args.query,
        count: found.length,
      };
      return {
        content: [
          {
            type: "text",
            text:
              found.length === 0
                ? `No contacts match “${args.query}”. If the user has none yet, they can connect Google in Settings → Connections.`
                : found.map(contactLine).join("\n"),
          },
        ],
        details,
      };
    },
  });

  const draftEmail = defineTool({
    name: "draft_email",
    description:
      "Show the user an email to send: a card with the recipients, subject and body, and buttons to copy it or open it in Gmail. Nothing is sent.",
    parameters: Type.Object({
      to: Type.Array(
        Type.String({
          description:
            "An address, or a contact's mention, @[Name](contact:ID), for their first address.",
        }),
        { minItems: 1 },
      ),
      cc: Type.Optional(Type.Array(Type.String())),
      subject: Type.String(),
      body: Type.String({
        description:
          "Plain text with the greeting and sign-off, in the language the user wants it in.",
      }),
    }),
    replay: "safe",
    execute: async (args) => {
      const recipients = async (values: string[]) =>
        Promise.all(values.map((value) => recipient(value, contacts)));
      const draft: EmailDraft = {
        to: await recipients(args.to),
        cc: await recipients(args.cc ?? []),
        subject: args.subject.trim(),
        body: args.body.trim(),
      };
      const details: ContactToolDetails = {
        kind: "email",
        draft,
        account: (await options.gmailAccount?.()) ?? null,
      };
      return {
        content: [
          {
            type: "text",
            text: `The user sees the draft to ${draft.to.map(addressLine).join(", ")} with Copy and Open in Gmail.`,
          },
        ],
        details,
      };
    },
  });

  return [findContacts, draftEmail];
}

/**
 * Each user message that mentions contacts gets their details at its end, for this request only. They depend on the
 * message and the contacts alone, so earlier requests' cached context stays valid until a contact changes.
 */
export function addContactDetails(
  messages: readonly Message[],
  contacts: ReadonlyMap<number, Contact>,
): Message[] {
  return messages.map((message) => {
    if (message.role !== "user") return message;
    const mentions = splitMentions(textOf(message)).filter(
      (segment) => typeof segment !== "string",
    );
    if (mentions.length === 0) return message;
    const seen = new Set<number>();
    const lines = mentions.flatMap(({ name, contactId }) => {
      if (seen.has(contactId)) return [];
      seen.add(contactId);
      const contact = contacts.get(contactId);
      return [
        contact
          ? contactLine(contact)
          : `${mentionOf(name, contactId)} is no longer in the contacts.`,
      ];
    });
    const details = {
      type: "text" as const,
      text: `<contacts>\n${lines.join("\n")}\n</contacts>`,
    };
    const content =
      typeof message.content === "string"
        ? [{ type: "text" as const, text: message.content }]
        : message.content;
    return { ...message, content: [...content, details] };
  });
}

/** "@[Anna Kowalska](contact:42): anna@acme.com, +48 600 100 200; CFO, Acme" */
function contactLine(contact: Contact): string {
  const reach = [...contact.emails, ...contact.phones];
  return [
    `${mentionOf(contact.name, contact.id)}: ${reach.length > 0 ? reach.join(", ") : "no address or phone"}`,
    contact.organization,
    contact.saved ? undefined : "from Gmail, not saved in the contacts",
  ]
    .filter(Boolean)
    .join("; ");
}

/** An address as given, "Name <address>", or a mention of a contact with an address. */
async function recipient(
  value: string,
  contacts: Contacts,
): Promise<EmailRecipient> {
  const text = value.trim();
  const mention = splitMentions(text).find(
    (segment) => typeof segment !== "string",
  );
  if (mention) {
    const [contact] = await contacts.get([mention.contactId]);
    if (contact === undefined)
      throw new Error(`${mention.name} is no longer in the contacts.`);
    if (contact.emails.length === 0)
      throw new Error(`${contact.name} has no email address in the contacts.`);
    return { name: contact.name, email: contact.emails[0] };
  }
  const named = /^(.*?)\s*<([^<>]+)>$/.exec(text);
  const email = (named?.[2] ?? text).trim();
  if (!EMAIL.test(email))
    throw new Error(
      `“${value}” isn't an email address or a contact's mention.`,
    );
  return { name: named?.[1].trim().replace(/^"|"$/g, "") || null, email };
}

function addressLine(recipient: EmailRecipient): string {
  return recipient.name
    ? `${recipient.name} <${recipient.email}>`
    : recipient.email;
}

function textOf(message: Message): string {
  if (message.role !== "user") return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n");
}
