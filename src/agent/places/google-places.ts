/** A place Google found, as the model reads it. */
export type FoundPlace = {
  /** Google's place ID: what the UI uses to show the place. */
  id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  /** e.g. "Ramen restaurant". */
  type?: string;
  rating?: number;
  ratingCount?: number;
  /** e.g. "Moderate". */
  price?: string;
  openNow?: boolean;
};

/** A failure the model should see as the tool's result, in words it can act on. */
export class PlacesError extends Error {}

export type GooglePlacesOptions = {
  apiKey: string;
  fetch?: typeof fetch;
};

// Rating, price and opening hours put a search in the Text Search Enterprise SKU. Nothing beyond what the model uses.
const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.primaryTypeDisplayName",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.currentOpeningHours.openNow",
].join(",");

const PRICE_LEVELS: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "Inexpensive",
  PRICE_LEVEL_MODERATE: "Moderate",
  PRICE_LEVEL_EXPENSIVE: "Expensive",
  PRICE_LEVEL_VERY_EXPENSIVE: "Very expensive",
};

/** Place search through Google's Places API (New), Text Search (ADR 0005). */
export class GooglePlaces {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: GooglePlacesOptions) {
    this.fetch = options.fetch ?? fetch;
  }

  async search(
    query: string,
    options: { count?: number; openNow?: boolean; signal?: AbortSignal } = {},
  ): Promise<FoundPlace[]> {
    const response = await this.fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.options.apiKey,
          "X-Goog-FieldMask": FIELDS,
        },
        body: JSON.stringify({
          textQuery: query,
          pageSize: options.count ?? 5,
          ...(options.openNow ? { openNow: true } : {}),
        }),
        signal: options.signal,
      },
    );
    const body = (await response.json().catch(() => ({}))) as SearchBody;
    if (!response.ok) throw failure(response.status, body);
    return (body.places ?? []).flatMap((place) => {
      const location = place.location;
      if (location?.latitude === undefined || location.longitude === undefined)
        return [];
      return [
        {
          id: place.id,
          name: place.displayName?.text ?? "Unnamed place",
          address: place.formattedAddress ?? "",
          location: { lat: location.latitude, lng: location.longitude },
          ...(place.primaryTypeDisplayName?.text
            ? { type: place.primaryTypeDisplayName.text }
            : {}),
          ...(place.rating !== undefined ? { rating: place.rating } : {}),
          ...(place.userRatingCount !== undefined
            ? { ratingCount: place.userRatingCount }
            : {}),
          ...(place.priceLevel && PRICE_LEVELS[place.priceLevel]
            ? { price: PRICE_LEVELS[place.priceLevel] }
            : {}),
          ...(place.currentOpeningHours?.openNow !== undefined
            ? { openNow: place.currentOpeningHours.openNow }
            : {}),
        },
      ];
    });
  }
}

function failure(status: number, body: SearchBody): PlacesError {
  const message = body.error?.message;
  if (status === 429)
    return new PlacesError(
      "The place search limit for today is used up. Try again tomorrow, or raise the quota in the Google Cloud console.",
    );
  if (status === 401 || status === 403)
    return new PlacesError(
      `Google refused the place search. Check that GOOGLE_MAPS_API_KEY is valid and allowed to use Places API (New)${message ? `: ${message}` : "."}`,
    );
  return new PlacesError(
    `Google answered ${status}${message ? `: ${message}` : ""}`,
  );
}

type SearchBody = {
  places?: {
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    primaryTypeDisplayName?: { text?: string };
    rating?: number;
    userRatingCount?: number;
    priceLevel?: string;
    currentOpeningHours?: { openNow?: boolean };
  }[];
  error?: { code?: number; message?: string; status?: string };
};
