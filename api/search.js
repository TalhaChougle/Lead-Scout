/**
 * Vercel Serverless Function: /api/search
 *
 * Proxies business search requests to the Google Places Nearby Search API.
 * The API key is read from server-side environment variables and is NEVER
 * returned to the browser or logged.
 *
 * Query params:
 *   lat      (number)  — latitude of search center
 *   lng      (number)  — longitude of search center
 *   keyword  (string)  — business type / search keyword
 *   radius   (number)  — search radius in metres (max 50000)
 *   pagetoken (string) — next-page token from a previous response (optional)
 *
 * Returns:
 *   { results: NormalizedLead[], nextPageToken?: string, totalFound: number }
 *   or { error: "..." }
 */

const MAX_RADIUS = 50000; // 50 km hard cap
const MAX_RESULTS_PER_PAGE = 20; // Google Places returns up to 20 per page

/**
 * Normalize a single Google Places result into our internal Lead schema.
 * Only fields that are actually present in the provider response are populated.
 * Missing fields are explicitly null — never fabricated.
 */
function normalizePlacesResult(place) {
  const lat = place.geometry?.location?.lat ?? null;
  const lng = place.geometry?.location?.lng ?? null;

  // Build Google Maps URL from place_id when available, otherwise coordinates
  let googleMapsUrl = null;
  if (place.place_id) {
    googleMapsUrl = `https://www.google.com/maps/place/?q=place_id:${place.place_id}`;
  } else if (lat !== null && lng !== null) {
    googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || "")}@${lat},${lng}`;
  }

  // Website: Google Places Nearby Search does NOT return the website field.
  // That requires a Place Details call. We mark it as UNKNOWN until enriched.
  // hasWebsite = null means "not yet determined", false = "confirmed not found"
  return {
    id: place.place_id || null,
    source: "Google Places",
    sourceId: place.place_id || null,
    name: place.name || null,
    category: normalizeCategory(place.types),
    categories: place.types || [],
    address: place.vicinity || place.formatted_address || null,
    city: null, // populated by enrichment if needed
    latitude: lat,
    longitude: lng,
    phone: null, // not returned by Nearby Search — requires Details call
    website: null, // not returned by Nearby Search — requires Details call
    websiteStatus: "unknown", // "found" | "not_found" | "unknown"
    hasWebsite: null, // null = unknown
    hasPhone: null, // null = unknown
    googleMapsUrl,
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewCount: typeof place.user_ratings_total === "number" ? place.user_ratings_total : null,
    businessStatus: place.business_status || null,
    openNow: place.opening_hours?.open_now ?? null,
    priceLevel: place.price_level ?? null,
    photos: place.photos?.length > 0 ? place.photos.length : 0,
    discoveredAt: new Date().toISOString(),
    verifiedAt: null,
    verificationStatus: "provider_matched",
  };
}

/**
 * Turn Google's type array into a human-readable primary category.
 */
function normalizeCategory(types) {
  if (!Array.isArray(types) || types.length === 0) return "Local Business";

  const priority = [
    "restaurant", "cafe", "bakery", "bar", "food", "meal_takeaway", "meal_delivery",
    "doctor", "dentist", "hospital", "pharmacy", "health",
    "beauty_salon", "hair_care", "spa",
    "gym", "fitness_center",
    "lodging", "hotel",
    "real_estate_agency",
    "lawyer",
    "electrician", "plumber", "contractor",
    "clothing_store", "shoe_store", "jewelry_store",
    "electronics_store", "hardware_store",
    "grocery_or_supermarket", "supermarket",
    "school", "university",
    "bank", "finance",
    "car_dealer", "car_repair",
    "pet_store", "veterinary_care",
  ];

  for (const pref of priority) {
    if (types.includes(pref)) {
      return pref.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  // Filter out generic/unhelpful types
  const skip = new Set([
    "point_of_interest", "establishment", "premise", "political",
    "locality", "sublocality", "neighborhood", "route",
  ]);
  const useful = types.filter((t) => !skip.has(t));
  if (useful.length > 0) {
    return useful[0].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return "Local Business";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // ── Key guard — never leak the actual key value in any response ─────────
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error:
        "Google Places API key is not configured. Set GOOGLE_PLACES_API_KEY in your server environment.",
    });
  }

  // ── Input validation ─────────────────────────────────────────────────────
  const { lat, lng, keyword, radius, pagetoken } = req.query;

  if (!pagetoken) {
    // pagetoken-only requests reuse prior geocode, so lat/lng optional there
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ error: "lat and lng must be valid numbers" });
    }
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ error: "lat/lng values are out of valid range" });
    }
    if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
      return res.status(400).json({ error: "keyword is required" });
    }
  }

  const radiusNum = Math.min(Math.max(parseInt(radius, 10) || 5000, 100), MAX_RADIUS);

  // ── Build Google Places Nearby Search URL ────────────────────────────────
  let placesUrl;

  if (pagetoken && typeof pagetoken === "string") {
    // Pagination request — use pagetoken only
    placesUrl = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
    placesUrl.searchParams.set("pagetoken", pagetoken.trim());
    placesUrl.searchParams.set("key", apiKey);
  } else {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const kw = keyword.trim().slice(0, 200);

    placesUrl = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
    placesUrl.searchParams.set("location", `${latNum},${lngNum}`);
    placesUrl.searchParams.set("radius", String(radiusNum));
    placesUrl.searchParams.set("keyword", kw);
    placesUrl.searchParams.set("key", apiKey);
  }

  let data;
  try {
    const response = await fetch(placesUrl.toString(), { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      return res.status(502).json({ error: "Google Places service returned an error" });
    }
    data = await response.json();
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return res.status(504).json({ error: "Google Places request timed out" });
    }
    return res.status(502).json({ error: "Failed to reach Google Places service" });
  }

  // ── Google status handling — never expose key in error messages ──────────
  switch (data.status) {
    case "OK":
    case "ZERO_RESULTS":
      break;
    case "REQUEST_DENIED":
      return res.status(403).json({
        error:
          "Google Places API access denied. Verify the API key has the Places API enabled.",
      });
    case "OVER_DAILY_LIMIT":
    case "OVER_QUERY_LIMIT":
      return res.status(429).json({
        error: "Google Places API quota exceeded. Try again later.",
      });
    case "INVALID_REQUEST":
      return res.status(400).json({ error: "Invalid search request" });
    case "NOT_FOUND":
      return res.status(404).json({ error: "No results found for this location" });
    default:
      return res.status(502).json({ error: "Unexpected response from Google Places" });
  }

  const rawResults = data.results || [];
  const normalized = rawResults.map(normalizePlacesResult).filter((r) => r.name && r.id);

  return res.status(200).json({
    results: normalized,
    nextPageToken: data.next_page_token || null,
    totalFound: normalized.length,
    status: data.status,
  });
}
