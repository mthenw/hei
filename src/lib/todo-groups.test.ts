import { describe, expect, it } from "vitest";
import { addDays, formatDue, isDate, localDate } from "./todo-dates";
import { type Groupable, groupTodos } from "./todo-groups";

const TODAY = "2026-10-13";

let created = 0;
function todo(
  name: string,
  fields: Partial<Groupable> = {},
): Groupable & { name: string } {
  return {
    name,
    dueDate: null,
    dueTime: null,
    priority: "normal",
    done: false,
    doneAt: null,
    createdAt: ++created,
    ...fields,
  };
}

const names = (todos: { name: string }[]) => todos.map((t) => t.name);

describe("groupTodos", () => {
  it("puts overdue and today's todos in Today, the rest by day and without a date", () => {
    const groups = groupTodos(
      [
        todo("later", { dueDate: "2026-10-16" }),
        todo("someday"),
        todo("tomorrow", { dueDate: "2026-10-14" }),
        todo("overdue", { dueDate: "2026-10-10" }),
        todo("today", { dueDate: TODAY }),
      ],
      TODAY,
    );

    expect(names(groups.today)).toEqual(["overdue", "today"]);
    expect(groups.upcoming.map((day) => [day.label, names(day.todos)])).toEqual(
      [
        ["Tomorrow", ["tomorrow"]],
        ["Fri 16 Oct", ["later"]],
      ],
    );
    expect(names(groups.someday)).toEqual(["someday"]);
  });

  it("orders by priority, then time, then creation", () => {
    const groups = groupTodos(
      [
        todo("low", { dueDate: TODAY, priority: "low" }),
        todo("untimed", { dueDate: TODAY }),
        todo("afternoon", { dueDate: TODAY, dueTime: "15:00" }),
        todo("morning", { dueDate: TODAY, dueTime: "09:00" }),
        todo("high", { dueDate: TODAY, priority: "high" }),
      ],
      TODAY,
    );

    expect(names(groups.today)).toEqual([
      "high",
      "morning",
      "afternoon",
      "untimed",
      "low",
    ]);
  });

  it("lists done todos apart, most recently done first", () => {
    const groups = groupTodos(
      [
        todo("done first", { done: true, doneAt: 1, dueDate: TODAY }),
        todo("open", { dueDate: TODAY }),
        todo("done last", { done: true, doneAt: 2 }),
      ],
      TODAY,
    );

    expect(names(groups.today)).toEqual(["open"]);
    expect(names(groups.completed)).toEqual(["done last", "done first"]);
  });
});

describe("todo dates", () => {
  it("reads dates in a time zone and moves across months", () => {
    expect(localDate(Date.UTC(2026, 9, 13, 22, 30), "Europe/Warsaw")).toBe(
      "2026-10-14",
    );
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isDate("2026-02-29")).toBe(false);
    expect(isDate("2028-02-29")).toBe(true);
  });

  it("says due dates as people do", () => {
    expect(formatDue(TODAY, null, TODAY)).toBe("Today");
    expect(formatDue("2026-10-14", "09:30", TODAY)).toBe("Tomorrow 09:30");
    expect(formatDue("2026-10-12", null, TODAY)).toBe("Yesterday");
    expect(formatDue("2026-10-20", null, TODAY)).toBe("Tue 20 Oct");
    expect(formatDue("2027-01-05", null, TODAY)).toBe("Tue 5 Jan 2027");
  });
});
