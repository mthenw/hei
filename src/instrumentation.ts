export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getAgent } = await import("@/agent");
    // Open the agent at boot so runs a previous process left unfinished resume right away.
    await getAgent();
  }
}
