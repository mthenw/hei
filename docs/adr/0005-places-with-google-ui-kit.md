# Places through Google, shown with Google's Places UI Kit

Asking Hei to find a place shows the places on a map, each with a card and a link to Google Maps. `find_places` searches with Google's Places API (New) Text Search on the server, using `GOOGLE_MAPS_API_KEY`; the model reads names, addresses, ratings, prices and open-now status. The transcript keeps only each place's ID. The browser shows a card per place (Places UI Kit's `gmp-place-details-compact`), which loads the place from Google, and a map (Maps JavaScript API) with a numbered pin wherever each card says its place is. The browser uses a second key, `GOOGLE_MAPS_BROWSER_KEY`.

The deciding constraint is Google's terms for projects created after 8 July 2025 with an EEA billing address, as Hei's is expected to be for a user in Poland ([Places API EEA adjustments](https://developers.google.com/maps/comms/eea/places)). Other than latitude, longitude and place ID, Places API content must not be shown *With any Map*: on, next to, or visually associated with any map, a Google map included. The Places UI Kit is exempt, and links to Google Maps are allowed. So Hei's own UI may draw pins and links, but names, ratings and photos beside the map must come from Google's components. Storage points the same way: Places content must not be cached or stored, except place IDs, which may be kept indefinitely ([Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies)). Chats are kept for good, so they hold IDs only, and even the pins' coordinates come from the cards each time a chat is shown.

## Consequences

- **Two keys.** The browser key is visible to anyone using Hei, so it is restricted to Hei's addresses (website restrictions) and to Maps JavaScript API and Places UI Kit. The server key cannot be restricted by website, so it stays on the server, restricted to Places API (New).
- **Cost.** A search uses the Text Search Enterprise SKU (rating and opening hours): 1,000 free a month, then $35 per 1,000. Each map shown is a Dynamic Maps load (10,000 free) and each card a Places UI Kit load (10,000 free, then $1 per 1,000), counted again whenever a chat with places is opened. Daily quota caps in the Cloud console bound the bill.
- **The model's own words.** The reply names the places it recommends, beside the map. Hei tells the model not to repeat addresses, ratings or links, which the cards show.
- **Experimental.** Google marks the Places UI Kit as pre-GA; its elements may change. The map uses Google's test map ID unless `GOOGLE_MAPS_MAP_ID` is set.
- **Pins wait for cards.** A place whose card fails to load gets no pin. Without the browser key, places show as numbered Google Maps links only.

## Considered options

- **Map image (Maps Static API) with Hei's own place list** — the first plan: one key, kept on the server. Allowed outside the EEA, but a list beside the map breaks the EEA rule.
- **Place list with Google Maps links, no map** — within the EEA terms with one key, but no map preview, which was the point.
- **OpenStreetMap** — no key and no Google terms, but its search finds addresses, not "a good ramen place", and has no ratings or opening hours.
- **Places UI Kit (chosen, 2026-10-13)** — Google's sanctioned way to show place details with a map in the EEA.
