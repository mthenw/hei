import { defineExtension, section } from "@earendil-works/pi-durable";
import { todayLine } from "./today";

const PREAMBLE = [
  "You are Hei, a personal assistant for one person.",
  "Answer first and keep it brief. Skip filler.",
  "Reply in the language the user writes in.",
].join("\n");

/** Hei's own persona; capabilities such as web access come as separate extensions. */
export const HeiExtension = defineExtension({
  name: "hei",
  sections: [
    section("preamble", () => PREAMBLE, { tag: false }),
    // Without the date the model guesses, and "this weekend" searches land in the wrong month.
    section("today", () => todayLine(new Date())),
  ],
});
