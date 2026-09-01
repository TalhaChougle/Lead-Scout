/**
 * Frontend API client — all requests go through Vercel serverless routes.
 * The browser never calls Google directly and never sees the API key.
 */

const BASE = typeof window !== "undefined" ? "" : "http://localhost:3000";

/**
 * Get location autocomplete suggestions via /api/autocomplete.
 *
 * @param {string} input  - partial location text, e.g. "Bandra"
 * @param {AbortSignal} signal
 * @returns {{ suggestions: Array<{ placeId, description, mainText, secondaryText }> }}
 */
export async function autocompleteLocation(input, signal) {
  const url = `${BASE}/api/autocomplete?input=${encodeURIComponent(input)}`;
  const res = await fetch(url, { signal });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Location search failed");
  return data;
}

/**
 * Resolve a place_id (from autocomplete) OR a text address to coordinates.
 *
 * @param {{ placeId?: string, address?: string }} params
 * @param {AbortSignal} signal
 * @returns {{ lat, lng, formattedAddress, placeId, city, region, country }}
 */
export async function geocodeLocation({ placeId, address }, signal) {
  const params = new URLSearchParams();
  if (placeId) params.set("placeId", placeId);
  else if (address) params.set("address", address);
  else throw new Error("Provide placeId or address");

  const url = `${BASE}/api/geocode?${params.toString()}`;
  const res = await fetch(url, { signal });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Location not found");
  return data;
}

/**
 * Search for businesses via /api/search.
 *
 * @param {{ lat, lng, keyword, radiusMetres }} params
 * @param {string|null} pagetoken
 * @param {AbortSignal} signal
 * @returns {{ results, nextPageToken, totalFound }}
 */
export async function searchBusinesses({ lat, lng, keyword, radiusMetres }, pagetoken, signal) {
  const params = new URLSearchParams();
  if (pagetoken) {
    params.set("pagetoken", pagetoken);
    if (lat != null) params.set("lat", String(lat));
    if (lng != null) params.set("lng", String(lng));
  } else {
    params.set("lat", String(lat));
    params.set("lng", String(lng));
    params.set("keyword", keyword);
    params.set("radius", String(radiusMetres));
  }
  const url = `${BASE}/api/search?${params.toString()}`;
  const res = await fetch(url, { signal });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Search failed");
  return data;
}

/**
 * Fetch full place details (phone, website, hours) via /api/details.
 *
 * @param {string} placeId
 * @param {AbortSignal} signal
 */
export async function fetchPlaceDetails(placeId, signal) {
  const url = `${BASE}/api/details?placeId=${encodeURIComponent(placeId)}`;
  const res = await fetch(url, { signal });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not load place details");
  return data;
}
