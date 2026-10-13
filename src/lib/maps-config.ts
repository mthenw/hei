/**
 * What the browser needs to show maps and place cards with Google's Places UI Kit. The browser key is meant to be seen:
 * it is a separate key, restricted to Hei's addresses and to the Maps JavaScript API and Places UI Kit (ADR 0005).
 */
export type MapsConfig = {
  browserKey: string | null;
  mapId: string;
};
