"use client";

import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import type { Contact } from "@/contacts/contacts";
import { searchContacts } from "@/lib/chat-api";
import { mentionName, type TypedMention, typingMention } from "@/lib/mentions";
import { cn } from "@/lib/utils";

type Field = HTMLInputElement | HTMLTextAreaElement;

/** How long typing pauses before the contacts are searched. */
const SEARCH_DELAY = 80;

export type MentionPicker<T extends Field> = {
  /** Spread on the input or textarea. */
  fieldProps: {
    ref: RefObject<T | null>;
    onChange: (event: ChangeEvent<T>) => void;
    onSelect: (event: { currentTarget: T }) => void;
    onKeyDown: (event: KeyboardEvent<T>) => void;
    onBlur: () => void;
    // A text box that suggests: it keeps its role, so it reads as the field it is.
    "aria-autocomplete": "list";
    "aria-controls": string | undefined;
    "aria-activedescendant": string | undefined;
  };
  open: boolean;
  /** What follows the "@"; empty right after typing it. */
  query: string;
  results: Contact[];
  active: number;
  listId: string;
  setActive: (index: number) => void;
  pick: (contact: Contact) => void;
  dismiss: () => void;
};

/**
 * "@" in a text field lists matching contacts; picking one writes "@Name" and records the contact in `picked`, so
 * `fromTyped` can turn it into a mention when the text is sent or saved.
 */
export function useMentionPicker<T extends Field>({
  value,
  onValueChange,
  picked,
}: {
  value: string;
  onValueChange: (value: string) => void;
  /** Names picked so far, and their contacts; picking adds to it. */
  picked: Map<string, number>;
}): MentionPicker<T> {
  const ref = useRef<T>(null);
  const listId = useId();
  const [typing, setTyping] = useState<TypedMention>();
  // Escape closes the list until the caret leaves that mention.
  const [dismissed, setDismissed] = useState<number>();
  const [results, setResults] = useState<Contact[]>([]);
  const [active, setActive] = useState(0);
  // Where the caret goes once the picked name is in the field.
  const caretAfter = useRef<number>(undefined);

  // "@Anna Kowalska " right after picking her, or in a todo being edited, is a mention already: no list for it.
  const finished =
    typing !== undefined &&
    [...picked.keys()].some((name) => typing.query.startsWith(`${name} `));
  const query = finished ? "" : (typing?.query.trim() ?? "");
  useEffect(() => {
    if (query === "") {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchContacts(query, controller.signal).then(
        (found) => {
          setResults(found);
          setActive(0);
        },
        () => undefined,
      );
    }, SEARCH_DELAY);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useLayoutEffect(() => {
    const at = caretAfter.current;
    if (at === undefined) return;
    caretAfter.current = undefined;
    ref.current?.setSelectionRange(at, at);
  });

  const open =
    typing !== undefined &&
    !finished &&
    typing.start !== dismissed &&
    (query === "" || results.length > 0);

  function track(field: T) {
    const caret = field.selectionStart;
    const next =
      caret !== null && caret === field.selectionEnd
        ? typingMention(field.value, caret)
        : undefined;
    setTyping((current) =>
      current?.start === next?.start && current?.query === next?.query
        ? current
        : next,
    );
    if (next === undefined) setDismissed(undefined);
  }

  function pick(contact: Contact) {
    const field = ref.current;
    if (field === null || typing === undefined) return;
    const name = mentionName(contact.name);
    const caret = field.selectionStart ?? value.length;
    const rest = value.slice(caret);
    // One space after the name, whether it was there already or not; the caret goes past it.
    const insert = rest.startsWith(" ") ? `@${name}` : `@${name} `;
    picked.set(name, contact.id);
    caretAfter.current = typing.start + `@${name} `.length;
    onValueChange(value.slice(0, typing.start) + insert + rest);
    setTyping(undefined);
    setResults([]);
  }

  function dismiss() {
    if (typing) setDismissed(typing.start);
  }

  function onKeyDown(event: KeyboardEvent<T>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return;
    }
    if (results.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + results.length) % results.length);
    } else if (
      (event.key === "Enter" &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing) ||
      event.key === "Tab"
    ) {
      event.preventDefault();
      pick(results[Math.min(active, results.length - 1)]);
    }
  }

  return {
    fieldProps: {
      ref,
      onChange: (event) => {
        onValueChange(event.currentTarget.value);
        track(event.currentTarget);
      },
      onSelect: (event) => track(event.currentTarget),
      onKeyDown,
      onBlur: () => setTyping(undefined),
      "aria-autocomplete": "list",
      "aria-controls": open ? listId : undefined,
      "aria-activedescendant":
        open && results.length > 0 ? `${listId}-${active}` : undefined,
    },
    open,
    query,
    results,
    active,
    listId,
    setActive,
    pick,
    dismiss,
  };
}

/** The contacts list, beside the field it belongs to. `children` is the field. */
export function MentionPopover<T extends Field>({
  picker,
  side = "bottom",
  children,
}: {
  picker: MentionPicker<T>;
  side?: "top" | "bottom";
  children: ReactNode;
}) {
  return (
    <Popover
      open={picker.open}
      onOpenChange={(open) => {
        if (!open) picker.dismiss();
      }}
    >
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        side={side}
        align="start"
        sideOffset={6}
        // The field keeps the focus: typing goes on, and the arrows and Enter work the list.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (picker.fieldProps.ref.current?.contains(event.target as Node))
            event.preventDefault();
        }}
        className="w-72 max-w-[calc(100vw-2rem)] p-1"
      >
        {picker.query === "" ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Type a name to mention someone
          </p>
        ) : (
          <div id={picker.listId} role="listbox" aria-label="Contacts">
            {picker.results.map((contact, index) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: the field keeps the focus and handles the keys: the arrows move through the list and Enter picks.
              <div
                key={contact.id}
                id={`${picker.listId}-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === picker.active}
                // Keep the focus in the field.
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => picker.setActive(index)}
                onClick={() => picker.pick(contact)}
                className={cn(
                  "flex cursor-default flex-col rounded-sm px-2 py-1.5",
                  index === picker.active && "bg-accent",
                )}
              >
                <span className="truncate text-sm">{contact.name}</span>
                {(contact.emails[0] || contact.organization) && (
                  <span className="truncate text-xs text-muted-foreground">
                    {[contact.emails[0], contact.organization]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
