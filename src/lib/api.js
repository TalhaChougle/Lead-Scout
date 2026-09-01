/**
 * Frontend API client — all requests go through Vercel serverless routes.
 * The browser never calls Google directly; it never sees the API key.
 */

const BASE = typeof window !== "undefined" ? "" : "http://localhost:3000";

/**
 * Resolve a text location to coordinates via /api/geocode.
 *
 * @param {string} address  - e.g. "Bandra, Mumbai"
 * @returns {{ lat: number, lng: number, formattedAddress: string, placeId: string }}
 * @throws Error with a user-friendly message
 */
export async function geocodeLocation(address, signal) {
  const url = `${BASE}/api/geocode?address=${encodeURIComponent(address)}`;
  const res = await fetch(url, { signal });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Location not found");
  return data;
}

/**
 * Search for businesses via /api/search.
 *
 * @param {{ lat, lng, keyword, radiusMetres }} params
 * @param {string|null} pagetoken  - pass to fetch next page
 * @returns {{ results, nextPageToken, totalFound }}
 * @throws Error with a user-friendly message
 */
export async function searchBusinesses({ lat, lng, keyword, radiusMetres }, pagetoken, signal) {
  const params = new URLSearchParams();

  if (pagetoken) {
    params.set("pagetoken", pagetoken);
    // lat/lng are still needed for validation in some edge cases
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
 * Batched per-lead enrichment — one call per lead.
 *
 * @param {string} placeId
 * @returns enriched fields object
 * @throws Error with a user-friendly message
 */
export async function fetchPlaceDetails(placeId, signal) {
  const url = `${BASE}/api/details?placeId=${encodeURIComponent(placeId)}`;
  const res = await fetch(url, { signal });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not load place details");
  return data;
}
