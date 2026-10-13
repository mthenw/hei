import { getHei } from "@/server/hei";
import { badRequest, readBody, respond } from "../../../../respond";

/** Finish a sign-in with the redirect URL pasted from the browser: `{ redirectUrl }`. */
export async function POST(request: Request) {
  return respond(async () => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (typeof body.redirectUrl !== "string")
      return badRequest("redirectUrl must be a string.");
    const { connections } = await getHei();
    await connections.finishChatGPTSignIn(body.redirectUrl);
    return new Response(null, { status: 204 });
  });
}
