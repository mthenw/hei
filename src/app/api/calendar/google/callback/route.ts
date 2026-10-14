import { heiForRequest } from "@/app/api/hei";
import { InvalidCalendar } from "@/calendar/calendars";
import { RETURN_COOKIE, signInProblem } from "../problem";

/** Where Google sends the browser back: finish signing in, then open the calendar, or Connections. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (params.get("error") === "access_denied")
    return signInProblem(
      "You didn't allow Hei into your Google account, so nothing was connected.",
    );
  if (state === null || code === null)
    return signInProblem(
      "Google sent back an incomplete answer. Try connecting again.",
    );
  const { calendars, contacts } = await heiForRequest();
  try {
    const account = await calendars.finishGoogleSignIn(state, code);
    // The contacts come along in the background; a large address book shouldn't hold up the page.
    void contacts.syncNow(account.id).catch(() => undefined);
  } catch (error) {
    if (InvalidCalendar.is(error)) return signInProblem(error.message);
    throw error;
  }
  const back = request.headers
    .get("cookie")
    ?.includes(`${RETURN_COOKIE}=settings`)
    ? "/settings/connections"
    : "/calendar";
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(back, request.url).toString(),
      "Set-Cookie": `${RETURN_COOKIE}=; Path=/api/calendar/google; Max-Age=0`,
    },
  });
}
