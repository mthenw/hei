import { heiForRequest } from "@/app/api/hei";
import { InvalidCalendar } from "@/calendar/calendars";
import { signInProblem } from "../problem";

/** Where Google sends the browser back: finish signing in, then open the calendar. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (params.get("error") === "access_denied")
    return signInProblem(
      "You didn't allow Hei into your calendars, so nothing was connected.",
    );
  if (state === null || code === null)
    return signInProblem(
      "Google sent back an incomplete answer. Try connecting again.",
    );
  const { calendars } = await heiForRequest();
  try {
    await calendars.finishGoogleSignIn(state, code);
  } catch (error) {
    if (InvalidCalendar.is(error)) return signInProblem(error.message);
    throw error;
  }
  return Response.redirect(new URL("/calendar", request.url), 302);
}
