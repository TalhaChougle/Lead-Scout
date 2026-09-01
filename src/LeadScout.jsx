/**
 * Lead Scout — Production UI
 *
 * Architecture:
 *   1. User types in Location → debounced /api/autocomplete → dropdown suggestions
 *   2. User selects a suggestion → /api/geocode (placeId) → stores lat/lng
 *   3. User fills keyword + radius → clicks Search
 *   4. /api/search (lat, lng, keyword, radius) → real Google Places results
 *   5. "Get Details" per lead → /api/details → phone, website, hours
 *
 * The API key lives only in Vercel environment variables.
 * The browser never calls Google directly and never sees the key.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
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
  SlidersHorizontal,
  Star,
  Clock,
  Info,
  Copy,
  Check,
  RefreshCw,
  ChevronRight,
  Building2,
  ShieldCheck,
  X,
} from "lucide-react";

import { autocompleteLocation, geocodeLocation, searchBusinesses, fetchPlaceDetails } from "./lib/api.js";
import { deduplicateLeads } from "./lib/dedupe.js";
import { scoreLead } from "./lib/scoring.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const RADIUS_OPTIONS = [
  { label: "1 km",  value: 1000  },
  { label: "2 km",  value: 2000  },
  { label: "5 km",  value: 5000  },
  { label: "10 km", value: 10000 },
  { label: "25 km", value: 25000 },
  { label: "50 km", value: 50000 },
];

const QUICK_CATEGORIES = [
  { label: "🍽️ Restaurants",   kw: "restaurant"  },
  { label: "☕ Cafes",          kw: "cafe"         },
  { label: "🩺 Clinics",        kw: "clinic"       },
  { label: "✂️ Salons",         kw: "salon"        },
  { label: "🏋️ Gyms",          kw: "gym"          },
  { label: "🏨 Hotels",         kw: "hotel"        },
  { label: "🦷 Dentists",       kw: "dentist"      },
  { label: "🏪 Retail Shops",   kw: "shop"         },
  { label: "🔧 Plumbers",       kw: "plumber"      },
  { label: "⚡ Electricians",   kw: "electrician"  },
  { label: "📸 Photographers",  kw: "photographer" },
  { label: "🧁 Bakeries",       kw: "bakery"       },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function copyToClipboard(text, cb) {
  navigator.clipboard.writeText(text).then(cb).catch(() => {});
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── LocationAutocomplete ─────────────────────────────────────────────────────

function LocationAutocomplete({ value, onChange, onSelect, disabled }) {
  const [inputText, setInputText]       = useState(value?.label || "");
  const [suggestions, setSuggestions]   = useState([]);
  const [loading, setLoading]           = useState(false);
  const [open, setOpen]                 = useState(false);
  const [acError, setAcError]           = useState(null);
  const [activeIdx, setActiveIdx]       = useState(-1);

  const debouncedText = useDebounce(inputText, 320);
  const abortRef      = useRef(null);
  const wrapRef       = useRef(null);
  const inputRef      = useRef(null);

  // Fetch suggestions whenever debounced text changes
  useEffect(() => {
    const txt = debouncedText.trim();
    if (!txt || txt.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setAcError(null);
      return;
    }
    // Don't re-fetch if the text already matches the selected label
    if (value?.label === txt) return;

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setAcError(null);

    autocompleteLocation(txt, ctrl.signal)
      .then((data) => {
        setSuggestions(data.suggestions || []);
        setOpen(true);
        setActiveIdx(-1);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setAcError(err.message || "Location search failed");
        setSuggestions([]);
        setOpen(true);
      })
      .finally(() => setLoading(false));
  }, [debouncedText]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleInputChange(e) {
    const txt = e.target.value;
    setInputText(txt);
    // If user edits after selecting, clear the resolved coordinates
    if (value?.label !== txt) {
      onChange(null);
    }
  }

  function handleSelect(suggestion) {
    setInputText(suggestion.description);
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
    // Pass the selected suggestion up — parent will geocode to get lat/lng
    onSelect(suggestion);
    onChange({ label: suggestion.description, placeId: suggestion.placeId, resolved: false });
  }

  function handleClear() {
    setInputText("");
    setSuggestions([]);
    setOpen(false);
    onChange(null);
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0 && suggestions[activeIdx]) {
      e.preventDefault();
      handleSelect(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const isResolved = value?.resolved === true;

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={handleInputChange}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="e.g. Bandra West, Mumbai"
          autoComplete="off"
          spellCheck="false"
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 outline-none transition-colors pr-16"
          style={isResolved ? { borderColor: "#0D9488" } : {}}
        />

        {/* Status icons inside input */}
        <div className="absolute right-2.5 flex items-center gap-1.5 pointer-events-none">
          {loading && <Loader2 size={13} className="animate-spin text-teal-400" />}
          {!loading && isResolved && <CheckCircle2 size={13} className="text-teal-400" />}
        </div>
        {inputText && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-8 text-slate-500 hover:text-slate-300 transition-colors pointer-events-auto"
            tabIndex={-1}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Resolved label */}
      {isResolved && (
        <p className="text-[11px] text-teal-400 mt-1 flex items-center gap-1">
          <CheckCircle2 size={10} /> Location resolved — ready to search
        </p>
      )}

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 rounded-lg overflow-hidden shadow-2xl"
          style={{
            background: "#0F172A",
            border: "1px solid #1E293B",
            zIndex: 9999,
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-slate-400">
              <Loader2 size={13} className="animate-spin text-teal-400" />
              Searching locations…
            </div>
          )}

          {!loading && acError && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-red-400">
              <AlertCircle size={13} />
              {acError}
            </div>
          )}

          {!loading && !acError && suggestions.length === 0 && (
            <div className="px-4 py-3 text-xs text-slate-500 italic">
              No locations found. Try a different search.
            </div>
          )}

          {!loading && suggestions.map((s, i) => (
            <button
              key={s.placeId}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
              className="w-full text-left px-4 py-3 flex items-start gap-3 transition-colors"
              style={{
                background: i === activeIdx ? "#162238" : "transparent",
                borderBottom: i < suggestions.length - 1 ? "1px solid #1E293B" : "none",
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <MapPin size={13} className="text-teal-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm text-slate-100 font-medium leading-snug truncate">
                  {s.mainText}
                </div>
                {s.secondaryText && (
                  <div className="text-[11px] text-slate-500 leading-snug truncate mt-0.5">
                    {s.secondaryText}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── LeadCard ─────────────────────────────────────────────────────────────────

function LeadCard({ lead, searchCenter, onEnrich }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied]     = useState(null);
  const [enriching, setEnriching] = useState(false);

  const { score, tier, tierColor, reasons } = scoreLead(lead);

  const distance =
    searchCenter && lead.latitude != null && lead.longitude != null
      ? haversineKm(searchCenter.lat, searchCenter.lng, lead.latitude, lead.longitude).toFixed(1)
      : null;

  async function handleEnrich() {
    if (!lead.sourceId || lead._enriched) return;
    setEnriching(true);
    try { await onEnrich(lead.id); }
    finally { setEnriching(false); }
  }

  function handleCopy(val, key) {
    copyToClipboard(val, () => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const statusBadge = {
    OPERATIONAL:         { label: "Operational",          color: "#14B8A6", bg: "#042F2E" },
    CLOSED_TEMPORARILY:  { label: "Temp. Closed",          color: "#F59E0B", bg: "#27210A" },
    CLOSED_PERMANENTLY:  { label: "Permanently Closed",    color: "#EF4444", bg: "#2D0A0A" },
  }[lead.businessStatus] || null;

  return (
    <div className="rounded-lg overflow-hidden transition-all" style={{ background: "#162238", border: "1px solid #1E293B" }}>

      {/* ── Header ── */}
      <div
        className="flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors select-none"
        onClick={() => setExpanded(p => !p)}
      >
        {/* Score */}
        <div className="flex flex-col items-center justify-center flex-shrink-0 pt-0.5" style={{ width: 52 }}>
          <span style={{ fontWeight: 800, fontSize: 22, color: tierColor, lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: 9, color: tierColor, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{tier}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-bold text-base text-slate-100 leading-tight">{lead.name}</span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 capitalize">{lead.category}</span>

            {lead.hasWebsite === false && (
              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-semibold" style={{ color: "#38BDF8", background: "#0F2942" }}>
                <GlobeLock size={11} /> No Website
              </span>
            )}
            {lead.hasWebsite === true && (
              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded" style={{ color: "#2DD4BF", background: "#042F2E" }}>
                <Globe size={11} /> Has Website
              </span>
            )}
            {statusBadge && (
              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-medium" style={{ color: statusBadge.color, background: statusBadge.bg }}>
                {statusBadge.label}
              </span>
            )}
            {distance && <span className="text-[11px] text-slate-500">{distance} km away</span>}
          </div>

          {/* Address */}
          {lead.address && (
            <a
              href={lead.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name + " " + lead.address)}`}
              target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 hover:underline transition-colors mb-1.5 max-w-fit"
            >
              <MapPin size={11} className="flex-shrink-0" />
              <span className="truncate">{lead.address}</span>
              <ExternalLink size={9} className="flex-shrink-0 opacity-60" />
            </a>
          )}

          {/* Rating + phone quick */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            {lead.rating != null && (
              <span className="flex items-center gap-1">
                <Star size={11} className="text-yellow-400 fill-yellow-400" />
                <span className="font-semibold text-slate-300">{lead.rating.toFixed(1)}</span>
                {lead.reviewCount != null && <span className="text-slate-500">({lead.reviewCount.toLocaleString()})</span>}
              </span>
            )}
            {lead.hasPhone === true && lead.phone && (
              <span className="flex items-center gap-1 font-mono text-teal-300 text-[11px]">
                <Phone size={10} /> {lead.phone}
              </span>
            )}
            {lead.hasPhone === false && <span className="text-slate-600 text-[11px] italic">No phone found</span>}
            {lead.hasPhone === null && !lead._enriched && <span className="text-slate-600 text-[11px] italic">Phone not checked</span>}
            <span className="text-slate-700 font-mono text-[10px]">Source: {lead.source}</span>
          </div>
        </div>

        <div className="flex-shrink-0 pt-1">
          {expanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div className="px-5 pb-5 pt-4 flex flex-col gap-4" style={{ borderTop: "1px solid #1E293B" }}>

          {/* Enrichment prompt */}
          {!lead._enriched && lead.sourceId && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg" style={{ background: "#0F172A", border: "1px solid #1E293B" }}>
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Info size={14} className="text-teal-400 flex-shrink-0" />
                <span>Phone, website &amp; opening hours require a separate lookup.</span>
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
                    {lead._enriched ? "Not available" : "Not checked yet"}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-sm">
                <Globe size={13} className="flex-shrink-0 text-teal-400" />
                {lead.website ? (
                  <a
                    href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-teal-300 hover:underline text-xs truncate flex items-center gap-1"
                  >
                    {lead.website.replace(/^https?:\/\//, "").slice(0, 45)}
                    <ExternalLink size={9} />
                  </a>
                ) : (
                  <span className="text-slate-600 text-xs italic">
                    {lead._enriched ? "Website not found in provider data" : "Not checked yet"}
                  </span>
                )}
              </div>

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

              {lead.rating != null ? (
                <div className="flex items-center gap-2">
                  <Star size={13} className="text-yellow-400 fill-yellow-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-200">{lead.rating.toFixed(1)}</span>
                  {lead.reviewCount != null && <span className="text-xs text-slate-500">/ {lead.reviewCount.toLocaleString()} reviews</span>}
                </div>
              ) : (
                <div className="text-xs text-slate-600 italic">Rating not available</div>
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
                  <span className={lead.openNow ? "text-teal-300" : "text-red-400"}>{lead.openNow ? "Open" : "Closed"}</span>
                </div>
              )}

              {lead.openingHours?.weekdayText && (
                <div className="text-[11px] text-slate-500 space-y-0.5 leading-relaxed">
                  {lead.openingHours.weekdayText.map((line, i) => <div key={i}>{line}</div>)}
                </div>
              )}

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
                <span key={i} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded"
                  style={{
                    background: r.type === "positive" ? "#042F2E" : r.type === "negative" ? "#2D0A0A" : "#1E293B",
                    color:      r.type === "positive" ? "#5EEAD4" : r.type === "negative" ? "#FCA5A5" : "#94A3B8",
                  }}
                >
                  {r.type === "positive" ? <CheckCircle2 size={10} /> : r.type === "negative" ? <XCircle size={10} /> : <Info size={10} />}
                  {r.points !== 0 && <span className="font-mono font-bold">{r.points > 0 ? `+${r.points}` : r.points}</span>}
                  {r.label}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a
              href={lead.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((lead.name || "") + " " + (lead.address || ""))}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 transition-colors"
            >
              <MapPin size={12} /> View on Maps <ExternalLink size={10} />
            </a>
            {lead.phone && (
              <a href={`tel:${lead.phone}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 transition-colors">
                <Phone size={12} /> Call
              </a>
            )}
            {lead.website && (
              <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 transition-colors">
                <Globe size={12} /> Visit Website <ExternalLink size={10} />
              </a>
            )}
            <button
              onClick={() => handleCopy([lead.name, lead.address, lead.phone, lead.website].filter(Boolean).join("\n"), "all")}
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

  // ── Location state ───────────────────────────────────────────────────────
  // selectedLocation = { label, placeId, lat, lng, resolved }
  // null = nothing selected yet
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [geocoding, setGeocoding]               = useState(false);
  const [geocodeError, setGeocodeError]         = useState(null);

  // ── Search form state ────────────────────────────────────────────────────
  const [keyword,       setKeyword]       = useState("");
  const [radiusMetres,  setRadiusMetres]  = useState(5000);
  const [showFilters,   setShowFilters]   = useState(false);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [filterWebsite, setFilterWebsite] = useState("all");
  const [filterPhone,   setFilterPhone]   = useState("all");
  const [minRating,     setMinRating]     = useState(0);
  const [minReviews,    setMinReviews]    = useState(0);
  const [filterStatus,  setFilterStatus]  = useState("all");
  const [sortBy,        setSortBy]        = useState("score");

  // ── Results state ────────────────────────────────────────────────────────
  const [leads,          setLeads]          = useState([]);
  const [nextPageToken,  setNextPageToken]  = useState(null);
  const [searchCenter,   setSearchCenter]   = useState(null);
  const [resolvedAddr,   setResolvedAddr]   = useState("");
  const [searching,      setSearching]      = useState(false);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const [error,          setError]          = useState(null);
  const [phase,          setPhase]          = useState("idle");
  const [hasSearched,    setHasSearched]    = useState(false);

  // last successful search params for Re-run
  const lastSearchRef = useRef(null);
  const abortRef      = useRef(null);

  // ── When user selects autocomplete suggestion, geocode it ────────────────
  const handleLocationSelect = useCallback(async (suggestion) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setGeocoding(true);
    setGeocodeError(null);

    try {
      const geo = await geocodeLocation({ placeId: suggestion.placeId }, ctrl.signal);
      setSelectedLocation({
        label:    geo.formattedAddress,
        placeId:  geo.placeId,
        lat:      geo.lat,
        lng:      geo.lng,
        city:     geo.city,
        region:   geo.region,
        country:  geo.country,
        resolved: true,
      });
    } catch (err) {
      if (err.name === "AbortError") return;
      setGeocodeError(err.message || "Could not resolve location");
    } finally {
      setGeocoding(false);
    }
  }, []);

  // ── Main search ──────────────────────────────────────────────────────────
  const handleSearch = useCallback(async (overrideKeyword, overrideLocation) => {
    const loc = overrideLocation ?? selectedLocation;
    const kw  = (overrideKeyword !== undefined ? overrideKeyword : keyword).trim();

    if (!loc?.resolved) {
      setError("Please select a location from the dropdown suggestions.");
      return;
    }
    if (!kw) {
      setError("Please enter a business type or keyword (e.g. restaurant).");
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setSearching(true);
    setError(null);
    setLeads([]);
    setNextPageToken(null);
    setHasSearched(true);
    setPhase("searching");

    try {
      const result = await searchBusinesses(
        { lat: loc.lat, lng: loc.lng, keyword: kw, radiusMetres },
        null,
        ctrl.signal
      );

      const deduped = deduplicateLeads(result.results || []);
      setLeads(deduped);
      setNextPageToken(result.nextPageToken || null);
      setSearchCenter({ lat: loc.lat, lng: loc.lng });
      setResolvedAddr(loc.label);
      setPhase("done");

      lastSearchRef.current = { loc, kw, radiusMetres };
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message || "Search failed. Please try again.");
      setPhase("idle");
    } finally {
      setSearching(false);
    }
  }, [selectedLocation, keyword, radiusMetres]);

  // ── Re-run ───────────────────────────────────────────────────────────────
  const handleRerun = useCallback(() => {
    const last = lastSearchRef.current;
    if (!last) return;
    handleSearch(last.kw, last.loc);
  }, [handleSearch]);

  // ── Load more ────────────────────────────────────────────────────────────
  const handleLoadMore = useCallback(async () => {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      await new Promise(r => setTimeout(r, 2000)); // Google requires delay
      const result = await searchBusinesses(
        { lat: searchCenter?.lat, lng: searchCenter?.lng, keyword, radiusMetres },
        nextPageToken
      );
      const newLeads = deduplicateLeads([...leads, ...(result.results || [])]);
      setLeads(newLeads);
      setNextPageToken(result.nextPageToken || null);
    } catch (err) {
      setError(err.message || "Failed to load more results.");
    } finally {
      setLoadingMore(false);
    }
  }, [nextPageToken, loadingMore, leads, searchCenter, keyword, radiusMetres]);

  // ── Enrich (lazy per-lead details) ───────────────────────────────────────
  const handleEnrich = useCallback(async (leadId) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead?.sourceId || lead._enriched) return;
    try {
      const details = await fetchPlaceDetails(lead.sourceId);
      setLeads(prev => prev.map(l => l.id !== leadId ? l : {
        ...l,
        phone:           details.phone        ?? l.phone,
        website:         details.website      ?? l.website,
        hasPhone:        details.hasPhone,
        hasWebsite:      details.hasWebsite,
        websiteStatus:   details.websiteStatus,
        openNow:         details.openingHours?.openNow  ?? l.openNow,
        openingHours:    details.openingHours,
        address:         details.formattedAddress       ?? l.address,
        city:            details.city                   ?? l.city,
        googleMapsUrl:   details.googleMapsUrl          ?? l.googleMapsUrl,
        businessStatus:  details.businessStatus         ?? l.businessStatus,
        _enriched: true,
      }));
    } catch (err) {
      console.warn("Enrichment failed for", lead.name, "—", err.message);
    }
  }, [leads]);

  // ── Client-side filter + sort ─────────────────────────────────────────────
  const filteredLeads = leads
    .filter(l => {
      if (filterWebsite === "no_website"  && l.hasWebsite !== false) return false;
      if (filterWebsite === "has_website" && l.hasWebsite !== true)  return false;
      if (filterPhone   === "has_phone"   && l.hasPhone   !== true)  return false;
      if (filterPhone   === "no_phone"    && l.hasPhone   !== false) return false;
      if (minRating > 0  && (l.rating      == null || l.rating      < minRating))  return false;
      if (minReviews > 0 && (l.reviewCount == null || l.reviewCount < minReviews)) return false;
      if (filterStatus !== "all" && l.businessStatus !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      const { score: sa } = scoreLead(a);
      const { score: sb } = scoreLead(b);
      if (sortBy === "score")    return sb - sa;
      if (sortBy === "rating")   return (b.rating      ?? 0) - (a.rating      ?? 0);
      if (sortBy === "reviews")  return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
      if (sortBy === "name")     return (a.name || "").localeCompare(b.name || "");
      if (sortBy === "distance" && searchCenter) {
        const da = a.latitude != null ? haversineKm(searchCenter.lat, searchCenter.lng, a.latitude, a.longitude) : 9999;
        const db = b.latitude != null ? haversineKm(searchCenter.lat, searchCenter.lng, b.latitude, b.longitude) : 9999;
        return da - db;
      }
      return 0;
    });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full" style={{ background: "#0B132B", color: "#F1F5F9", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* ── Header ── */}
      <header className="border-b sticky top-0 z-30" style={{ borderColor: "#1E293B", background: "#0B132B" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Radar size={22} style={{ color: "#2DD4BF" }} />
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
              onClick={handleRerun}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 transition-colors"
            >
              <RefreshCw size={13} /> Re-run
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">

        {/* ── Search panel ── */}
        <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: "#162238", border: "1px solid #1E293B" }}>

          {/* Row 1: Location + Keyword */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            {/* Location with autocomplete */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin size={11} className="text-teal-400" /> Location
              </span>
              <LocationAutocomplete
                value={selectedLocation}
                onChange={setSelectedLocation}
                onSelect={handleLocationSelect}
                disabled={searching}
              />
              {geocoding && (
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin text-teal-400" /> Resolving location…
                </p>
              )}
              {geocodeError && (
                <p className="text-[11px] text-red-400 flex items-center gap-1">
                  <AlertCircle size={10} /> {geocodeError}
                </p>
              )}
            </div>

            {/* Keyword */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 size={11} className="text-teal-400" /> Business / Keyword
              </span>
              <input
                type="text"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="e.g. restaurant, dentist, salon"
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 outline-none transition-colors"
              />
            </div>
          </div>

          {/* Row 2: Radius + Filters + Search */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Radius</span>
              <div className="flex flex-wrap gap-2">
                {RADIUS_OPTIONS.map(opt => (
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
                onClick={() => setShowFilters(p => !p)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                <SlidersHorizontal size={14} />
                Filters
                {(filterWebsite !== "all" || filterPhone !== "all" || minRating > 0 || minReviews > 0 || filterStatus !== "all") && (
                  <span className="w-2 h-2 rounded-full bg-teal-400" />
                )}
              </button>

              <button
                onClick={() => handleSearch()}
                disabled={searching || geocoding}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-lg shadow-teal-500/20"
              >
                {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
          </div>

          {/* Row 3: Filters panel */}
          {showFilters && (
            <div className="pt-3 border-t grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" style={{ borderColor: "#1E293B" }}>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Website</span>
                <select value={filterWebsite} onChange={e => setFilterWebsite(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500">
                  <option value="all">Any</option>
                  <option value="no_website">No website</option>
                  <option value="has_website">Has website</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Phone</span>
                <select value={filterPhone} onChange={e => setFilterPhone(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500">
                  <option value="all">Any</option>
                  <option value="has_phone">Has phone</option>
                  <option value="no_phone">No phone</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Min Rating</span>
                <select value={minRating} onChange={e => setMinRating(parseFloat(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500">
                  <option value={0}>Any</option>
                  <option value={3}>3.0+</option>
                  <option value={3.5}>3.5+</option>
                  <option value={4}>4.0+</option>
                  <option value={4.5}>4.5+</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Min Reviews</span>
                <select value={minReviews} onChange={e => setMinReviews(parseInt(e.target.value, 10))}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500">
                  <option value={0}>Any</option>
                  <option value={10}>10+</option>
                  <option value={25}>25+</option>
                  <option value={50}>50+</option>
                  <option value={100}>100+</option>
                  <option value={250}>250+</option>
                  <option value={500}>500+</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</span>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500">
                  <option value="all">Any</option>
                  <option value="OPERATIONAL">Operational</option>
                  <option value="CLOSED_TEMPORARILY">Temporarily Closed</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Sort By</span>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500">
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

        {/* ── Category chips ── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
          {QUICK_CATEGORIES.map(cat => (
            <button
              key={cat.kw}
              onClick={() => {
                setKeyword(cat.kw);
                if (selectedLocation?.resolved) handleSearch(cat.kw);
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

        {/* ── Error ── */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-sm">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Error</p>
              <p className="text-red-400 text-xs mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {searching && (
          <div className="flex flex-col items-center py-16 gap-4">
            <Loader2 size={36} className="animate-spin text-teal-400" />
            <div className="text-center">
              <p className="font-semibold text-slate-200">Searching real businesses…</p>
              <p className="text-xs text-slate-500 mt-1 font-mono">Querying Google Places via server proxy — key never exposed</p>
            </div>
          </div>
        )}

        {/* ── Results bar ── */}
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
              {resolvedAddr && (
                <span className="text-slate-400 text-sm"> near <strong className="text-teal-400">{resolvedAddr}</strong></span>
              )}
              <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                <Info size={10} /> Results from Google Places — coverage depends on provider data.
              </p>
            </div>
            {!showFilters && (
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                className="text-xs bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white outline-none focus:border-teal-500">
                <option value="score">Sort: Lead Score</option>
                <option value="rating">Sort: Rating</option>
                <option value="reviews">Sort: Reviews</option>
                <option value="name">Sort: Name</option>
                <option value="distance">Sort: Distance</option>
              </select>
            )}
          </div>
        )}

        {/* ── Empty — no results from provider ── */}
        {!searching && hasSearched && leads.length === 0 && !error && (
          <div className="text-center py-16 rounded-xl border border-dashed border-slate-700">
            <Search size={40} className="text-slate-700 mx-auto mb-4" />
            <p className="text-slate-300 font-semibold text-lg">No real businesses found</p>
            <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
              Google Places returned no results for this search.
            </p>
            <ul className="text-slate-500 text-sm mt-3 space-y-1">
              <li>• Try increasing the radius</li>
              <li>• Use a simpler keyword (e.g. "restaurant" not "Italian fine dining")</li>
              <li>• Try a broader location</li>
            </ul>
          </div>
        )}

        {/* ── Empty after filter ── */}
        {!searching && leads.length > 0 && filteredLeads.length === 0 && (
          <div className="text-center py-10 rounded-xl border border-dashed border-slate-700">
            <SlidersHorizontal size={32} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-300 font-semibold">No leads match your current filters</p>
            <p className="text-slate-500 text-sm mt-1">
              {leads.length} total results — adjust filters to see them.
            </p>
            <p className="text-xs text-slate-600 mt-2">
              Website/phone filters only apply after "Get Details" is run per lead.
            </p>
          </div>
        )}

        {/* ── Lead cards ── */}
        {!searching && filteredLeads.length > 0 && (
          <div className="flex flex-col gap-3">
            {filteredLeads.map(lead => (
              <LeadCard key={lead.id || lead.sourceId} lead={lead} searchCenter={searchCenter} onEnrich={handleEnrich} />
            ))}
          </div>
        )}

        {/* ── Load more ── */}
        {!searching && nextPageToken && (
          <div className="text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loadingMore ? <><Loader2 size={15} className="animate-spin" /> Loading more…</> : <><ChevronRight size={15} /> Load more results</>}
            </button>
            <p className="text-xs text-slate-600 mt-2">Google Places returns up to 20 results per page.</p>
          </div>
        )}

        {/* ── Welcome / idle state ── */}
        {!hasSearched && !searching && (
          <div className="flex flex-col items-center text-center py-16 gap-4">
            <Radar size={48} className="text-teal-500/30" />
            <div>
              <h2 className="text-xl font-bold text-slate-300">Find real businesses — no fake data</h2>
              <p className="text-slate-500 text-sm mt-2 max-w-md">
                Type a location above, select it from the dropdown, then enter a business type and click Search.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {[
                { loc: "Bandra, Mumbai",       kw: "restaurant" },
                { loc: "Andheri West, Mumbai", kw: "salon"      },
                { loc: "Pune",                 kw: "dentist"    },
                { loc: "Bangalore",            kw: "gym"        },
                { loc: "Dubai",                kw: "cafe"       },
              ].map(ex => (
                <button
                  key={ex.kw}
                  onClick={() => {
                    // Pre-fill keyword; user still needs to type location and select
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

        {/* ── Footer ── */}
        <footer className="text-center pt-4 pb-6">
          <p className="text-xs text-slate-700">
            Results sourced from Google Places API. Coverage depends on provider data.
            No data is fabricated by this application.
          </p>
        </footer>
      </main>
    </div>
  );
}
