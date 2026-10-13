/** A small page that says why connecting Google didn't work, with a way back. */
export function signInProblem(message: string): Response {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Google not connected · Hei</title>
<body style="font-family:system-ui,sans-serif;background:#0c0c0c;color:#ececec;max-width:32rem;margin:15vh auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.1rem">Google wasn’t connected</h1>
<p style="color:#8b8b8b">${escaped}</p>
<p><a href="/settings/connections" style="color:#ee6a55">Back to Connections</a></p>
</body>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
