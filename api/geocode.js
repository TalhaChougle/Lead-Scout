/**
 * Vercel Serverless Function: /api/geocode
 *
 * Resolves a location to coordinates via Google Maps Geocoding API.
 * Accepts either a text address OR a Google place_id (from autocomplete).
 * The API key never leaves the server.
 *
 * Query params (one of the two is required):
 *   address  (string) — text location, e.g. "Bandra West, Mumbai"
 *   placeId  (string) — Google place_id from autocomplete, e.g. "ChIJ..."
 *
 * Returns:
 *   { lat, lng, formattedAddress, placeId, city, region, country, postalCode }
 *   or { error: "..." }
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Location service is not configured. Set GOOGLE_PLACES_API_KEY in your environment.",
    });
  }

  const { address, placeId } = req.query;

  if (!address && !placeId) {
    return res.status(400).json({ error: "Provide either address or placeId" });
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  if (placeId) {
    url.searchParams.set("place_id", placeId.trim().slice(0, 300));
  } else {
    url.searchParams.set("address", address.trim().slice(0, 200));
  }
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

  switch (data.status) {
    case "OK":
      break;
    case "ZERO_RESULTS":
      return res.status(404).json({ error: "Location not found. Try a more specific address." });
    case "REQUEST_DENIED":
      return res.status(403).json({
        error: "Geocoding API access denied. Verify GOOGLE_PLACES_API_KEY has the Geocoding API enabled.",
      });
    case "OVER_DAILY_LIMIT":
    case "OVER_QUERY_LIMIT":
      return res.status(429).json({ error: "Geocoding quota exceeded. Try again later." });
    case "INVALID_REQUEST":
      return res.status(400).json({ error: "Invalid location query" });
    default:
      return res.status(502).json({ error: "Geocoding failed. Please try again." });
  }

  const result = data.results[0];
  const loc = result.geometry.location;

  // Parse address components
  let city = null, region = null, country = null, postalCode = null;
  for (const comp of result.address_components || []) {
    const t = comp.types || [];
    if (t.includes("locality")) city = comp.long_name;
    else if (t.includes("administrative_area_level_1")) region = comp.long_name;
    else if (t.includes("country")) country = comp.long_name;
    else if (t.includes("postal_code")) postalCode = comp.long_name;
  }

  return res.status(200).json({
    lat: loc.lat,
    lng: loc.lng,
    formattedAddress: result.formatted_address,
    placeId: result.place_id,
    city,
    region,
    country,
    postalCode,
  });
}
