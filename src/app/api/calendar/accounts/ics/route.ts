import { heiForRequest } from "@/app/api/hei";
import { badRequest, readBody, respond } from "../../../respond";

/** Connect a calendar published at an ICS address: `{ name, url }`. */
export async function POST(request: Request) {
  return respond(async () => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (typeof body.name !== "string" || typeof body.url !== "string")
      return badRequest("name and url must be strings.");
    const { calendars } = await heiForRequest();
    return Response.json(
      { account: await calendars.addIcs(body.name, body.url) },
      { status: 201 },
    );
  });
}
