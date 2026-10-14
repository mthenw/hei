import { heiForRequest } from "@/app/api/hei";
import { InvalidCalendar } from "@/calendar/calendars";
import { RETURN_COOKIE, signInProblem } from "../problem";

/**
 * Send the browser to Google to allow Hei into the calendars and contacts; Google returns it to the callback.
 * `account` picks the Google account when signing in again; `back=settings` returns to Connections, not the calendar.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const { calendars } = await heiForRequest();
  try {
    const redirectUri = new URL(
      "/api/calendar/google/callback",
      request.url,
    ).toString();
    const consent = calendars.beginGoogleSignIn(
      redirectUri,
      params.get("account") ?? undefined,
    );
    const back = params.get("back") === "settings" ? "settings" : "calendar";
    return new Response(null, {
      status: 302,
      headers: {
        Location: consent,
        "Set-Cookie": `${RETURN_COOKIE}=${back}; Path=/api/calendar/google; Max-Age=600; HttpOnly; SameSite=Lax`,
      },
    });
  } catch (error) {
    if (InvalidCalendar.is(error)) return signInProblem(error.message);
    throw error;
  }
}
