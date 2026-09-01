/**
 * Vercel Serverless Function: /api/autocomplete
 *
 * Proxies Google Places Autocomplete requests server-side.
 * The API key never leaves the server.
 *
 * Query params:
 *   input (string) — partial location text, e.g. "Bandra"
 *
 * Returns:
 *   { suggestions: [{ placeId, description, mainText, secondaryText }] }
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
      error: "Location search is not configured. Please set GOOGLE_PLACES_API_KEY in your environment.",
    });
  }

  const { input } = req.query;
  if (!input || typeof input !== "string" || !input.trim()) {
    return res.status(400).json({ error: "Missing required parameter: input" });
  }

  const trimmed = input.trim().slice(0, 200);

  // Use Places Autocomplete — geocode=true biases toward places/regions
  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", trimmed);
  url.searchParams.set("types", "(regions)"); // cities, localities, sublocalities, neighbourhoods
  url.searchParams.set("key", apiKey);

  let data;
  try {
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      return res.status(502).json({ error: "Location suggestion service unavailable" });
    }
    data = await response.json();
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return res.status(504).json({ error: "Location search timed out. Try again." });
    }
    return res.status(502).json({ error: "Failed to reach location service" });
  }

  switch (data.status) {
    case "OK":
    case "ZERO_RESULTS":
      break;
    case "REQUEST_DENIED":
      return res.status(403).json({
        error: "Location API access denied. Verify GOOGLE_PLACES_API_KEY has the Places API enabled.",
      });
    case "OVER_DAILY_LIMIT":
    case "OVER_QUERY_LIMIT":
      return res.status(429).json({ error: "Location search quota exceeded. Try again later." });
    case "INVALID_REQUEST":
      return res.status(400).json({ error: "Invalid location search query" });
    default:
      return res.status(502).json({ error: "Unexpected response from location service" });
  }

  const suggestions = (data.predictions || []).map((p) => ({
    placeId: p.place_id,
    description: p.description,
    mainText: p.structured_formatting?.main_text || p.description.split(",")[0],
    secondaryText: p.structured_formatting?.secondary_text || "",
  }));

  return res.status(200).json({ suggestions });
}
