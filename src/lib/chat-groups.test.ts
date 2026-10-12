import { describe, expect, it } from "vitest";
import { groupChatsByDate } from "./chat-groups";

// Local times, so the test holds in any timezone.
const at = (day: number, hour: number) =>
  new Date(2026, 9, day, hour).getTime();
const now = new Date(2026, 9, 13, 9, 30);

const labels = (updatedAt: number[]) =>
  groupChatsByDate(
    updatedAt.map((time, id) => ({ id, updatedAt: time })),
    now,
  ).map((group) => [group.label, group.chats.map((chat) => chat.id)]);

describe("groupChatsByDate", () => {
  it("splits chats into Today, Yesterday, Last 7 days and Older", () => {
    expect(
      labels([
        at(13, 8), // this morning
        at(13, 0), // just after midnight
        at(12, 23), // late yesterday
        at(12, 0),
        at(7, 0), // six days ago
        at(6, 23), // seven days ago
      ]),
    ).toEqual([
      ["Today", [0, 1]],
      ["Yesterday", [2, 3]],
      ["Last 7 days", [4]],
      ["Older", [5]],
    ]);
  });

  it("leaves out empty groups", () => {
    expect(labels([at(13, 8), at(1, 8)])).toEqual([
      ["Today", [0]],
      ["Older", [1]],
    ]);
  });
});
