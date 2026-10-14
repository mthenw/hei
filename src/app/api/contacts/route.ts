import { heiForRequest } from "@/app/api/hei";

const MAX_QUERY = 100;

/** Contacts matching `q`, best first: what the @ picker lists. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const { contacts } = await heiForRequest();
  return Response.json({
    contacts: await contacts.search(query.slice(0, MAX_QUERY)),
  });
}
