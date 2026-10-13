import { Type } from "@earendil-works/pi-ai";
import {
  defineExtension,
  defineTool,
  type Extension,
  section,
} from "@earendil-works/pi-durable";
import type { FoundPlace, GooglePlaces } from "./google-places";

const PLACES_PER_SEARCH = 5;

/**
 * What find_places keeps for the UI: only place IDs, the one piece of Google's content Hei may keep for good. The cards
 * load everything else from Google, including where to put each pin (ADR 0005).
 */
export type PlacesToolDetails = {
  kind: "places";
  query: string;
  placeIds: string[];
};

/** How Hei should use find_places, knowing the user sees the map and cards. */
export const PLACES_INSTRUCTIONS = [
  "You can find places with find_places: restaurants, cafés, shops, services, venues, sights.",
  'Put the area in the query, e.g. "ramen near Stary Rynek, Poznań". Take it from the conversation or from what the user has told you about themselves; if you can\'t tell where, ask.',
  "The user sees the places you found on a map, numbered as in your results, each with a card showing photos, rating, price and whether it's open, and a link to Google Maps.",
  "So don't repeat addresses, ratings or links: say which places you'd suggest and why, by name and number, briefly. Search the web as well when menus or reviews matter.",
].join("\n");

/** Finding places as an extension: the tool and the instructions for using it. */
export function placesExtension(places: GooglePlaces): Extension {
  return defineExtension({
    name: "places",
    tools: [findPlacesTool(places)],
    sections: [section("places", () => PLACES_INSTRUCTIONS)],
  });
}

/** find_places over Google Places. It only reads, so it is safe to run again after a restart. */
export function findPlacesTool(places: GooglePlaces) {
  return defineTool({
    name: "find_places",
    description: `Find places on Google Maps, such as restaurants, shops or services. Returns up to ${PLACES_PER_SEARCH} places with address, type, rating, price and whether they are open now.`,
    parameters: Type.Object({
      query: Type.String({
        description:
          'What and where, as you would type it into Google Maps, e.g. "quiet café with wifi in Jeżyce, Poznań".',
      }),
      open_now: Type.Optional(
        Type.Boolean({ description: "Only places open right now." }),
      ),
    }),
    replay: "safe",
    execute: async (args, _api, context) => {
      const found = await places.search(args.query, {
        count: PLACES_PER_SEARCH,
        openNow: args.open_now,
        signal: context.abortSignal,
      });
      const details: PlacesToolDetails = {
        kind: "places",
        query: args.query,
        placeIds: found.map((place) => place.id),
      };
      return {
        content: [{ type: "text", text: placesText(args.query, found) }],
        details,
      };
    },
  });
}

function placesText(query: string, found: FoundPlace[]): string {
  if (found.length === 0) return `No places found for "${query}".`;
  return [
    `Places for "${query}":`,
    ...found.map((place, index) =>
      [
        `${index + 1}. ${place.name}${place.type ? ` — ${place.type}` : ""}`,
        place.address ? `   ${place.address}` : undefined,
        facts(place),
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n\n");
}

function facts(place: FoundPlace): string | undefined {
  const parts = [
    place.rating !== undefined &&
      `Rating ${place.rating}${place.ratingCount !== undefined ? ` (${place.ratingCount} reviews)` : ""}`,
    place.price && `${place.price} prices`,
    place.openNow !== undefined && (place.openNow ? "Open now" : "Closed now"),
  ].filter(Boolean);
  return parts.length > 0 ? `   ${parts.join(" · ")}` : undefined;
}
