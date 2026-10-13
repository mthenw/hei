import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { getMapsConfig } from "./chat-api";

export type GoogleMaps = {
  mapId: string;
  importLibrary: typeof importLibrary;
};

let loading: Promise<GoogleMaps | null> | undefined;

/**
 * Google's Maps JavaScript API, set up once per page with Hei's browser key. Resolves to null when no browser key is
 * set. Loaded only when a chat shows places, so other pages never fetch Google's script.
 */
export function loadGoogleMaps(): Promise<GoogleMaps | null> {
  loading ??= getMapsConfig().then(
    ({ browserKey, mapId }) => {
      if (browserKey === null) return null;
      setOptions({ key: browserKey, v: "weekly" });
      return { mapId, importLibrary };
    },
    (error: unknown) => {
      // A failed config request may succeed later; don't keep the failure.
      loading = undefined;
      throw error;
    },
  );
  return loading;
}

/**
 * A Google Maps link to a place, from what Hei keeps: its ID. Google Maps opens the place by ID and falls back to
 * searching for `query`.
 */
export function googleMapsUrl(placeId: string, query: string): string {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", query);
  url.searchParams.set("query_place_id", placeId);
  return url.toString();
}
