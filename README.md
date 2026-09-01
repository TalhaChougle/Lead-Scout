# Lead Scout

A production-ready lead generation application that finds real businesses using the Google Places API. Enter a location and a business type, get back verified results with ratings, reviews, phone numbers, websites, and a transparent lead score.

**No fake data. No invented phone numbers. No fabricated websites. Real provider data only.**

---

## What Lead Scout does

1. User enters a location (e.g. "Bandra, Mumbai") and a keyword (e.g. "restaurant")
2. The frontend calls `/api/geocode` — a server-side Vercel function — which resolves the address to coordinates via Google Geocoding API
3. The frontend calls `/api/search` — another server-side function — which queries Google Places Nearby Search with the coordinates, keyword, and radius
4. Up to 20 results per page are returned, normalised, and deduplicated by `place_id`
5. Each result shows real data: name, address, category, rating, review count, and business status
6. Clicking **Get Details** on any lead calls `/api/details`, which fetches phone, website, and opening hours from the Google Places Details API
7. A deterministic lead score (0–100) is calculated from real fields — no AI guessing

The Google API key lives exclusively in server-side environment variables. It is never in the browser bundle, never in localStorage, never in a URL, never in a network response.

---

## Architecture

```
Browser
  │
  ├─ GET /api/geocode?address=...   ──► Google Geocoding API
  ├─ GET /api/search?lat=&lng=&...  ──► Google Places Nearby Search
  └─ GET /api/details?placeId=...   ──► Google Places Details

Vercel Serverless Functions (api/)
  ├─ api/geocode.js    — resolves text location → lat/lng
  ├─ api/search.js     — nearby business search with radius + keyword
  └─ api/details.js    — enriches a single lead with phone/website/hours

Frontend (src/)
  ├─ src/LeadScout.jsx       — main UI component
  ├─ src/lib/api.js          — browser API client (calls /api/*)
  ├─ src/lib/scoring.js      — deterministic lead scorer
  └─ src/lib/dedupe.js       — deduplication by place_id + name/address fallback
```

---

## Required environment variables

| Variable | Description |
|---|---|
| `GOOGLE_PLACES_API_KEY` | Google Cloud API key with **Places API** and **Geocoding API** enabled |

> ⚠️ **Do NOT prefix this with `VITE_`.** Vite injects `VITE_*` variables into the browser bundle. This key must remain server-side only.

### How to get a Google Places API key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable these two APIs:
   - **Places API** (or "Places API (New)")
   - **Geocoding API**
4. Go to **Credentials** → **Create Credentials** → **API Key**
5. Restrict the key to only those two APIs (strongly recommended)
6. For production: add HTTP referrer restrictions to your deployed domain

---

## Local setup

### Prerequisites

- Node.js 18+
- [Vercel CLI](https://vercel.com/docs/cli) for running API routes locally: `npm i -g vercel`

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Copy the example env file and fill in your key
cp .env.example .env.local
# Edit .env.local and set: GOOGLE_PLACES_API_KEY=your_actual_key

# 3. Run the full dev environment (Vite + serverless functions together)
vercel dev
```

`vercel dev` starts everything on `http://localhost:3000` — the Vite frontend and the `/api/*` functions in the same process, with your `.env.local` variables loaded automatically.

> **Note:** `npm run dev` alone starts the Vite dev server on port 5173 and proxies `/api` calls to port 3000. You need `vercel dev` running separately on port 3000 for the API routes to work in that mode. Using `vercel dev` alone is simpler.

### Build

```bash
npm run build
```

Produces a production bundle in `dist/`. Passes cleanly with zero errors.

---

## Vercel deployment

1. Push the repository to GitHub
2. Import the project in [Vercel](https://vercel.com/new)
3. In **Project Settings → Environment Variables**, add:
   ```
   GOOGLE_PLACES_API_KEY = your_actual_key
   ```
4. Deploy — Vercel automatically detects Vite and serves the `/api` functions as serverless routes

The `vercel.json` in this repository configures the build output, function runtime (Node 20), and rewrite rules.

---

## Search usage

### Examples

| Location | Keyword | Radius |
|---|---|---|
| Bandra, Mumbai | restaurant | 5 km |
| Andheri West, Mumbai | salon | 2 km |
| Pune | dentist | 10 km |
| Bangalore | gym | 5 km |
| London | cafe | 1 km |
| Dubai | hotel | 10 km |
| New York, NY | electrician | 5 km |

### Supported search patterns

- City name: `Mumbai`, `Pune`, `London`
- Locality + city: `Bandra, Mumbai`, `Andheri West, Mumbai`
- Any business keyword: `restaurant`, `dentist`, `salon`, `gym`, `hotel`, `plumber`, `photographer`, `bakery`, `real estate agency`, etc.
- Radius: 1 km / 2 km / 5 km / 10 km / 25 km / 50 km

### Filters

After searching, use the **Filters** panel to narrow results by:

- Website (any / no website / has website)
- Phone (any / has phone / no phone)
- Minimum rating (3.0+ through 4.5+)
- Minimum reviews (10+ through 500+)
- Business status (operational / temporarily closed)

> **Note:** Website and phone filters only apply to leads where **Get Details** has been run. Nearby Search does not return those fields — they require a separate Details API call per lead.

### Sorting

Results can be sorted by: Lead Score · Rating · Review Count · Name A–Z · Distance

### Pagination

Google Places returns up to 20 results per request. If more are available, a **Load More** button appears. Each page requires a 2-second delay before the next request (Google Places API requirement for page tokens).

---

## Lead scoring

Each lead receives a score from 0–100 based entirely on real retrieved data. The breakdown is shown inside each expanded lead card.

| Factor | Max points |
|---|---|
| No website found | +25 |
| Has website | +5 |
| Rating ≥ 4.5 | +20 |
| Rating ≥ 4.0 | +15 |
| Rating ≥ 3.5 | +10 |
| 500+ reviews | +20 |
| 100+ reviews | +15 |
| 20+ reviews | +10 |
| Phone available | +15 |
| Business operational | +10 |
| Complete address | +5 |
| Coordinates available | +5 |

Tiers: **Hot Lead** (70–100) · **Warm Lead** (45–69) · **Cool Lead** (0–44)

The score is deterministic — the same lead always produces the same score given the same data.

---

## Data accuracy disclaimer

Results are sourced from the Google Places API. Coverage and accuracy depend entirely on what Google has indexed for a given area. Lead Scout does not modify, supplement, or invent any business data.

- **Ratings and review counts** are as reported by Google at the time of the search
- **Website and phone** are only shown after clicking "Get Details" — they come from Google's Places Details endpoint
- **"Website not found"** means Google's Places data does not list a website for that business — it does not guarantee the business has no web presence
- **Business status** (Operational / Temporarily Closed / Permanently Closed) is as reported by Google
- Google Places does not guarantee complete coverage of all businesses in any area
- Result counts reflect what the API returned for your query, not every business that exists

---

## Security

- `GOOGLE_PLACES_API_KEY` is a **server-side only** environment variable
- It is read by Vercel serverless functions (`api/*.js`) and passed directly to Google's API — it never appears in any HTTP response sent to the browser
- The compiled browser bundle contains no API keys, no `process.env` references, no `VITE_` variables
- No secrets are stored in `localStorage`, `sessionStorage`, cookies, or URL parameters
- `.env` and `.env.local` are excluded from Git by `.gitignore`; only `.env.example` (which contains no real values) is committed

### If you suspect a key has been exposed

If a real API key was previously committed to the Git history (even if later deleted from a file), treat it as compromised. The fix is to **revoke and regenerate** the key in Google Cloud Console, not just remove it from the current source file. Git history retains all previous commits.

---

## Troubleshooting

**"Google Places API key is not configured"**
→ You haven't set `GOOGLE_PLACES_API_KEY` in your environment. Add it to `.env.local` for local dev or to Vercel's environment variable settings for production.

**"Google Places API access denied"**
→ The key exists but the Places API or Geocoding API is not enabled for it. Check the Google Cloud Console → APIs & Services → Enabled APIs.

**"Google Places API quota exceeded"**
→ You've hit the daily free tier limit. Check usage in Google Cloud Console. Consider enabling billing to increase limits.

**"Location not found"**
→ The geocoder couldn't resolve the text you entered. Try a more specific address (add city/country), or check for typos.

**No results after searching**
→ Try a larger radius, a simpler keyword (e.g. "restaurant" instead of "italian fine dining"), or a broader location.

**Filters show 0 results but search returned leads**
→ Website/phone filters require "Get Details" to be clicked per lead before those fields are populated. Alternatively, relax the filter to "Any".

**`vercel dev` command not found**
→ Install the Vercel CLI: `npm i -g vercel`, then log in with `vercel login`.

---

## Provider limitations

Google Places Nearby Search:
- Returns up to 60 results maximum (3 pages × 20) per query
- Does not return phone or website in the Nearby Search response — those require a separate Details call (which costs an additional API request)
- Coverage varies by region; rural areas may return fewer results
- Data freshness depends on when Google last indexed the business

This application makes no claims about completeness. If a search returns 8 results, those are the 8 businesses Google's API returned for that query — not "every business" in the area.
