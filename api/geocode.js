/**
 * Vercel Serverless Function: /api/geocode
 *
 * Proxies geocoding requests to Google Maps Geocoding API.
 * The API key never leaves the server — the browser only sees
 * the normalized coordinates/address that come back.
 *
 * Query params:
 *   address (string) — text location, e.g. "Bandra, Mumbai"
 *
 * Returns:
 *   { lat, lng, formattedAddress, placeId }
 *   or { error: "..." } with an appropriate HTTP status
 */
export default async function handler(req, res) {
  // CORS headers so the Vite dev server (different port) can reach this
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error:
        "Google Places API key is not configured. Set GOOGLE_PLACES_API_KEY in your environment variables.",
    });
  }

  const { address } = req.query;
  if (!address || typeof address !== "string" || !address.trim()) {
    return res.status(400).json({ error: "Missing required query parameter: address" });
  }

  const trimmed = address.trim().slice(0, 200); // prevent abuse

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", trimmed);
  url.searchParams.set("key", apiKey);

  let data;
  try {
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      return res.status(502).json({ error: "Geocoding service unavailable" });
    }
    data = await response.json();
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return res.status(504).json({ error: "Geocoding request timed out" });
    }
    return res.status(502).json({ error: "Failed to reach geocoding service" });
  }

  // Google-specific error handling — never expose the key in any message
  if (data.status === "REQUEST_DENIED") {
    return res.status(403).json({
      error:
        "Google Geocoding API access denied. Verify that the Geocoding API is enabled for GOOGLE_PLACES_API_KEY.",
    });
  }
  if (data.status === "OVER_DAILY_LIMIT" || data.status === "OVER_QUERY_LIMIT") {
    return res.status(429).json({ error: "Google API quota exceeded. Try again later." });
  }
  if (data.status === "INVALID_REQUEST") {
    return res.status(400).json({ error: "Invalid location query" });
  }
  if (data.status === "ZERO_RESULTS" || !data.results || data.results.length === 0) {
    return res.status(404).json({ error: "Location not found. Try a more specific address." });
  }
  if (data.status !== "OK") {
    return res.status(502).json({ error: "Geocoding failed. Please try again." });
  }

  const result = data.results[0];
  const loc = result.geometry.location;

  return res.status(200).json({
    lat: loc.lat,
    lng: loc.lng,
    formattedAddress: result.formatted_address,
    placeId: result.place_id,
  });
}
