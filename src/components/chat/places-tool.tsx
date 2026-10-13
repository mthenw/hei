"use client";

import { ExternalLinkIcon, MapPinIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlacesToolDetails } from "@/agent/places/tools";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { ToolPart } from "@/lib/chat-stream";
import {
  type GoogleMaps,
  googleMapsUrl,
  loadGoogleMaps,
} from "@/lib/google-maps";
import { cn } from "@/lib/utils";
import { StatusIcon, ToolError } from "./web-tool";

/** A place's pin: its number in the results and where its card says it is. */
type Pin = {
  number: number;
  placeId: string;
  location: google.maps.LatLngLiteral;
};

export function isPlacesTool(part: ToolPart): boolean {
  return part.name === "find_places";
}

/**
 * A place search: one line, then a map with numbered pins and Google's card for each place. Hei keeps only place IDs;
 * the cards load each place from Google, and the pins go where the cards say (ADR 0005).
 */
export function PlacesToolView({ part }: { part: ToolPart }) {
  const working = part.status === "pending" || part.status === "running";
  const failed = part.status === "error" || part.status === "interrupted";
  const details = part.details as PlacesToolDetails | undefined;
  const placeIds = details?.kind === "places" ? details.placeIds : [];
  const query = String(part.args.query ?? "");
  const maps = useGoogleMaps(placeIds.length > 0);
  const [locations, setLocations] = useState<
    Record<string, google.maps.LatLngLiteral>
  >({});
  const locate = useCallback(
    (placeId: string, location: google.maps.LatLngLiteral) =>
      setLocations((known) => ({ ...known, [placeId]: location })),
    [],
  );
  const pins = placeIds.flatMap((placeId, index) => {
    const location = locations[placeId];
    return location ? [{ number: index + 1, placeId, location }] : [];
  });

  const label = working ? (
    <Shimmer as="span">{`Finding places for “${query}”`}</Shimmer>
  ) : failed ? (
    `Couldn’t find places for “${query}”`
  ) : placeIds.length === 0 ? (
    `No places found for “${query}”`
  ) : (
    `Found ${placeIds.length} ${placeIds.length === 1 ? "place" : "places"} for “${query}”`
  );

  return (
    <div className="not-prose flex flex-col gap-2">
      <div className="flex max-w-full items-center gap-2 text-sm text-muted-foreground">
        <StatusIcon working={working} failed={failed} icon={<MapPinIcon />} />
        <span className="truncate">{label}</span>
      </div>
      {failed && <ToolError part={part} />}
      {placeIds.length > 0 && maps && (
        <>
          <PlacesMap maps={maps} pins={pins} query={query} />
          <ol className="flex flex-col gap-2">
            {placeIds.map((placeId, index) => (
              <PlaceCard
                key={placeId}
                maps={maps}
                placeId={placeId}
                number={index + 1}
                query={query}
                onLocate={locate}
              />
            ))}
          </ol>
        </>
      )}
      {/* Without a browser key there is no map or card; links still lead to each place. */}
      {placeIds.length > 0 && maps === null && (
        <ol className="flex flex-col gap-1 pl-6">
          {placeIds.map((placeId, index) => (
            <li key={placeId} className="flex items-center gap-2 text-sm">
              <PlaceNumber number={index + 1} />
              <MapsLink placeId={placeId} query={query} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Google Maps once loaded, null without a browser key, undefined while loading or when not needed. */
function useGoogleMaps(needed: boolean): GoogleMaps | null | undefined {
  const [maps, setMaps] = useState<GoogleMaps | null>();
  useEffect(() => {
    if (!needed) return;
    let active = true;
    loadGoogleMaps().then(
      (loaded) => {
        if (active) setMaps(loaded);
      },
      (error: unknown) => {
        console.warn("Could not load Google Maps:", error);
        if (active) setMaps(null);
      },
    );
    return () => {
      active = false;
    };
  }, [needed]);
  return maps;
}

function PlacesMap({
  maps,
  pins,
  query,
}: {
  maps: GoogleMaps;
  pins: Pin[];
  query: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map>(undefined);
  // Pins arrive one by one as the cards load; compare them by value so other re-renders keep the markers.
  const key = JSON.stringify(pins);

  useEffect(() => {
    const element = container.current;
    const shown: Pin[] = JSON.parse(key);
    if (element === null || shown.length === 0) return;
    const markers: google.maps.marker.AdvancedMarkerElement[] = [];
    let cancelled = false;

    void (async () => {
      const [
        { LatLngBounds },
        { Map: GoogleMap },
        { AdvancedMarkerElement, PinElement },
      ] = await Promise.all([
        maps.importLibrary("core"),
        maps.importLibrary("maps"),
        maps.importLibrary("marker"),
      ]);
      if (cancelled) return;
      map.current ??= new GoogleMap(element, {
        mapId: maps.mapId,
        colorScheme: "DARK",
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        gestureHandling: "cooperative",
      });
      const bounds = new LatLngBounds();
      for (const pin of shown) {
        const marker = new AdvancedMarkerElement({
          map: map.current,
          position: pin.location,
          title: String(pin.number),
          gmpClickable: true,
          content: new PinElement({
            glyphText: String(pin.number),
            background: "#ee6a55",
            borderColor: "#1a0906",
            glyphColor: "#1a0906",
          }),
        });
        marker.addEventListener("gmp-click", () =>
          window.open(
            googleMapsUrl(pin.placeId, query),
            "_blank",
            "noopener,noreferrer",
          ),
        );
        markers.push(marker);
        bounds.extend(pin.location);
      }
      if (shown.length === 1) {
        map.current.setCenter(bounds.getCenter());
        map.current.setZoom(15);
      } else {
        map.current.fitBounds(bounds, 40);
      }
    })().catch((error: unknown) =>
      console.warn("Could not show the map:", error),
    );

    return () => {
      cancelled = true;
      for (const marker of markers) marker.map = null;
    };
  }, [maps, key, query]);

  return (
    <div
      ref={container}
      className="h-56 w-full overflow-hidden rounded-lg border bg-muted"
    />
  );
}

function PlaceCard({
  maps,
  placeId,
  number,
  query,
  onLocate,
}: {
  maps: GoogleMaps;
  placeId: string;
  number: number;
  query: string;
  onLocate: (placeId: string, location: google.maps.LatLngLiteral) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (element === null) return;
    let card: HTMLElement | undefined;
    let cancelled = false;

    void (async () => {
      const places = await maps.importLibrary("places");
      if (cancelled) return;
      const compact = new places.PlaceDetailsCompactElement({
        orientation: "HORIZONTAL",
      });
      compact.truncationPreferred = true;
      compact.addEventListener("gmp-load", () => {
        const location = compact.place?.location?.toJSON();
        if (!cancelled && location) onLocate(placeId, location);
      });
      compact.addEventListener("gmp-error", () => {
        if (!cancelled) setUnavailable(true);
      });
      const content = new places.PlaceContentConfigElement();
      content.append(
        new places.PlaceMediaElement(),
        new places.PlaceRatingElement(),
        new places.PlaceTypeElement(),
        new places.PlacePriceElement(),
        new places.PlaceOpenNowStatusElement(),
        new places.PlaceAddressElement(),
      );
      compact.append(
        new places.PlaceDetailsPlaceRequestElement({ place: placeId }),
        content,
      );
      element.append(compact);
      card = compact;
    })().catch((error: unknown) => {
      console.warn("Could not show the place:", error);
      if (!cancelled) setUnavailable(true);
    });

    return () => {
      cancelled = true;
      card?.remove();
    };
  }, [maps, placeId, onLocate]);

  return (
    <li className="flex items-start gap-2">
      <PlaceNumber number={number} className={unavailable ? "" : "mt-3"} />
      {/* Google's card links to the place itself; without the card, Hei's own link does. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {unavailable ? (
          <MapsLink placeId={placeId} query={query} />
        ) : (
          <div ref={container} className="hei-place-card" />
        )}
      </div>
    </li>
  );
}

function PlaceNumber({
  number,
  className,
}: {
  number: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground",
        className,
      )}
    >
      {number}
    </span>
  );
}

function MapsLink({ placeId, query }: { placeId: string; query: string }) {
  return (
    <a
      href={googleMapsUrl(placeId, query)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      Open in Google Maps
      <ExternalLinkIcon className="size-3" />
    </a>
  );
}
