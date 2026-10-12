import { defineExtension, section } from "@earendil-works/pi-durable";

const PREAMBLE = [
  "You are Hei, a personal assistant for one person.",
  "Answer first and keep it brief. Skip filler.",
  "Reply in the language the user writes in.",
].join("\n");

/** Hei's own prompt sections, and later its tools. */
export const HeiExtension = defineExtension({
  name: "hei",
  sections: [section("preamble", () => PREAMBLE, { tag: false })],
});
