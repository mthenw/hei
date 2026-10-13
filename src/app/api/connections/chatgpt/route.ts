import { heiForRequest } from "@/app/api/hei";
import { respond } from "../../respond";

/** Disconnect ChatGPT: forget the stored sign-in. */
export async function DELETE() {
  return respond(async () => {
    const { connections } = await heiForRequest();
    await connections.disconnectChatGPT();
    return new Response(null, { status: 204 });
  });
}
