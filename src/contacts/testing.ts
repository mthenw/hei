import { vi } from "vitest";

type Person = {
  resourceName: string;
  names?: { displayName: string }[];
  emailAddresses?: { value: string; metadata?: { primary?: boolean } }[];
  phoneNumbers?: { value: string }[];
  organizations?: { name?: string; title?: string }[];
};

/** Enough of the People API to sync: two lists, pages of two, sync tokens, deletions, and its failures. */
export function fakePeople() {
  let version = 0;
  const lists = {
    connections: new Map<string, { person: Person; at: number }>(),
    otherContacts: new Map<string, { person: Person; at: number }>(),
  };
  const deleted: { list: keyof typeof lists; name: string; at: number }[] = [];
  const failures = { expired: false, disabled: false };
  const error = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status });

  const fetch = vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (failures.disabled)
      return error(403, {
        error: {
          code: 403,
          message:
            "People API has not been used in project 1 before or it is disabled.",
          details: [{ reason: "SERVICE_DISABLED" }],
        },
      });
    const list = url.pathname.endsWith("/connections")
      ? "connections"
      : "otherContacts";
    const token = url.searchParams.get("syncToken");
    if (token && failures.expired)
      return error(400, {
        error: {
          code: 400,
          status: "FAILED_PRECONDITION",
          details: [{ reason: "EXPIRED_SYNC_TOKEN" }],
        },
      });
    const since = token ? Number(token.slice(1)) : -1;
    const items = [
      ...[...lists[list].values()]
        .filter((entry) => entry.at > since)
        .map((entry) => entry.person),
      ...(token
        ? deleted
            .filter((entry) => entry.list === list && entry.at > since)
            .map((entry) => ({
              resourceName: entry.name,
              metadata: { deleted: true },
            }))
        : []),
    ];
    const offset = Number(url.searchParams.get("pageToken") ?? 0);
    const last = offset + 2 >= items.length;
    return new Response(
      JSON.stringify({
        [list]: items.slice(offset, offset + 2),
        ...(last
          ? { nextSyncToken: `v${version}` }
          : { nextPageToken: String(offset + 2) }),
      }),
    );
  });

  return {
    fetch,
    failures,
    put(list: keyof typeof lists, person: Person) {
      lists[list].set(person.resourceName, { person, at: ++version });
    },
    remove(list: keyof typeof lists, name: string) {
      lists[list].delete(name);
      deleted.push({ list, name, at: ++version });
    },
  };
}
