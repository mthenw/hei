export type ChatGroup<T> = { label: string; chats: T[] };

/**
 * Group chats for the sidebar by when they were last active, in the viewer's local time: Today, Yesterday, Last 7 days,
 * Older. Expects chats newest first and keeps that order; empty groups are left out.
 */
export function groupChatsByDate<T extends { updatedAt: number }>(
  chats: readonly T[],
  now: Date = new Date(),
): ChatGroup<T>[] {
  // Calendar days rather than 24-hour steps, so daylight-saving changes don't move the boundaries.
  const startOfDay = (daysAgo: number) =>
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - daysAgo,
    ).getTime();
  const startOfToday = startOfDay(0);
  const startOfYesterday = startOfDay(1);
  const startOfWeek = startOfDay(6);

  const groups: ChatGroup<T>[] = [
    { label: "Today", chats: [] },
    { label: "Yesterday", chats: [] },
    { label: "Last 7 days", chats: [] },
    { label: "Older", chats: [] },
  ];
  for (const chat of chats) {
    const index =
      chat.updatedAt >= startOfToday
        ? 0
        : chat.updatedAt >= startOfYesterday
          ? 1
          : chat.updatedAt >= startOfWeek
            ? 2
            : 3;
    groups[index]?.chats.push(chat);
  }
  return groups.filter((group) => group.chats.length > 0);
}
