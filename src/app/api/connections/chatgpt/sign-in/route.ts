import { getHei } from "@/server/hei";
import { respond } from "../../../respond";

/** Begin Sign in with ChatGPT; answers the URL to open. */
export async function POST() {
  return respond(async () => {
    const { connections } = await getHei();
    return Response.json(await connections.startChatGPTSignIn());
  });
}

/** Cancel a sign-in in progress. */
export async function DELETE() {
  const { connections } = await getHei();
  connections.cancelChatGPTSignIn();
  return new Response(null, { status: 204 });
}
