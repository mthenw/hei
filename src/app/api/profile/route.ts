import { DEFAULT_INSTRUCTIONS } from "@/agent/extension";
import { heiForRequest } from "@/app/api/hei";
import type { ProfileChange } from "@/profile/profile";
import { badRequest, readBody, respond } from "../respond";

/** The Profile, with the defaults the page shows for empty fields. */
export async function GET() {
  const { profile } = await heiForRequest();
  return Response.json({
    profile: profile.get(),
    defaultInstructions: DEFAULT_INSTRUCTIONS,
  });
}

/** Change the Profile: any of `{ about, timeZone, replyLanguage, instructions }`. It applies from the next message. */
export async function PATCH(request: Request) {
  return respond(async () => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    const change: ProfileChange = {};
    for (const key of ["about", "timeZone"] as const) {
      if (body[key] === undefined) continue;
      if (typeof body[key] !== "string")
        return badRequest(`${key} must be a string.`);
      change[key] = body[key];
    }
    for (const key of ["replyLanguage", "instructions"] as const) {
      if (body[key] === undefined) continue;
      if (body[key] !== null && typeof body[key] !== "string")
        return badRequest(`${key} must be a string or null.`);
      change[key] = body[key];
    }
    const { profile } = await heiForRequest();
    return Response.json({ profile: await profile.update(change) });
  });
}
