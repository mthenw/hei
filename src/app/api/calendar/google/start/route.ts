import { heiForRequest } from "@/app/api/hei";
import { InvalidCalendar } from "@/calendar/calendars";
import { signInProblem } from "../problem";

/** Send the browser to Google to allow Hei into the calendars; Google returns it to the callback. */
export async function GET(request: Request) {
  const { calendars } = await heiForRequest();
  try {
    const redirectUri = new URL(
      "/api/calendar/google/callback",
      request.url,
    ).toString();
    return Response.redirect(calendars.beginGoogleSignIn(redirectUri), 302);
  } catch (error) {
    if (InvalidCalendar.is(error)) return signInProblem(error.message);
    throw error;
  }
}
