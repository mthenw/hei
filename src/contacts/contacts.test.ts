import { beforeEach, describe, expect, it } from "vitest";
import { CONTACTS_SCOPE, OTHER_CONTACTS_SCOPE } from "@/calendar/google";
import { type AppDatabase, openAppDatabase } from "@/db/database";
import { calendarAccounts } from "@/db/schema";
import { Contacts } from "./contacts";
import { fakePeople } from "./testing";

const ALL = [CONTACTS_SCOPE, OTHER_CONTACTS_SCOPE];

let db: AppDatabase;
let people: ReturnType<typeof fakePeople>;
let scopes: string[];
let contacts: Contacts;

beforeEach(async () => {
  db = await openAppDatabase(":memory:");
  await db.insert(calendarAccounts).values({
    provider: "google",
    name: "me@example.com",
    secret: "sealed",
    createdAt: new Date(),
  });
  people = fakePeople();
  people.put("connections", {
    resourceName: "people/anna",
    names: [{ displayName: "Anna Kowalska" }],
    emailAddresses: [
      { value: "anna@home.example" },
      { value: "Anna@Acme.example", metadata: { primary: true } },
    ],
    phoneNumbers: [{ value: "+48 600 100 200" }],
    organizations: [{ title: "CFO", name: "Acme" }],
  });
  people.put("connections", {
    resourceName: "people/lukasz",
    names: [{ displayName: "Łukasz Nowak" }],
  });
  people.put("connections", {
    resourceName: "people/joanna",
    names: [{ displayName: "Joanna Annamaria" }],
    emailAddresses: [{ value: "jo@example.com" }],
  });
  // Gmail keeps Anna too, under the same address: the saved contact stands for her.
  people.put("otherContacts", {
    resourceName: "otherContacts/anna",
    emailAddresses: [{ value: "anna@acme.example" }],
  });
  people.put("otherContacts", {
    resourceName: "otherContacts/ann",
    names: [{ displayName: "Ann Smith" }],
    emailAddresses: [{ value: "ann@smith.example" }],
  });
  scopes = ALL;
  contacts = new Contacts(db, {
    google: {
      googleAccounts: async () => [{ id: 1, email: "me@example.com", scopes }],
      googleAccessToken: async () => "access",
    },
    fetch: people.fetch,
  });
});

const names = async (query: string) =>
  (await contacts.search(query)).map((contact) => contact.name);

describe("Contacts", () => {
  it("syncs both lists, page by page, and finds people by name, address or company", async () => {
    await contacts.syncNow();

    expect(await contacts.search("anna k")).toEqual([
      {
        id: expect.any(Number),
        name: "Anna Kowalska",
        emails: ["Anna@Acme.example", "anna@home.example"],
        phones: ["+48 600 100 200"],
        organization: "CFO, Acme",
        saved: true,
      },
    ]);
    // Names starting with the query first, then a word of the name; Gmail's copy of Anna is left out.
    expect(await names("ann")).toEqual([
      "Anna Kowalska",
      "Ann Smith",
      "Joanna Annamaria",
    ]);
    expect(await names("lukasz")).toEqual(["Łukasz Nowak"]);
    expect(await names("acme")).toEqual(["Anna Kowalska"]);
    expect(await names("smith.example")).toEqual(["Ann Smith"]);
    expect(await names("100%_")).toEqual([]);
    expect(await names("  ")).toEqual([]);

    expect((await contacts.status()).accounts).toEqual([
      {
        accountId: 1,
        email: "me@example.com",
        allowed: true,
        saved: 3,
        other: 2,
        syncedAt: expect.any(Number),
        error: null,
      },
    ]);
  });

  it("brings changes and removals, keeping ids, and starts over when the sync token expires", async () => {
    await contacts.syncNow();
    const [anna] = await contacts.search("anna kowalska");

    people.put("connections", {
      resourceName: "people/anna",
      names: [{ displayName: "Anna Nowak" }],
      emailAddresses: [{ value: "anna@acme.example" }],
    });
    people.remove("connections", "people/lukasz");
    await contacts.syncNow();

    expect(await contacts.get([anna.id])).toMatchObject([
      { id: anna.id, name: "Anna Nowak" },
    ]);
    expect(await names("lukasz")).toEqual([]);

    people.failures.expired = true;
    people.put("connections", {
      resourceName: "people/piotr",
      names: [{ displayName: "Piotr Zieliński" }],
    });
    await contacts.syncNow();
    people.failures.expired = false;

    expect(await names("piotr")).toEqual(["Piotr Zieliński"]);
    expect((await contacts.get([anna.id]))[0]?.name).toBe("Anna Nowak");
  });

  it("syncs only what the sign-in allows, and forgets a list once it isn't allowed", async () => {
    scopes = [CONTACTS_SCOPE];
    await contacts.syncNow();
    expect(await names("smith")).toEqual([]);
    expect((await contacts.status()).accounts[0]).toMatchObject({
      allowed: true,
      saved: 3,
      other: 0,
    });

    scopes = [];
    await contacts.syncNow();
    expect(await names("anna")).toEqual([]);
    expect((await contacts.status()).accounts[0]).toMatchObject({
      allowed: false,
      saved: 0,
      syncedAt: null,
    });
  });

  it("says what to do when the People API is off", async () => {
    people.failures.disabled = true;
    await contacts.syncNow();

    expect((await contacts.status()).accounts[0].error).toMatch(
      /People API is off/,
    );
  });
});
