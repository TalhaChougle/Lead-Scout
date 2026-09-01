/**
 * Lead Scout — Production UI
 *
 * Data flow:
 *   User fills form → clicks Search
 *   → /api/geocode (server-side, key never exposed)
 *   → /api/search  (server-side, key never exposed)
 *   → Results normalised, deduplicated, scored
 *   → Displayed; "Load More" calls /api/search with next_page_token
 *   → Clicking "Get Details" calls /api/details per lead (lazy enrichment)
 *
 * Nothing fires on mount. No auto-refresh. No fake data.
 * The browser never touches Google directly.
 */

import React, { useState, useRef, useCallback } from "react";
import {
  Radar,
  MapPin,
  Search,
  Globe,
  GlobeLock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Phone,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader2,
  Filter,
  SlidersHorizontal,
  Star,
  MessageSquare,
  Clock,
  Info,
  Copy,
  Check,
  RefreshCw,
  ChevronRight,
  Building2,
  ShieldCheck,
} from "lucide-react";

import { geocodeLocation, searchBusinesses, fetchPlaceDetails } from "./lib/api.js";
import { deduplicateLeads } from "./lib/dedupe.js";
import { scoreLead } from "./lib/scoring.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const RADIUS_OPTIONS = [
  { label: "1 km", value: 1000 },
  { label: "2 km", value: 2000 },
  { label: "5 km", value: 5000 },
  { label: "10 km", value: 10000 },
  { label: "25 km", value: 25000 },
  { label: "50 km", value: 50000 },
];

const QUICK_CATEGORIES = [
  { label: "🍽️ Restaurants", kw: "restaurant" },
  { label: "☕ Cafes", kw: "cafe" },
  { label: "🩺 Clinics", kw: "clinic" },
  { label: "✂️ Salons", kw: "salon" },
  { label: "🏋️ Gyms", kw: "gym" },
  { label: "🏨 Hotels", kw: "hotel" },
  { label: "🦷 Dentists", kw: "dentist" },
  { label: "🏪 Retail Shops", kw: "shop" },
  { label: "🔧 Plumbers", kw: "plumber" },
  { label: "⚡ Electricians", kw: "electrician" },
  { label: "📸 Photographers", kw: "photographer" },
  { label: "🧁 Bakeries", kw: "bakery" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ratingStars(rating) {
  if (rating == null) return null;
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return { full, half, empty: 5 - full - (half ? 1 : 0) };
}

function copyToClipboard(text, cb) {
  navigator.clipboard.writeText(text).then(cb).catch(() => {});
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Lead Card ────────────────────────────────────────────────────────────────

function LeadCard({ lead, searchCenter, onEnrich }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(null); // "phone"|"address"|null
  const [enriching, setEnriching] = useState(false);

  const { score, tier, tierColor, reasons } = scoreLead(lead);

  const distance =
    searchCenter && lead.latitude != null && lead.longitude != null
      ? haversineKm(searchCenter.lat, searchCenter.lng, lead.latitude, lead.longitude).toFixed(1)
      : null;

  async function handleEnrich() {
    if (!lead.sourceId || lead._enriched) return;
    setEnriching(true);
    try {
      await onEnrich(lead.id);
    } finally {
      setEnriching(false);
    }
  }

  function handleCopy(value, key) {
    copyToClipboard(value, () => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const statusBadge = {
    OPERATIONAL: { label: "Open", color: "#14B8A6", bg: "#042F2E" },
    CLOSED_TEMPORARILY: { label: "Temp. Closed", color: "#F59E0B", bg: "#27210A" },
    CLOSED_PERMANENTLY: { label: "Permanently Closed", color: "#EF4444", bg: "#2D0A0A" },
  }[lead.businessStatus] || null;

  return (
    <div
      className="rounded-lg overflow-hidden transition-all"
      style={{ background: "#162238", border: "1px solid #1E293B" }}
    >
      {/* ── Header row ───────────────────────────────────────────────────── */}
      <div
        className="flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors select-none"
        onClick={() => setExpanded((p) => !p)}
      >
        {/* Score badge */}
        <div className="flex flex-col items-center justify-center flex-shrink-0 pt-0.5" style={{ width: 52 }}>
          <span style={{ fontFamily: "system-ui", fontWeight: 800, fontSize: 22, color: tierColor, lineHeight: 1 }}>
            {score}
          </span>
          <span style={{ fontSize: 9, color: tierColor, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>
            {tier}
          </span>
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-bold text-base text-slate-100 leading-tight">{lead.name}</span>

            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 capitalize">
              {lead.category}
            </span>

            {lead.hasWebsite === false && (
              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-semibold"
                style={{ color: "#38BDF8", background: "#0F2942" }}>
                <GlobeLock size={11} /> No Website
              </span>
            )}
            {lead.hasWebsite === true && (
              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded"
                style={{ color: "#2DD4BF", background: "#042F2E" }}>
                <Globe size={11} /> Has Website
              </span>
            )}

            {statusBadge && (
              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-medium"
                style={{ color: statusBadge.color, background: statusBadge.bg }}>
                {statusBadge.label}
              </span>
            )}

            {distance && (
              <span className="text-[11px] text-slate-500">
                {distance} km away
              </span>
            )}
          </div>

          {/* Address */}
          {lead.address && (
            <a
              href={lead.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name + " " + lead.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 hover:underline transition-colors mb-1.5 max-w-fit"
            >
              <MapPin size={11} className="flex-shrink-0" />
              <span className="truncate">{lead.address}</span>
              <ExternalLink size={9} className="flex-shrink-0 opacity-60" />
            </a>
          )}

          {/* Rating + Reviews + Phone quick view */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            {lead.rating != null && (
              <span className="flex items-center gap-1">
                <Star size={11} className="text-yellow-400 fill-yellow-400" />
                <span className="font-semibold text-slate-300">{lead.rating.toFixed(1)}</span>
                {lead.reviewCount != null && (
                  <span className="text-slate-500">({lead.reviewCount.toLocaleString()})</span>
                )}
              </span>
            )}
            {lead.hasPhone === true && lead.phone && (
              <span className="flex items-center gap-1 font-mono text-teal-300 text-[11px]">
                <Phone size={10} /> {lead.phone}
              </span>
            )}
            {lead.hasPhone === false && (
              <span className="text-slate-600 text-[11px] italic">No phone found</span>
            )}
            {lead.hasPhone === null && !lead._enriched && (
              <span className="text-slate-600 text-[11px] italic">Phone not checked</span>
            )}
            <span className="text-slate-700 font-mono text-[10px]">
              Source: {lead.source}
            </span>
          </div>
        </div>

        {/* Expand toggle */}
        <div className="flex-shrink-0 pt-1">
          {expanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
        </div>
      </div>

      {/* ── Expanded detail panel ─────────────────────────────────────────── */}
      {expanded && (
        <div
          className="px-5 pb-5 pt-4 flex flex-col gap-4"
          style={{ borderTop: "1px solid #1E293B" }}
        >
          {/* Enrichment prompt */}
          {!lead._enriched && lead.sourceId && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg"
              style={{ background: "#0F172A", border: "1px solid #1E293B" }}>
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Info size={14} className="text-teal-400 flex-shrink-0" />
                <span>Phone, website & opening hours require a separate lookup.</span>
              </div>
              <button
                onClick={handleEnrich}
                disabled={enriching}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                {enriching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                {enriching ? "Loading…" : "Get Details"}
              </button>
            </div>
          )}

          {/* Detail grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Contact */}
            <div className="p-3 rounded-lg flex flex-col gap-2.5" style={{ background: "#0F172A", border: "1px solid #1E293B" }}>
              <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Contact</h4>

              {/* Phone */}
              <div className="flex items-center gap-2 text-sm">
                <Phone size={13} className="flex-shrink-0 text-teal-400" />
                {lead.phone ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <a href={`tel:${lead.phone}`} className="font-mono text-teal-300 hover:underline text-xs truncate">{lead.phone}</a>
                    <button onClick={() => handleCopy(lead.phone, "phone")} className="text-slate-500 hover:text-teal-400 flex-shrink-0">
                      {copied === "phone" ? <Check size={12} className="text-teal-400" /> : <Copy size={12} />}
                    </button>
                  </div>
                ) : (
                  <span className="text-slate-600 text-xs italic">
                    {lead._enriched ? "Phone not found" : "Not checked yet"}
                  </span>
                )}
              </div>

              {/* Website */}
              <div className="flex items-center gap-2 text-sm">
                <Globe size={13} className="flex-shrink-0 text-teal-400" />
                {lead.website ? (
                  <a
                    href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-300 hover:underline text-xs truncate flex items-center gap-1"
                  >
                    {lead.website.replace(/^https?:\/\//, "").slice(0, 45)}
                    <ExternalLink size={9} />
                  </a>
                ) : (
                  <span className="text-slate-600 text-xs italic">
                    {lead._enriched
                      ? lead.hasWebsite === false
                        ? "No website found"
                        : "Website not found"
                      : "Not checked yet"}
                  </span>
                )}
              </div>

              {/* Address copy */}
              {lead.address && (
                <div className="flex items-center gap-2">
                  <MapPin size={13} className="flex-shrink-0 text-teal-400" />
                  <span className="text-xs text-slate-400 flex-1 leading-relaxed">{lead.address}</span>
                  <button onClick={() => handleCopy(lead.address, "address")} className="text-slate-500 hover:text-teal-400 flex-shrink-0">
                    {copied === "address" ? <Check size={12} className="text-teal-400" /> : <Copy size={12} />}
                  </button>
                </div>
              )}
            </div>

            {/* Business data */}
            <div className="p-3 rounded-lg flex flex-col gap-2.5" style={{ background: "#0F172A", border: "1px solid #1E293B" }}>
              <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Business Data</h4>

              {lead.rating != null && (
                <div className="flex items-center gap-2">
                  <Star size={13} className="text-yellow-400 fill-yellow-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-200">{lead.rating.toFixed(1)}</span>
                  {lead.reviewCount != null && (
                    <span className="text-xs text-slate-500">/ {lead.reviewCount.toLocaleString()} reviews</span>
                  )}
                </div>
              )}

              {lead.businessStatus && (
                <div className="flex items-center gap-2 text-xs">
                  <ShieldCheck size={13} className="text-teal-400 flex-shrink-0" />
                  <span className="text-slate-400">Status:</span>
                  <span style={{ color: statusBadge?.color || "#94A3B8" }}>
                    {lead.businessStatus.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                </div>
              )}

              {lead.openNow != null && (
                <div className="flex items-center gap-2 text-xs">
                  <Clock size={13} className="text-teal-400 flex-shrink-0" />
                  <span className="text-slate-400">Right now:</span>
                  <span className={lead.openNow ? "text-teal-300" : "text-red-400"}>
                    {lead.openNow ? "Open" : "Closed"}
                  </span>
                </div>
              )}

              {lead.openingHours?.weekdayText && (
                <div className="text-[11px] text-slate-500 space-y-0.5 leading-relaxed">
                  {lead.openingHours.weekdayText.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}

              {/* Source */}
              <div className="mt-auto pt-1 flex items-center gap-1.5 text-[11px] text-slate-600">
                <ShieldCheck size={11} />
                <span>Source: {lead.source} · ID: {lead.sourceId?.slice(0, 20)}…</span>
              </div>
            </div>
          </div>

          {/* Score breakdown */}
          <div className="p-3 rounded-lg" style={{ background: "#0F172A", border: "1px solid #1E293B" }}>
            <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              Lead Score Breakdown — {score}/100
            </h4>
            <div className="flex flex-wrap gap-2">
              {reasons.map((r, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 text-[11px] px-2 py-1 rounded"
                  style={{
                    background:
                      r.type === "positive" ? "#042F2E" :
                      r.type === "negative" ? "#2D0A0A" : "#1E293B",
                    color:
                      r.type === "positive" ? "#5EEAD4" :
                      r.type === "negative" ? "#FCA5A5" : "#94A3B8",
                  }}
                >
                  {r.type === "positive" ? <CheckCircle2 size={10} /> :
                   r.type === "negative" ? <XCircle size={10} /> :
                   <Info size={10} />}
                  {r.points !== 0 && (
                    <span className="font-mono font-bold">
                      {r.points > 0 ? `+${r.points}` : r.points}
                    </span>
                  )}
                  {r.label}
                </span>
              ))}
            </div>
          </div>

          {/* Action row */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a
              href={lead.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((lead.name || "") + " " + (lead.address || ""))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 transition-colors"
            >
              <MapPin size={12} /> View on Maps <ExternalLink size={10} />
            </a>
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 transition-colors"
              >
                <Phone size={12} /> Call
              </a>
            )}
            {lead.website && (
              <a
                href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 transition-colors"
              >
                <Globe size={12} /> Visit Website <ExternalLink size={10} />
              </a>
            )}
            <button
              onClick={() => handleCopy(
                [lead.name, lead.address, lead.phone, lead.website].filter(Boolean).join("\n"),
                "all"
              )}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors ml-auto"
            >
              {copied === "all" ? <Check size={12} className="text-teal-400" /> : <Copy size={12} />}
              {copied === "all" ? "Copied!" : "Copy Lead"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeadScout() {
  // ── Search form state ───────────────────────────────────────────────────
  const [location, setLocation] = useState("");
  const [keyword, setKeyword] = useState("");
  const [radiusMetres, setRadiusMetres] = useState(5000);
  const [showFilters, setShowFilters] = useState(false);

  // Filter controls
  const [filterWebsite, setFilterWebsite] = useState("all"); // "all"|"no_website"|"has_website"
  const [filterPhone, setFilterPhone] = useState("all"); // "all"|"has_phone"|"no_phone"
  const [minRating, setMinRating] = useState(0);
  const [minReviews, setMinReviews] = useState(0);
  const [filterStatus, setFilterStatus] = useState("all"); // "all"|"OPERATIONAL"|"CLOSED_TEMPORARILY"
  const [sortBy, setSortBy] = useState("score"); // "score"|"rating"|"reviews"|"name"|"distance"

  // ── Results state ───────────────────────────────────────────────────────
  const [leads, setLeads] = useState([]);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [searchCenter, setSearchCenter] = useState(null); // { lat, lng }
  const [resolvedAddress, setResolvedAddress] = useState("");
  const [totalFromProvider, setTotalFromProvider] = useState(0);

  // ── UI state ────────────────────────────────────────────────────────────
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState("idle"); // "idle"|"geocoding"|"searching"|"done"
  const [hasSearched, setHasSearched] = useState(false);

  const abortRef = useRef(null);

  // ── Search handler ──────────────────────────────────────────────────────
  const handleSearch = useCallback(
    async (overrideKeyword) => {
      const loc = location.trim();
      const kw = (overrideKeyword !== undefined ? overrideKeyword : keyword).trim();

      if (!loc) {
        setError("Please enter a location (e.g. Bandra, Mumbai).");
        return;
      }
      if (!kw) {
        setError("Please enter a business type or keyword (e.g. restaurant).");
        return;
      }

      // Cancel any in-flight request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSearching(true);
      setError(null);
      setLeads([]);
      setNextPageToken(null);
      setTotalFromProvider(0);
      setHasSearched(true);

      try {
        // Step 1: Geocode
        setPhase("geocoding");
        const geo = await geocodeLocation(loc, controller.signal);
        setSearchCenter({ lat: geo.lat, lng: geo.lng });
        setResolvedAddress(geo.formattedAddress);

        // Step 2: Search
        setPhase("searching");
        const result = await searchBusinesses(
          { lat: geo.lat, lng: geo.lng, keyword: kw, radiusMetres },
          null,
          controller.signal
        );

        const deduped = deduplicateLeads(result.results || []);
        setLeads(deduped);
        setNextPageToken(result.nextPageToken || null);
        setTotalFromProvider(result.totalFound || 0);
        setPhase("done");
      } catch (err) {
        if (err.name === "AbortError") return;
        setError(err.message || "Search failed. Please try again.");
        setPhase("idle");
      } finally {
        setSearching(false);
      }
    },
    [location, keyword, radiusMetres]
  );

  // ── Load more (pagination) ──────────────────────────────────────────────
  const handleLoadMore = useCallback(async () => {
    if (!nextPageToken || loadingMore) return;

    const controller = new AbortController();
    setLoadingMore(true);
    setError(null);

    try {
      // Google requires a short delay before using a pagetoken
      await new Promise((r) => setTimeout(r, 2000));

      const result = await searchBusinesses(
        { lat: searchCenter?.lat, lng: searchCenter?.lng, keyword, radiusMetres },
        nextPageToken,
        controller.signal
      );

      const newLeads = deduplicateLeads([...leads, ...(result.results || [])]);
      setLeads(newLeads);
      setNextPageToken(result.nextPageToken || null);
      setTotalFromProvider((p) => p + (result.totalFound || 0));
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message || "Failed to load more results.");
    } finally {
      setLoadingMore(false);
    }
  }, [nextPageToken, loadingMore, leads, searchCenter, keyword, radiusMetres]);

  // ── Lead enrichment (lazy) ───────────────────────────────────────────────
  const handleEnrich = useCallback(
    async (leadId) => {
      const lead = leads.find((l) => l.id === leadId);
      if (!lead?.sourceId || lead._enriched) return;

      try {
        const details = await fetchPlaceDetails(lead.sourceId);
        setLeads((prev) =>
          prev.map((l) =>
            l.id === leadId
              ? {
                  ...l,
                  phone: details.phone ?? l.phone,
                  website: details.website ?? l.website,
                  hasPhone: details.hasPhone,
                  hasWebsite: details.hasWebsite,
                  websiteStatus: details.websiteStatus,
                  openNow: details.openingHours?.openNow ?? l.openNow,
                  openingHours: details.openingHours,
                  formattedAddress: details.formattedAddress ?? l.address,
                  address: details.formattedAddress ?? l.address,
                  city: details.city ?? l.city,
                  googleMapsUrl: details.googleMapsUrl ?? l.googleMapsUrl,
                  businessStatus: details.businessStatus ?? l.businessStatus,
                  _enriched: true,
                }
              : l
          )
        );
      } catch (err) {
        // Non-fatal — enrich silently fails, user can retry
        console.warn("Enrichment failed for", lead.name, err.message);
      }
    },
    [leads]
  );

  // ── Client-side filtering & sorting ─────────────────────────────────────
  const filteredLeads = leads
    .filter((l) => {
      if (filterWebsite === "no_website" && l.hasWebsite !== false) return false;
      if (filterWebsite === "has_website" && l.hasWebsite !== true) return false;
      if (filterPhone === "has_phone" && l.hasPhone !== true) return false;
      if (filterPhone === "no_phone" && l.hasPhone !== false) return false;
      if (minRating > 0 && (l.rating == null || l.rating < minRating)) return false;
      if (minReviews > 0 && (l.reviewCount == null || l.reviewCount < minReviews)) return false;
      if (filterStatus !== "all" && l.businessStatus !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      const { score: sa } = scoreLead(a);
      const { score: sb } = scoreLead(b);
      if (sortBy === "score") return sb - sa;
      if (sortBy === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      if (sortBy === "reviews") return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
      if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
      if (sortBy === "distance" && searchCenter) {
        const da = a.latitude != null ? haversineKm(searchCenter.lat, searchCenter.lng, a.latitude, a.longitude) : 9999;
        const db = b.latitude != null ? haversineKm(searchCenter.lat, searchCenter.lng, b.latitude, b.longitude) : 9999;
        return da - db;
      }
      return 0;
    });

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "#0B132B", color: "#F1F5F9", fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* Font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="border-b sticky top-0 z-30" style={{ borderColor: "#1E293B", background: "#0B132B" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8">
              <Radar size={22} style={{ color: "#2DD4BF" }} />
            </div>
            <div>
              <h1 className="font-extrabold text-lg leading-none tracking-tight">
                Lead Scout
                <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "#0F2942", color: "#2DD4BF", border: "1px solid #0D9488", verticalAlign: "middle" }}>
                  Real Data Only
                </span>
              </h1>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                Google Places → server proxy → your browser. Key never exposed.
              </p>
            </div>
          </div>

          {hasSearched && !searching && (
            <button
              onClick={() => handleSearch()}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 transition-colors"
            >
              <RefreshCw size={13} /> Re-run
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">

        {/* ── Search panel ──────────────────────────────────────────────── */}
        <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: "#162238", border: "1px solid #1E293B" }}>
          {/* Row 1: Location + Keyword */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin size={11} className="text-teal-400" /> Location
              </span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="e.g. Bandra, Mumbai or Andheri West"
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 outline-none transition-colors"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 size={11} className="text-teal-400" /> Business / Keyword
              </span>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="e.g. restaurant, dentist, salon, gym"
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 outline-none transition-colors"
              />
            </label>
          </div>

          {/* Row 2: Radius + search button */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Radius
              </span>
              <div className="flex flex-wrap gap-2">
                {RADIUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setRadiusMetres(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      radiusMetres === opt.value
                        ? "bg-teal-500 text-slate-950 font-bold shadow-lg shadow-teal-500/20"
                        : "bg-slate-800 text-slate-400 border border-slate-700 hover:border-teal-500/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setShowFilters((p) => !p)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                <SlidersHorizontal size={14} />
                Filters
                {(filterWebsite !== "all" || filterPhone !== "all" || minRating > 0 || minReviews > 0 || filterStatus !== "all") && (
                  <span className="w-2 h-2 rounded-full bg-teal-400 flex-shrink-0" />
                )}
              </button>

              <button
                onClick={() => handleSearch()}
                disabled={searching}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-lg shadow-teal-500/20"
              >
                {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                {searching
                  ? phase === "geocoding" ? "Resolving location…" : "Searching…"
                  : "Search"}
              </button>
            </div>
          </div>

          {/* Row 3: Filters panel */}
          {showFilters && (
            <div className="pt-3 border-t grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" style={{ borderColor: "#1E293B" }}>
              {/* Website filter */}
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Website</span>
                <select
                  value={filterWebsite}
                  onChange={(e) => setFilterWebsite(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
                >
                  <option value="all">Any</option>
                  <option value="no_website">No website</option>
                  <option value="has_website">Has website</option>
                </select>
              </label>

              {/* Phone filter */}
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Phone</span>
                <select
                  value={filterPhone}
                  onChange={(e) => setFilterPhone(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
                >
                  <option value="all">Any</option>
                  <option value="has_phone">Has phone</option>
                  <option value="no_phone">No phone</option>
                </select>
              </label>

              {/* Min rating */}
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Min Rating</span>
                <select
                  value={minRating}
                  onChange={(e) => setMinRating(parseFloat(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
                >
                  <option value={0}>Any</option>
                  <option value={3}>3.0+</option>
                  <option value={3.5}>3.5+</option>
                  <option value={4}>4.0+</option>
                  <option value={4.5}>4.5+</option>
                </select>
              </label>

              {/* Min reviews */}
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Min Reviews</span>
                <select
                  value={minReviews}
                  onChange={(e) => setMinReviews(parseInt(e.target.value, 10))}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
                >
                  <option value={0}>Any</option>
                  <option value={10}>10+</option>
                  <option value={25}>25+</option>
                  <option value={50}>50+</option>
                  <option value={100}>100+</option>
                  <option value={250}>250+</option>
                  <option value={500}>500+</option>
                </select>
              </label>

              {/* Business status */}
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
                >
                  <option value="all">Any</option>
                  <option value="OPERATIONAL">Operational</option>
                  <option value="CLOSED_TEMPORARILY">Temporarily Closed</option>
                </select>
              </label>

              {/* Sort */}
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Sort By</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
                >
                  <option value="score">Lead Score</option>
                  <option value="rating">Rating</option>
                  <option value="reviews">Review Count</option>
                  <option value="name">Name A–Z</option>
                  <option value="distance">Distance</option>
                </select>
              </label>
            </div>
          )}
        </div>

        {/* ── Quick category chips ───────────────────────────────────────── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
          {QUICK_CATEGORIES.map((cat) => (
            <button
              key={cat.kw}
              onClick={() => {
                setKeyword(cat.kw);
                if (location.trim()) handleSearch(cat.kw);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                keyword === cat.kw
                  ? "bg-teal-500 text-slate-950 font-bold shadow-teal-500/20 shadow-sm"
                  : "bg-slate-800 text-slate-300 border border-slate-700 hover:border-teal-500/40"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-sm">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Search error</p>
              <p className="text-red-400 text-xs mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* ── Loading skeleton ──────────────────────────────────────────────── */}
        {searching && (
          <div className="flex flex-col items-center py-16 gap-4">
            <Loader2 size={36} className="animate-spin text-teal-400" />
            <div className="text-center">
              <p className="font-semibold text-slate-200">
                {phase === "geocoding" ? "Resolving location…" : "Searching real business data…"}
              </p>
              <p className="text-xs text-slate-500 mt-1 font-mono">
                {phase === "geocoding"
                  ? "Geocoding address via server proxy"
                  : "Querying Google Places via server proxy — key never exposed"}
              </p>
            </div>
          </div>
        )}

        {/* ── Results bar ──────────────────────────────────────────────────── */}
        {!searching && hasSearched && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg"
            style={{ background: "#162238", border: "1px solid #1E293B" }}>
            <div>
              <span className="font-bold text-slate-100">
                {filteredLeads.length} result{filteredLeads.length !== 1 ? "s" : ""}
              </span>
              {filteredLeads.length !== leads.length && (
                <span className="text-slate-500 text-sm"> (filtered from {leads.length})</span>
              )}
              {resolvedAddress && (
                <span className="text-slate-400 text-sm"> near <strong className="text-teal-400">{resolvedAddress}</strong></span>
              )}
              <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                <Info size={10} />
                Results from Google Places — coverage depends on provider data availability.
              </p>
            </div>

            {/* Sort shortcut when filters are hidden */}
            {!showFilters && (
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="text-xs bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white outline-none focus:border-teal-500"
              >
                <option value="score">Sort: Lead Score</option>
                <option value="rating">Sort: Rating</option>
                <option value="reviews">Sort: Reviews</option>
                <option value="name">Sort: Name</option>
                <option value="distance">Sort: Distance</option>
              </select>
            )}
          </div>
        )}

        {/* ── Empty state ────────────────────────────────────────────────────── */}
        {!searching && hasSearched && leads.length === 0 && !error && (
          <div className="text-center py-16 rounded-xl border border-dashed border-slate-700">
            <Search size={40} className="text-slate-700 mx-auto mb-4" />
            <p className="text-slate-300 font-semibold text-lg">No real businesses found</p>
            <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
              No results were returned by Google Places for this search. Try:
            </p>
            <ul className="text-slate-500 text-sm mt-3 space-y-1">
              <li>• Increasing the radius</li>
              <li>• Changing the keyword (e.g. "dentist" instead of "dental clinic")</li>
              <li>• Using a broader location</li>
            </ul>
          </div>
        )}

        {/* ── Empty after filter ────────────────────────────────────────────── */}
        {!searching && leads.length > 0 && filteredLeads.length === 0 && (
          <div className="text-center py-10 rounded-xl border border-dashed border-slate-700">
            <Filter size={32} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-300 font-semibold">No leads match your current filters</p>
            <p className="text-slate-500 text-sm mt-1">
              {leads.length} total results available — adjust filters to see them.
            </p>
            <p className="text-xs text-slate-600 mt-2">
              Note: website and phone filters require "Get Details" to be run per lead first.
            </p>
          </div>
        )}

        {/* ── Lead cards ────────────────────────────────────────────────────── */}
        {!searching && filteredLeads.length > 0 && (
          <div className="flex flex-col gap-3">
            {filteredLeads.map((lead) => (
              <LeadCard
                key={lead.id || lead.sourceId}
                lead={lead}
                searchCenter={searchCenter}
                onEnrich={handleEnrich}
              />
            ))}
          </div>
        )}

        {/* ── Load more ─────────────────────────────────────────────────────── */}
        {!searching && nextPageToken && (
          <div className="text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loadingMore ? (
                <><Loader2 size={15} className="animate-spin" /> Loading more results…</>
              ) : (
                <><ChevronRight size={15} /> Load more results</>
              )}
            </button>
            <p className="text-xs text-slate-600 mt-2">
              Google Places returns up to 20 results per page.
            </p>
          </div>
        )}

        {/* ── Idle / welcome state ──────────────────────────────────────────── */}
        {!hasSearched && !searching && (
          <div className="flex flex-col items-center text-center py-16 gap-4">
            <Radar size={48} className="text-teal-500/30" />
            <div>
              <h2 className="text-xl font-bold text-slate-300">Find real businesses — no fake data</h2>
              <p className="text-slate-500 text-sm mt-2 max-w-md">
                Enter a location and business type above, then click Search.
                Results come from Google Places via a secure server proxy.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {[
                { loc: "Bandra, Mumbai", kw: "restaurant" },
                { loc: "Andheri West, Mumbai", kw: "salon" },
                { loc: "Pune", kw: "dentist" },
                { loc: "Bangalore", kw: "gym" },
                { loc: "Dubai", kw: "cafe" },
              ].map((ex) => (
                <button
                  key={ex.kw}
                  onClick={() => {
                    setLocation(ex.loc);
                    setKeyword(ex.kw);
                  }}
                  className="px-3 py-1.5 rounded-full text-xs text-slate-400 border border-slate-700 hover:border-teal-500/40 hover:text-teal-400 transition-colors"
                >
                  {ex.kw} in {ex.loc}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer disclaimer ────────────────────────────────────────────── */}
        <footer className="text-center pt-4 pb-6">
          <p className="text-xs text-slate-700">
            Results sourced from Google Places API. Coverage and accuracy depend on provider data.
            Ratings, reviews, and business status are as reported by Google.
            No data is fabricated by this application.
          </p>
        </footer>
      </main>
    </div>
  );
}
