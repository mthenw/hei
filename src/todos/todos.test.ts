import { beforeEach, describe, expect, it } from "vitest";
import { openAppDatabase } from "@/db/database";
import { InvalidTodo, TodoNotFound, Todos } from "./todos";

let todos: Todos;
let clock: number;

beforeEach(async () => {
  // 13 Oct 2026, 23:30 in Warsaw: already the 14th there would be wrong, still the 13th is right.
  clock = Date.UTC(2026, 9, 13, 21, 30);
  todos = new Todos(await openAppDatabase(":memory:"), {
    timeZone: () => "Europe/Warsaw",
    now: () => clock,
  });
});

describe("Todos", () => {
  it("knows today in the Profile's time zone", () => {
    expect(todos.today()).toBe("2026-10-13");
    clock += 60 * 60 * 1000;
    expect(todos.today()).toBe("2026-10-14");
  });

  it("adds a todo with defaults and lists it", async () => {
    const todo = await todos.add({ title: "  Buy   milk " });

    expect(todo).toMatchObject({
      title: "Buy milk",
      notes: "",
      dueDate: null,
      dueTime: null,
      priority: "normal",
      done: false,
      agent: null,
    });
    expect(await todos.list()).toEqual({
      todos: [todo],
      today: "2026-10-13",
      timeZone: "Europe/Warsaw",
    });
  });

  it("marks a todo done and reopens it", async () => {
    const { id } = await todos.add({ title: "Call mum" });

    clock += 1000;
    const done = await todos.update(id, { done: true });
    expect(done).toMatchObject({ done: true, doneAt: clock });

    const reopened = await todos.update(id, { done: false });
    expect(reopened).toMatchObject({ done: false, doneAt: null });
  });

  it("clears the time with the date", async () => {
    const { id } = await todos.add({
      title: "Dentist",
      dueDate: "2026-10-17",
      dueTime: "14:30",
    });

    expect(await todos.update(id, { dueDate: null })).toMatchObject({
      dueDate: null,
      dueTime: null,
    });
  });

  it("rejects what it can't store", async () => {
    await expect(todos.add({ title: " " })).rejects.toSatisfy(InvalidTodo.is);
    await expect(
      todos.add({ title: "x", dueDate: "2026-02-30" }),
    ).rejects.toSatisfy(InvalidTodo.is);
    await expect(
      todos.add({ title: "x", dueDate: "2026-10-17", dueTime: "25:00" }),
    ).rejects.toSatisfy(InvalidTodo.is);
    await expect(todos.add({ title: "x", dueTime: "09:00" })).rejects.toSatisfy(
      InvalidTodo.is,
    );
    await expect(todos.update(404, { title: "x" })).rejects.toSatisfy(
      TodoNotFound.is,
    );
  });

  it("deletes a todo", async () => {
    const { id } = await todos.add({ title: "Old idea" });
    await todos.delete(id);

    expect((await todos.list()).todos).toEqual([]);
    await expect(todos.get(id)).rejects.toSatisfy(TodoNotFound.is);
  });

  it("never reuses an id", async () => {
    const first = await todos.add({ title: "First" });
    await todos.delete(first.id);
    const second = await todos.add({ title: "Second" });

    expect(second.id).toBeGreaterThan(first.id);
  });

  it("tells subscribers about changes and closings", async () => {
    let changes = 0;
    const closed: string[] = [];
    todos.subscribe(() => changes++);
    todos.onClosed((todo) => closed.push(todo.title));

    const a = await todos.add({ title: "A" });
    const b = await todos.add({ title: "B" });
    await todos.update(a.id, { done: true });
    // Done already: no second closing.
    await todos.update(a.id, { done: true });
    await todos.delete(b.id);

    expect(changes).toBe(5);
    expect(closed).toEqual(["A", "B"]);
  });

  it("keeps an agent's status on the todo", async () => {
    const { id } = await todos.add({ title: "Find a plumber" });
    await todos.setAgent(id, {
      status: "working",
      chatId: 7,
      handedOffAt: clock,
    });

    expect(await todos.byAgentChat(7)).toMatchObject({
      id,
      agent: { status: "working", chatId: 7, result: null, handedOffAt: clock },
    });
    expect(
      (await todos.withAgentStatus(["working"])).map((todo) => todo.id),
    ).toEqual([id]);
  });
});
