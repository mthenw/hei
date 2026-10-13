import { getHei } from "@/server/hei";
import { respond } from "../../respond";

/** Disconnect ChatGPT: forget the stored sign-in. */
export async function DELETE() {
  return respond(async () => {
    const { connections } = await getHei();
    await connections.disconnectChatGPT();
    return new Response(null, { status: 204 });
  });
}
