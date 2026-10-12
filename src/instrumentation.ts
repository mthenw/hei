export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getChats } = await import("@/chats");
    // Open the agent and the app database at boot, so runs a previous process left unfinished resume right away.
    await getChats();
  }
}
