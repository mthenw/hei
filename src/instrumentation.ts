export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getHei } = await import("@/server/hei");
    // Build Hei at boot, so runs a previous process left unfinished resume right away.
    await getHei();
  }
}
