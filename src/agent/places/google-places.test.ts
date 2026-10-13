import { describe, expect, it, vi } from "vitest";
import { GooglePlaces, PlacesError } from "./google-places";

function fakeFetch(status: number, body: unknown) {
  return vi.fn(
    async (_url: URL | RequestInfo, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status }),
  );
}

describe("GooglePlaces", () => {
  it("searches by text for only the fields the model uses", async () => {
    const fetch = fakeFetch(200, {
      places: [
        {
          id: "ChIJ-ramen",
          displayName: { text: "Ramen-Ya", languageCode: "pl" },
          formattedAddress: "Wrocławska 1, 61-001 Poznań, Poland",
          location: { latitude: 52.408, longitude: 16.934 },
          primaryTypeDisplayName: { text: "Ramen restaurant" },
          rating: 4.6,
          userRatingCount: 1234,
          priceLevel: "PRICE_LEVEL_MODERATE",
          currentOpeningHours: { openNow: true },
        },
        {
          id: "ChIJ-bare",
          displayName: { text: "Bare place" },
          location: { latitude: 52.4, longitude: 16.9 },
        },
        // Without coordinates a place can't be shown on the map, so it is left out.
        { id: "ChIJ-nowhere", displayName: { text: "Nowhere" } },
      ],
    });
    const places = new GooglePlaces({ apiKey: "key", fetch });

    const found = await places.search("ramen in Poznań", {
      count: 3,
      openNow: true,
    });

    expect(found).toEqual([
      {
        id: "ChIJ-ramen",
        name: "Ramen-Ya",
        address: "Wrocławska 1, 61-001 Poznań, Poland",
        location: { lat: 52.408, lng: 16.934 },
        type: "Ramen restaurant",
        rating: 4.6,
        ratingCount: 1234,
        price: "Moderate",
        openNow: true,
      },
      {
        id: "ChIJ-bare",
        name: "Bare place",
        address: "",
        location: { lat: 52.4, lng: 16.9 },
      },
    ]);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://places.googleapis.com/v1/places:searchText",
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "X-Goog-Api-Key": "key",
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours.openNow",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      textQuery: "ramen in Poznań",
      pageSize: 3,
      openNow: true,
    });
  });

  it("returns nothing when Google finds nothing", async () => {
    const places = new GooglePlaces({
      apiKey: "key",
      fetch: fakeFetch(200, {}),
    });

    expect(await places.search("unicorn stable in Poznań")).toEqual([]);
  });

  it("explains a used-up daily quota", async () => {
    const places = new GooglePlaces({
      apiKey: "key",
      fetch: fakeFetch(429, {
        error: {
          code: 429,
          message: "Quota exceeded",
          status: "RESOURCE_EXHAUSTED",
        },
      }),
    });

    await expect(places.search("ramen")).rejects.toThrow(/used up/);
  });

  it("names the key when Google refuses it", async () => {
    const places = new GooglePlaces({
      apiKey: "key",
      fetch: fakeFetch(403, {
        error: {
          code: 403,
          message: "Places API (New) has not been used in project 1",
          status: "PERMISSION_DENIED",
        },
      }),
    });

    const error = await places.search("ramen").catch((caught) => caught);
    expect(error).toBeInstanceOf(PlacesError);
    expect(error.message).toContain("GOOGLE_MAPS_API_KEY");
    expect(error.message).toContain("has not been used");
  });
});
