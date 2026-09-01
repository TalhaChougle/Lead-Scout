/**
 * Vercel Serverless Function: /api/details
 *
 * Fetches full Place Details from Google Places API for a single place_id.
 * This is used to enrich leads with phone, website, opening hours — fields
 * that the Nearby Search endpoint does NOT return.
 *
 * The API key is server-side only and never returned to the browser.
 *
 * Query params:
 *   placeId (string) — Google Place ID, e.g. "ChIJ..."
 *
 * Returns enriched fields:
 *   { placeId, phone, website, openingHours, hasWebsite, hasPhone, address, url }
 */

const ALLOWED_FIELDS = [
  "place_id",
  "name",
  "formatted_phone_number",
  "international_phone_number",
  "website",
  "opening_hours",
  "formatted_address",
  "url",
  "business_status",
  "address_components",
].join(",");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Google Places API key is not configured. Set GOOGLE_PLACES_API_KEY in your environment.",
    });
  }

  const { placeId } = req.query;
  if (!placeId || typeof placeId !== "string" || !placeId.trim()) {
    return res.status(400).json({ error: "Missing required parameter: placeId" });
  }

  // Validate placeId looks like a Google Place ID (starts with "ChIJ" or similar)
  const cleanId = placeId.trim().slice(0, 300);
  if (!/^[A-Za-z0-9_-]+$/.test(cleanId)) {
    return res.status(400).json({ error: "Invalid placeId format" });
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", cleanId);
  url.searchParams.set("fields", ALLOWED_FIELDS);
  url.searchParams.set("key", apiKey);

  let data;
  try {
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      return res.status(502).json({ error: "Google Places Details service returned an error" });
    }
    data = await response.json();
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return res.status(504).json({ error: "Place Details request timed out" });
    }
    return res.status(502).json({ error: "Failed to reach Google Places Details service" });
  }

  switch (data.status) {
    case "OK":
      break;
    case "NOT_FOUND":
    case "ZERO_RESULTS":
      return res.status(404).json({ error: "Place not found" });
    case "REQUEST_DENIED":
      return res.status(403).json({
        error: "Google Places API access denied. Check that the Places API is enabled.",
      });
    case "OVER_DAILY_LIMIT":
    case "OVER_QUERY_LIMIT":
      return res.status(429).json({ error: "Google Places API quota exceeded." });
    case "INVALID_REQUEST":
      return res.status(400).json({ error: "Invalid place details request" });
    default:
      return res.status(502).json({ error: "Unexpected response from Google Places Details" });
  }

  const r = data.result || {};

  // Parse address components for city/region/country
  let city = null;
  let region = null;
  let country = null;
  let postalCode = null;

  if (Array.isArray(r.address_components)) {
    for (const comp of r.address_components) {
      const types = comp.types || [];
      if (types.includes("locality")) city = comp.long_name;
      else if (types.includes("administrative_area_level_1")) region = comp.long_name;
      else if (types.includes("country")) country = comp.long_name;
      else if (types.includes("postal_code")) postalCode = comp.long_name;
    }
  }

  // Normalize phone — prefer international format
  const phone = r.international_phone_number || r.formatted_phone_number || null;

  // Website — kept exactly as Google returns it (don't invent or assume)
  const website = r.website || null;

  // Opening hours
  let openingHours = null;
  if (r.opening_hours) {
    openingHours = {
      openNow: r.opening_hours.open_now ?? null,
      weekdayText: r.opening_hours.weekday_text || null,
    };
  }

  return res.status(200).json({
    placeId: r.place_id || cleanId,
    name: r.name || null,
    phone,
    website,
    hasPhone: phone !== null,
    hasWebsite: website !== null,
    websiteStatus: website !== null ? "found" : "not_found",
    openingHours,
    formattedAddress: r.formatted_address || null,
    city,
    region,
    country,
    postalCode,
    googleMapsUrl: r.url || null,
    businessStatus: r.business_status || null,
  });
}
