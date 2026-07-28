import React, { useState, useEffect, useCallback } from "react";
import {
  Radar,
  MapPin,
  Search,
  Mail,
  Copy,
  Check,
  Loader2,
  Globe,
  GlobeLock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Phone,
  Building2,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  TrendingUp,
  Wrench,
  Filter,
  Clock,
  ShieldAlert,
  Info
} from "lucide-react";

// Fast In-Memory Cache
const FAST_CACHE = new Map();
const COOLDOWN_SECONDS = 180; // 3 minutes cooldown before live re-querying

// Curated list of Countries and Major Cities for instant dropdown selection
const COUNTRY_CITIES_MAP = {
  "India": [
    "Mumbai, Maharashtra",
    "Thane, Maharashtra",
    "Mira Road, Thane",
    "Navi Mumbai, Maharashtra",
    "Kalyan-Dombivli, Maharashtra",
    "Vasai-Virar, Maharashtra",
    "Pune, Maharashtra",
    "Delhi NCR",
    "New Delhi",
    "Gurgaon (Gurugram), Haryana",
    "Noida, Uttar Pradesh",
    "Bangalore (Bengaluru), Karnataka",
    "Hyderabad, Telangana",
    "Chennai, Tamil Nadu",
    "Kolkata, West Bengal",
    "Ahmedabad, Gujarat",
    "Surat, Gujarat",
    "Jaipur, Rajasthan",
    "Lucknow, Uttar Pradesh",
    "Kanpur, Uttar Pradesh",
    "Nagpur, Maharashtra",
    "Indore, Madhya Pradesh",
    "Bhopal, Madhya Pradesh",
    "Vadodara, Gujarat",
    "Coimbatore, Tamil Nadu",
    "Visakhapatnam, Andhra Pradesh",
    "Patna, Bihar",
    "Chandigarh",
    "Ludhiana, Punjab",
    "Agra, Uttar Pradesh",
    "Nashik, Maharashtra",
    "Rajkot, Gujarat",
    "Varanasi, Uttar Pradesh",
    "Madurai, Tamil Nadu",
    "Meerut, Uttar Pradesh",
    "Jamshedpur, Jharkhand",
    "Ranchi, Jharkhand",
    "Jabalpur, Madhya Pradesh",
    "Asansol, West Bengal",
    "Prayagraj (Allahabad), UP",
    "Dhanbad, Jharkhand",
    "Aurangabad (Chhatrapati Sambhajinagar), MS",
    "Amritsar, Punjab",
    "Jodhpur, Rajasthan",
    "Raipur, Chhattisgarh",
    "Gwalior, Madhya Pradesh",
    "Vijayawada, Andhra Pradesh",
    "Bareilly, Uttar Pradesh",
    "Guwahati, Assam",
    "Solapur, Maharashtra",
    "Hubballi, Karnataka",
    "Mysuru (Mysore), Karnataka",
    "Dehradun, Uttarakhand",
    "Salem, Tamil Nadu",
    "Tiruchirappalli, Tamil Nadu",
    "Bhubaneswar, Odisha",
    "Mangaluru, Karnataka"
  ],
  "United States": [
    "New York, NY",
    "Los Angeles, CA",
    "Chicago, IL",
    "Houston, TX",
    "Phoenix, AZ",
    "San Francisco, CA",
    "Miami, FL",
    "Seattle, WA",
    "Austin, TX",
    "Dallas, TX"
  ],
  "United Kingdom": [
    "London",
    "Manchester",
    "Birmingham",
    "Edinburgh",
    "Glasgow",
    "Leeds",
    "Liverpool",
    "Bristol"
  ],
  "Canada": [
    "Toronto, ON",
    "Vancouver, BC",
    "Montreal, QC",
    "Calgary, AB",
    "Ottawa, ON",
    "Edmonton, AB"
  ],
  "Australia": [
    "Sydney, NSW",
    "Melbourne, VIC",
    "Brisbane, QLD",
    "Perth, WA",
    "Adelaide, SA"
  ],
  "United Arab Emirates": [
    "Dubai",
    "Abu Dhabi",
    "Sharjah",
    "Ajman"
  ],
  "Germany": [
    "Berlin",
    "Munich",
    "Hamburg",
    "Frankfurt",
    "Cologne"
  ],
  "France": [
    "Paris",
    "Lyon",
    "Marseille",
    "Toulouse",
    "Nice"
  ],
  "Japan": [
    "Tokyo",
    "Osaka",
    "Yokohama",
    "Kyoto",
    "Nagoya"
  ],
  "Singapore": [
    "Singapore"
  ]
};

function termHas(str, keywords) {
  const s = (str || "").toLowerCase();
  return keywords.some((k) => s.includes(k));
}

// Contact info is only ever taken from real OSM tags — never invented.
// Returns null for anything not actually present so the UI can show "not listed"
// instead of a fabricated number/email.
function resolveLeadContactInfo(existingPhone, existingEmail) {
  return {
    phone: existingPhone || null,
    email: existingEmail || null,
    hasRealPhone: Boolean(existingPhone),
    hasRealEmail: Boolean(existingEmail)
  };
}

// Helper: Filter out residential places unless real shop/amenity/office exists
function isGenuineBusinessTag(tags = {}, cls = "", type = "") {
  const name = tags.name || "";
  if (!name || name.length < 2) return false;

  const building = (tags.building || "").toLowerCase();
  const landuse = (tags.landuse || "").toLowerCase();
  const c = (cls || tags.class || "").toLowerCase();
  const t = (type || tags.type || "").toLowerCase();

  const resTypes = ["residential", "apartments", "house", "residential_area", "detached", "terrace"];

  const hasShop = Boolean(tags.shop || c === "shop" || t.includes("shop"));
  const hasAmenity = Boolean(
    tags.amenity ||
    c === "amenity" ||
    ["restaurant", "fast_food", "cafe", "bistro", "pub", "bar", "clinic", "dentist", "pharmacy", "bank", "fuel", "cinema"].includes(t)
  );
  const hasOffice = Boolean(tags.office || c === "office");
  const hasLeisure = Boolean(
    c === "leisure" ||
    c === "tourism" ||
    ["fitness_centre", "sports_centre", "hairdresser", "beauty", "spa", "hotel"].includes(t)
  );

  const isBusiness = hasShop || hasAmenity || hasOffice || hasLeisure;

  if (!isBusiness) return false;
  if (resTypes.includes(building) && !isBusiness) return false;
  if (landuse === "residential" && !isBusiness) return false;

  return true;
}

// 🎯 Lead Intelligence Engine with Dynamic Pricing & Clear Estimated Range Labels
function getBusinessIntelligence(categoryTag, name, hasWebsite, phone) {
  const cat = (categoryTag || "").toLowerCase();
  const n = (name || "").toLowerCase();

  // 1. Food / Shawarma / Fast Food
  if (
    n.includes("shawarma") ||
    n.includes("kebab") ||
    n.includes("roll") ||
    cat.includes("fast_food") ||
    n.includes("burger") ||
    n.includes("pizza") ||
    n.includes("franki")
  ) {
    return {
      categoryName: "Food & Fast Food Outlet",
      badgeColor: "#2DD4BF",
      whatExists: {
        webStatus: hasWebsite ? "Basic web link present (No online ordering capability)" : "No website found — Relies 100% on walk-ins & aggregators",
        contactStatus: phone ? `Direct phone: ${phone}` : "No phone number registered online"
      },
      whatIsNeeded: "Losing 25%+ margin to Swiggy/Zomato commission fees. Needs direct customer ordering, automated WhatsApp delivery updates, and combo customizer.",
      whatCanBeMade: {
        websiteStrategy: "Fast mobile-first digital menu with high-res food photos, Google Maps directions, customer reviews, and direct WhatsApp order button.",
        saasTitle: "Fast-Food Direct-Ordering SaaS",
        saasModules: [
          "Direct Online Ordering Web App (Avoids 25%+ aggregator commission fees)",
          "Instant WhatsApp Order Bot & Customer Delivery Notification",
          "Daily Stock/Inventory Tracker",
          "Combo & Add-on Customizer (Extra Cheese, Mayo, Special Spices)",
          "Customer Loyalty & Coupon System"
        ]
      },
      pricing: {
        websiteFee: "₹12,500 - ₹15,000 (Est. starting price)",
        saasSetupFee: "₹16,000 - ₹20,000 (Est. setup range)",
        saasMonthly: "₹1,499 - ₹1,899 / month (Est. range)",
        estimatedRoi: "Est. ROI: Saves ~₹45,000/mo in aggregator commissions; pays for itself within 25 orders."
      }
    };
  }

  // 2. Restaurants / Cafes / Bakeries
  if (
    cat.includes("restaurant") ||
    cat.includes("cafe") ||
    cat.includes("bakery") ||
    cat.includes("bistro") ||
    cat.includes("pub") ||
    n.includes("cafe") ||
    n.includes("restaurant") ||
    n.includes("bistro") ||
    n.includes("kitchen") ||
    n.includes("hotel") ||
    n.includes("biryani") ||
    n.includes("eatery")
  ) {
    return {
      categoryName: "Restaurant / Cafe",
      badgeColor: "#0EA5E9",
      whatExists: {
        webStatus: hasWebsite ? "Basic static page (Outdated menu & no table booking)" : "No website found — Missing online diners and table reservations",
        contactStatus: phone ? `Direct phone: ${phone}` : "No phone number listed"
      },
      whatIsNeeded: "High waiter overhead & manual order taking. Needs QR table ordering, digital menu, automated table reservations, and Kitchen Display System (KDS).",
      whatCanBeMade: {
        websiteStrategy: "High-converting restaurant website featuring interactive visual menu, table booking widget, chef specials, and customer review showcase.",
        saasTitle: "Restaurant Table Ordering & Reservation SaaS",
        saasModules: [
          "QR Code Table Ordering & Instant Digital Menu",
          "Direct Commission-Free Delivery & Takeaway Portal",
          "Table Reservation & Seat Waitlist System",
          "Kitchen Display System (KDS) & Bill Generator"
        ]
      },
      pricing: {
        websiteFee: "₹15,000 - ₹20,000 (Est. starting price)",
        saasSetupFee: "₹22,000 - ₹28,000 (Est. setup range)",
        saasMonthly: "₹1,999 - ₹2,799 / month (Est. range)",
        estimatedRoi: "Est. ROI: Reduces table turnaround time by 30% and saves ₹60,000/mo in commissions."
      }
    };
  }

  // 3. Healthcare / Clinics / Dentists
  if (
    cat.includes("clinic") ||
    cat.includes("dentist") ||
    cat.includes("doctor") ||
    cat.includes("pharmacy") ||
    cat.includes("hospital") ||
    cat.includes("healthcare") ||
    n.includes("clinic") ||
    n.includes("dental") ||
    n.includes("care") ||
    n.includes("health")
  ) {
    return {
      categoryName: "Clinic & Healthcare",
      badgeColor: "#14B8A6",
      whatExists: {
        webStatus: hasWebsite ? "Informational page only (No online booking or patient intake)" : "No website found — High patient phone calls & queue congestion",
        contactStatus: phone ? `Direct phone: ${phone}` : "No phone number listed"
      },
      whatIsNeeded: "High patient no-show rate and congested waiting rooms. Needs 24/7 online appointment booking, WhatsApp SMS reminders, and digital EHR prescription vault.",
      whatCanBeMade: {
        websiteStrategy: "Trust-building clinic website featuring doctor profiles, treatments offered, patient testimonials, and online appointment booking.",
        saasTitle: "Patient Booking & EHR Clinic SaaS",
        saasModules: [
          "24/7 Patient Appointment Booking Portal",
          "Automated WhatsApp & SMS Appointment Reminders",
          "Digital Prescription & Patient History Vault",
          "Patient Follow-up & Treatment Payment Scheduler"
        ]
      },
      pricing: {
        websiteFee: "₹16,000 - ₹24,000 (Est. starting price)",
        saasSetupFee: "₹25,000 - ₹32,000 (Est. setup range)",
        saasMonthly: "₹2,499 - ₹3,499 / month (Est. range)",
        estimatedRoi: "Est. ROI: Reduces patient no-shows by 80% and brings in 15-20 new patient bookings monthly."
      }
    };
  }

  // 4. Salons / Spas / Beauty
  if (
    cat.includes("beauty") ||
    cat.includes("salon") ||
    cat.includes("hairdresser") ||
    cat.includes("spa") ||
    n.includes("salon") ||
    n.includes("spa") ||
    n.includes("barber") ||
    n.includes("parlour")
  ) {
    return {
      categoryName: "Salon & Spa",
      badgeColor: "#38BDF8",
      whatExists: {
        webStatus: hasWebsite ? "Basic portfolio page (No real-time stylist slot booking)" : "No website found — Idle stylist chairs during off-peak hours",
        contactStatus: phone ? `Direct phone: ${phone}` : "No phone number listed"
      },
      whatIsNeeded: "Unbooked stylist time slots and client churn. Needs online slot booking, automated WhatsApp appointment reminders, and recurring loyalty subscriptions.",
      whatCanBeMade: {
        websiteStrategy: "Elegant portfolio website displaying beauty services, price menu, customer reviews, and appointment booking.",
        saasTitle: "Salon Appointment & Member SaaS",
        saasModules: [
          "Stylist & Time-Slot Booking Calendar",
          "Automated WhatsApp Appointment Confirmation & Reminders",
          "Customer Service History & Preferred Package Log",
          "Loyalty Subscriptions & Package Discounts"
        ]
      },
      pricing: {
        websiteFee: "₹14,000 - ₹18,000 (Est. starting price)",
        saasSetupFee: "₹20,000 - ₹25,000 (Est. setup range)",
        saasMonthly: "₹1,799 - ₹2,299 / month (Est. range)",
        estimatedRoi: "Est. ROI: Fills 25+ off-peak stylist slots monthly, adding ₹35,000/mo in recurring revenue."
      }
    };
  }

  // 5. Gyms / Fitness Studios
  if (
    cat.includes("gym") ||
    cat.includes("fitness") ||
    cat.includes("sports") ||
    n.includes("gym") ||
    n.includes("fitness")
  ) {
    return {
      categoryName: "Gym & Fitness",
      badgeColor: "#06B6D4",
      whatExists: {
        webStatus: hasWebsite ? "Basic info page (No member portal or fee payment)" : "No website found — Manual cash/UPI fee tracking and expired memberships",
        contactStatus: phone ? `Direct phone: ${phone}` : "No phone number listed"
      },
      whatIsNeeded: "Uncollected monthly membership fees and manual attendance logs. Needs member subscription management, QR check-in, and auto-fee reminders.",
      whatCanBeMade: {
        websiteStrategy: "High-energy membership website showcasing gym equipment, trainer bios, member transformations, and trial pass signups.",
        saasTitle: "Gym Member Management & Billing SaaS",
        saasModules: [
          "Member Plan Subscription & Due Date Fee Tracker",
          "QR Code Gate Entry / Member Attendance Scanner",
          "Personal Trainer Slot & Class Scheduler",
          "Automated WhatsApp Monthly Fee Reminders"
        ]
      },
      pricing: {
        websiteFee: "₹15,000 - ₹22,000 (Est. starting price)",
        saasSetupFee: "₹24,000 - ₹30,000 (Est. setup range)",
        saasMonthly: "₹2,199 - ₹2,999 / month (Est. range)",
        estimatedRoi: "Est. ROI: Eliminates uncollected membership dues, recovering ₹50,000+ per month."
      }
    };
  }

  // 6. Retail Stores / Boutiques
  if (
    cat.includes("shop") ||
    cat.includes("store") ||
    cat.includes("clothes") ||
    cat.includes("boutique") ||
    cat.includes("supermarket") ||
    cat.includes("hardware") ||
    cat.includes("electronics") ||
    cat.includes("shoes")
  ) {
    return {
      categoryName: "Retail Store",
      badgeColor: "#2DD4BF",
      whatExists: {
        webStatus: hasWebsite ? "Static store address page (No online store or catalog)" : "No website found — Offline store only, missing local online buyers",
        contactStatus: phone ? `Direct phone: ${phone}` : "No phone number listed"
      },
      whatIsNeeded: "Losing customers to online platforms. Needs local 24/7 web storefront, inventory barcode scanner, and WhatsApp order delivery app.",
      whatCanBeMade: {
        websiteStrategy: "Modern digital store storefront featuring product catalog, store location, current offers, and contact forms.",
        saasTitle: "Local Store E-Commerce & Inventory SaaS",
        saasModules: [
          "Online Product Storefront with Instant Checkout",
          "Real-time Inventory & Barcode Stock App",
          "WhatsApp Order & Delivery Dispatcher",
          "Customer Discount Coupons & Member CRM"
        ]
      },
      pricing: {
        websiteFee: "₹14,000 - ₹19,000 (Est. starting price)",
        saasSetupFee: "₹21,000 - ₹26,000 (Est. setup range)",
        saasMonthly: "₹1,899 - ₹2,499 / month (Est. range)",
        estimatedRoi: "Est. ROI: Generates 40+ extra local online orders monthly, adding ₹60,000/mo in revenue."
      }
    };
  }

  // 7. General Business / Office
  return {
    categoryName: "Local Business",
    badgeColor: "#14B8A6",
    whatExists: {
      webStatus: hasWebsite ? "Basic business listing (No lead auto-responder or CRM)" : "No website found — No digital lead capture mechanism",
      contactStatus: phone ? `Direct phone: ${phone}` : "No phone number listed"
    },
    whatIsNeeded: "Unanswered customer inquiries and lost quotes. Needs professional website with lead auto-responder, consultation scheduler, and client CRM.",
    whatCanBeMade: {
      websiteStrategy: "Professional business website featuring service catalog, client testimonials, case studies, and instant lead capture forms.",
      saasTitle: "Lead Capture & Client CRM SaaS",
      saasModules: [
        "Instant Customer Inquiry Auto-Responder",
        "Client Quote & Invoice Generator",
        "Consultation & Meeting Scheduler",
        "WhatsApp Lead Notification Integration"
      ]
    },
    pricing: {
      websiteFee: "₹12,000 - ₹16,000 (Est. starting price)",
      saasSetupFee: "₹16,000 - ₹22,000 (Est. setup range)",
      saasMonthly: "₹1,499 - ₹1,999 / month (Est. range)",
      estimatedRoi: "Est. ROI: Converts 25% more website visitors into paying clients instantly."
    }
  };
}

function scoreOSMLead(item) {
  let score = 35;
  const reasons = [];

  const hasWebsite = !!item.website;
  if (!hasWebsite) {
    score += 40;
    reasons.push({ label: "No website found — Prime outreach lead", weight: "high" });
  } else {
    score += 10;
    reasons.push({ label: "Has website — Modern redesign / SaaS upgrade target", weight: "low" });
  }

  if (item.phone) {
    score += 15;
    reasons.push({ label: "Phone listed on OSM", weight: "med" });
  } else {
    reasons.push({ label: "No phone listed", weight: "med" });
  }

  if (item.email) {
    score += 15;
    reasons.push({
      label: item.emailSource === "website" ? "Email found on their own website" : "Email listed on OSM",
      weight: "high"
    });
  }

  score = Math.max(15, Math.min(99, score));
  return { score: Math.round(score), reasons, hasWebsite };
}

function scoreTier(score) {
  if (score >= 75) return { label: "Hot Lead", color: "#14B8A6" };
  if (score >= 50) return { label: "Warm Lead", color: "#38BDF8" };
  return { label: "Cool Lead", color: "#64748B" };
}

// 🌐 Geocode City Center Coordinates via Nominatim
async function geocodeCityBbox(cityName, countryName) {
  const cleanCity = cityName.replace(/,.*/, "").trim();
  const cacheKey = `geo_bbox_v10:${countryName.toLowerCase()}:${cleanCity.toLowerCase()}`;
  if (FAST_CACHE.has(cacheKey)) return FAST_CACHE.get(cacheKey);

  const searchUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(cleanCity)}&country=${encodeURIComponent(countryName)}&format=json&limit=5`;

  try {
    const res = await fetch(searchUrl, { headers: { "User-Agent": "LeadScout-AutoEngine/10.0" } });
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) {
        const item = data[0];
        const bbox = (item.boundingbox || []).map(Number); // [south, north, west, east]
        const result = {
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          displayName: item.display_name,
          bbox: bbox.length === 4 ? { south: bbox[0], north: bbox[1], west: bbox[2], east: bbox[3] } : null
        };
        FAST_CACHE.set(cacheKey, result);
        return result;
      }
    }
  } catch (e) { }

  const fallbackUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${cityName}, ${countryName}`)}&format=json&limit=5`;
  try {
    const res2 = await fetch(fallbackUrl, { headers: { "User-Agent": "LeadScout-AutoEngine/10.0" } });
    if (res2.ok) {
      const data2 = await res2.json();
      if (data2 && data2.length > 0) {
        const item = data2[0];
        const bbox = (item.boundingbox || []).map(Number);
        const result = {
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          displayName: item.display_name,
          bbox: bbox.length === 4 ? { south: bbox[0], north: bbox[1], west: bbox[2], east: bbox[3] } : null
        };
        FAST_CACHE.set(cacheKey, result);
        return result;
      }
    }
  } catch (e) { }

  // Try direct query for Indian cities/towns
  if (countryName.toLowerCase() === "india") {
    const indiaUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${cleanCity}, India`)}&format=json&limit=5`;
    try {
      const res3 = await fetch(indiaUrl, { headers: { "User-Agent": "LeadScout-AutoEngine/10.0" } });
      if (res3.ok) {
        const data3 = await res3.json();
        if (data3 && data3.length > 0) {
          const item = data3[0];
          const bbox = (item.boundingbox || []).map(Number);
          const result = {
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            displayName: item.display_name,
            bbox: bbox.length === 4 ? { south: bbox[0], north: bbox[1], west: bbox[2], east: bbox[3] } : null
          };
          FAST_CACHE.set(cacheKey, result);
          return result;
        }
      }
    } catch (e) { }
  }

  const fallbackGeo = {
    lat: 20.5937,
    lon: 78.9629, // Center of India fallback
    displayName: `${cityName}, ${countryName}`,
    bbox: null
  };
  FAST_CACHE.set(cacheKey, fallbackGeo);
  return fallbackGeo;
}

// Splits a bbox into a grid of smaller cells so Overpass gets bounded, fast
// sub-queries instead of one huge query that will time out on a whole city.
function splitBboxIntoGrid(bbox, maxCellSizeDeg = 0.045) {
  const { south, north, west, east } = bbox;
  const latSpan = north - south;
  const lonSpan = east - west;
  const rows = Math.max(1, Math.min(6, Math.ceil(latSpan / maxCellSizeDeg)));
  const cols = Math.max(1, Math.min(6, Math.ceil(lonSpan / maxCellSizeDeg)));
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        south: south + (latSpan * r) / rows,
        north: south + (latSpan * (r + 1)) / rows,
        west: west + (lonSpan * c) / cols,
        east: west + (lonSpan * (c + 1)) / cols
      });
    }
  }
  return cells; // capped at 16 cells max (4x4) so a big city doesn't fire off dozens of requests
}

// 💾 LocalStorage & In-Memory Stale Cache Helpers
function getCacheKey(country, city, niche) {
  return `leadscout_cache_v10:${(country || "").toLowerCase().trim()}:${(city || "").toLowerCase().trim()}:${(niche || "").toLowerCase().trim()}`;
}

function loadCachedCityLeads(country, city, niche) {
  const key = getCacheKey(country, city, niche);
  if (FAST_CACHE.has(key)) return FAST_CACHE.get(key);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.results)) {
      FAST_CACHE.set(key, parsed);
      return parsed;
    }
  } catch (e) { }
  return null;
}

function saveCachedCityLeads(country, city, niche, results, displayName) {
  try {
    const key = getCacheKey(country, city, niche);
    const payload = {
      timestamp: Date.now(),
      fetchedAtIso: new Date().toISOString(),
      fetchedAtTime: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      country,
      city,
      niche,
      displayName: displayName || `${city}, ${country}`,
      results
    };
    localStorage.setItem(key, JSON.stringify(payload));
    FAST_CACHE.set(key, payload);
    return payload;
  } catch (e) { }
}

// 🌐 Authentic Real Business Lead Engine for Any City & Country in the World
async function fastSearchShops(country, city, niche, forceRefresh = false, onProgress = () => { }) {
  // Check cache first
  const cached = loadCachedCityLeads(country, city, niche);
  if (cached && !forceRefresh && Array.isArray(cached.results) && cached.results.length > 0) {
    const elapsedSeconds = Math.floor((Date.now() - cached.timestamp) / 1000);
    return {
      results: cached.results,
      isCached: true,
      fetchedAtTime: cached.fetchedAtTime,
      cachedMinutesAgo: Math.floor(elapsedSeconds / 60),
      cooldownRemaining: 0,
      displayName: cached.displayName
    };
  }

  // Geocode the city — including its real bounding box, not just a center point
  onProgress({ status: `Locating ${city}, ${country}...`, progress: 15 });
  const geoInfo = await geocodeCityBbox(city, country);
  const lat = geoInfo.lat;
  const lon = geoInfo.lon;
  const cleanDisplayName = geoInfo.displayName || `${city}, ${country}`;

  const rawNiche = (niche || "").trim().toLowerCase();

  const bbox = geoInfo.bbox || {
    south: lat - 0.05,
    north: lat + 0.05,
    west: lon - 0.05,
    east: lon + 0.05
  };

  onProgress({
    status: `Scanning live OpenStreetMap & Nominatim databases for ${city}...`,
    progress: 35
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  // Prepare Overpass query for the city bounding box
  const overpassQuery = `
    [out:json][timeout:8];
    (
      node(${bbox.south},${bbox.west},${bbox.north},${bbox.east})["shop"];
      way(${bbox.south},${bbox.west},${bbox.north},${bbox.east})["shop"];
      node(${bbox.south},${bbox.west},${bbox.north},${bbox.east})["amenity"];
      way(${bbox.south},${bbox.west},${bbox.north},${bbox.east})["amenity"];
      node(${bbox.south},${bbox.west},${bbox.north},${bbox.east})["office"];
      way(${bbox.south},${bbox.west},${bbox.north},${bbox.east})["office"];
    );
    out center tags 120;
  `;

  const overpassPromise = fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: "data=" + encodeURIComponent(overpassQuery),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: controller.signal
  })
    .then((r) => (r.ok ? r.json() : { elements: [] }))
    .then((j) => j.elements || [])
    .catch(() => []);

  // Prepare Nominatim search promises in parallel
  const queryTerms = rawNiche
    ? [`${rawNiche} in ${city}`, `${rawNiche} ${city} ${country}`, `${rawNiche} near ${city}`]
    : [
        `restaurants in ${city}, ${country}`,
        `shops in ${city}, ${country}`,
        `clinics in ${city}, ${country}`,
        `cafes in ${city}, ${country}`,
        `salons in ${city}, ${country}`,
        `gyms in ${city}, ${country}`,
        `offices in ${city}, ${country}`,
        `stores in ${city}, ${country}`
      ];

  const nomPromises = queryTerms.map((q) =>
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=35&extratags=1&addressdetails=1`,
      { headers: { "User-Agent": "LeadScout-AutoEngine/10.0" }, signal: controller.signal }
    )
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
  );

  // Execute Overpass & Nominatim concurrently at the exact same time
  const [overpassElements, ...nomArrays] = await Promise.all([overpassPromise, ...nomPromises]);
  clearTimeout(timeoutId);

  onProgress({ status: `Processing & scoring real business records...`, progress: 75 });

  // Parse Overpass authentic items
  const overpassItems = overpassElements
    .filter((el) => {
      const tags = el.tags || {};
      return isGenuineBusinessTag(tags, tags.class, tags.type);
    })
    .map((el) => {
      const tags = el.tags || {};
      const latCoord = el.lat || (el.center && el.center.lat) || lat;
      const lonCoord = el.lon || (el.center && el.center.lon) || lon;
      const cat =
        tags.amenity ||
        tags.shop ||
        tags.office ||
        tags.cuisine ||
        tags.healthcare ||
        "Local Business";

      const street = tags["addr:street"] || tags["addr:suburb"] || tags["addr:neighbourhood"] || "";
      const cityStr = tags["addr:city"] || city;
      const fullAddr = [street, cityStr, country].filter(Boolean).join(", ");

      return {
        id: `${el.type}-${el.id}`,
        name: tags.name,
        category: cat.replace(/_/g, " "),
        address: fullAddr,
        website: tags.website || tags["contact:website"] || tags.url || null,
        phone: tags.phone || tags["contact:phone"] || tags.mobile || null,
        email: tags.email || tags["contact:email"] || null,
        lat: latCoord,
        lon: lonCoord,
        mapsUrl: `https://www.openstreetmap.org/?mlat=${latCoord}&mlon=${lonCoord}#map=16/${latCoord}/${lonCoord}`
      };
    });

  // Parse Nominatim authentic items
  const nomItems = nomArrays
    .flat()
    .filter((it) => {
      const extra = it.extratags || {};
      const rawName = it.display_name.split(",")[0].trim();
      const tags = { ...extra, name: rawName };
      return isGenuineBusinessTag(tags, it.class, it.type);
    })
    .map((it) => {
      const rawName = it.display_name.split(",")[0].trim();
      const addrObj = it.address || {};
      const road = addrObj.road || addrObj.suburb || addrObj.neighbourhood || "";
      const cityStr = addrObj.city || addrObj.town || city;
      const fullAddr = [road, cityStr, country].filter(Boolean).join(", ");
      return {
        id: `nom-${it.place_id}`,
        name: rawName,
        category: (it.type || it.class || "Local Business").replace(/_/g, " "),
        address: fullAddr,
        website: it.extratags?.website || null,
        phone: it.extratags?.phone || null,
        email: it.extratags?.email || null,
        lat: parseFloat(it.lat),
        lon: parseFloat(it.lon),
        mapsUrl: `https://www.openstreetmap.org/?mlat=${it.lat}&mlon=${it.lon}#map=16/${it.lat}/${it.lon}`
      };
    });

  let combined = [...overpassItems, ...nomItems];

  // Filter out generic location/city names
  const cityLower = city.toLowerCase().trim();
  const countryLower = country.toLowerCase().trim();
  combined = combined.filter((item) => {
    if (!item.name) return false;
    const nLower = item.name.toLowerCase().trim();
    if (nLower === cityLower || nLower === countryLower || nLower === `${cityLower}, ${countryLower}`) {
      return false;
    }
    return true;
  });

  // Deduplicate by lowercase business name
  const seen = new Set();
  combined = combined.filter((item) => {
    const key = item.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Filter by niche if specified
  if (rawNiche) {
    const searchTokens = rawNiche.split(/\s+/).filter((t) => t.length > 1);
    const filtered = combined.filter((item) => {
      const nLower = item.name.toLowerCase();
      const cLower = item.category.toLowerCase();
      return searchTokens.some((t) => nLower.includes(t) || cLower.includes(t));
    });
    if (filtered.length > 0) combined = filtered;
  }

  // Fast Parallel Website Email Extractor
  async function findRealEmailFromWebsite(websiteUrl) {
    if (!websiteUrl) return null;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

    let base;
    try {
      base = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`).origin;
    } catch (e) {
      return null;
    }

    const tryFetch = async (url) => {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 2200);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(t);
        if (!res.ok) return null;
        const html = await res.text();
        const mailtoMatch = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
        if (mailtoMatch) return mailtoMatch[1];
        const bodyMatch = html.match(emailRegex);
        if (bodyMatch) return bodyMatch[0];
        return null;
      } catch (e) {
        return null;
      }
    };

    const found = await tryFetch(base);
    if (found) return found;

    const foundOnContact = await tryFetch(base + "/contact");
    if (foundOnContact) return foundOnContact;

    return null;
  }

  onProgress({ status: `Verifying website contact emails...`, progress: 92 });
  const timestampStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const finalResults = await Promise.all(
    combined.map(async (item) => {
      const contacts = resolveLeadContactInfo(item.phone, item.email);
      let resolvedEmail = contacts.email;
      let emailSource = contacts.hasRealEmail ? "osm" : null;

      if (!resolvedEmail && item.website) {
        const siteEmail = await findRealEmailFromWebsite(item.website);
        if (siteEmail) {
          resolvedEmail = siteEmail;
          emailSource = "website";
        }
      }

      const updatedItem = {
        ...item,
        phone: contacts.phone,
        email: resolvedEmail,
        hasRealPhone: contacts.hasRealPhone,
        hasRealEmail: Boolean(resolvedEmail),
        emailSource
      };

      const { score, reasons, hasWebsite } = scoreOSMLead(updatedItem);
      const intel = getBusinessIntelligence(updatedItem.category, updatedItem.name, hasWebsite, updatedItem.phone);
      return { ...updatedItem, score, reasons, hasWebsite, intel, fetchedAt: timestampStr };
    })
  );

  if (finalResults.length > 0) {
    saveCachedCityLeads(country, city, niche, finalResults, cleanDisplayName);
  }

  return {
    results: finalResults,
    isCached: false,
    fetchedAtTime: timestampStr,
    cachedMinutesAgo: 0,
    cooldownRemaining: finalResults.length > 0 ? COOLDOWN_SECONDS : 0,
    displayName: cleanDisplayName
  };
}

// Main Component
export default function LeadScout() {
  const [selectedCountry, setSelectedCountry] = useState("India");
  const [selectedCity, setSelectedCity] = useState("Thane, Maharashtra");
  const [customCity, setCustomCity] = useState("");
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [niche, setNiche] = useState("");

  const [senderName] = useState("Talha");
  const [companyName] = useState("Kravine Studios");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [leads, setLeads] = useState([]);
  const [scanStatus, setScanStatus] = useState({ status: "Scanning selected city leads...", progress: 0 });
  const [cacheInfo, setCacheInfo] = useState({ isCached: false, fetchedAtTime: "", cachedMinutesAgo: 0, displayName: "" });
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const [expandedId, setExpandedId] = useState(null);
  const [emailDrafts, setEmailDrafts] = useState({});
  const [draftingId, setDraftingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [sortBy, setSortBy] = useState("score");
  const [filterNoWebsiteOnly, setFilterNoWebsiteOnly] = useState(false);
  const [showSearchForm, setShowSearchForm] = useState(false);

  // Active City Name computed
  const activeCityName = isCustomMode && customCity.trim() ? customCity.trim() : selectedCity;

  // Cooldown Timer Interval
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  // Main Lead Fetch Engine Call
  const runLeadScan = useCallback(
    async (country, city, targetNiche, forceRefresh = false) => {
      const activeCountry = country || selectedCountry;
      const activeCity = city || activeCityName;
      setLoading(true);
      setError("");
      try {
        const response = await fastSearchShops(
          activeCountry,
          activeCity,
          targetNiche !== undefined ? targetNiche : niche,
          forceRefresh,
          (prog) => setScanStatus(prog)
        );

        setLeads(response.results);
        setCacheInfo({
          isCached: response.isCached,
          fetchedAtTime: response.fetchedAtTime,
          cachedMinutesAgo: response.cachedMinutesAgo,
          displayName: response.displayName
        });

        if (response.cooldownRemaining > 0) {
          setCooldownRemaining(response.cooldownRemaining);
        }

        if (response.results.length > 0) {
          setExpandedId(response.results[0].id);
        }
      } catch (e) {
        setError(e.message || "Failed to scan leads for the selected area.");
      } finally {
        setLoading(false);
      }
    },
    [selectedCountry, activeCityName, niche]
  );

  // Handle Country Selection Change & IMMEDIATELY trigger new country lead search!
  const handleCountryChange = (countryName) => {
    setSelectedCountry(countryName);
    const cities = COUNTRY_CITIES_MAP[countryName] || [];
    let targetCity = "";
    if (cities.length > 0) {
      targetCity = cities[0];
      setSelectedCity(targetCity);
      setIsCustomMode(false);
    } else {
      setIsCustomMode(true);
      targetCity = "";
    }
    // Auto-scan new country's leads immediately!
    runLeadScan(countryName, targetCity, niche, false);
  };

  // Initial Scan on Mount
  useEffect(() => {
    runLeadScan("India", "Thane, Maharashtra", "", false);
  }, []);

  function draftEmail(lead) {
    setDraftingId(lead.id);

    setTimeout(() => {
      const intel = lead.intel;
      let draftText = "";

      const contactLine = [
        lead.email ? `To: ${lead.email}` : null,
        lead.phone ? `Phone Contact: ${lead.phone}` : null
      ].filter(Boolean).join("\n");
      const contactBlock = contactLine || "(No email or phone listed on OSM — you'll need to find contact details separately, e.g. via their storefront or a search.)";

      if (!lead.hasWebsite) {
        draftText = `Subject: Proposal for ${lead.name} — Website & ${intel.whatCanBeMade.saasTitle}
${contactBlock}

Hi ${lead.name} Team,

I came across ${lead.name} in ${activeCityName} and noticed you currently don't have an active website or direct ordering/booking portal.

We at ${companyName} specialize in building digital software for ${intel.categoryName}s. For ${lead.name}, we propose:

1. Custom Website: ${intel.whatCanBeMade.websiteStrategy} (${intel.pricing.websiteFee})
2. ${intel.whatCanBeMade.saasTitle}:
${intel.whatCanBeMade.saasModules.map((m) => `   - ${m}`).join("\n")}
   Pricing: ${intel.pricing.saasSetupFee} + ${intel.pricing.saasMonthly}

💡 Value Impact: ${intel.pricing.estimatedRoi}

Would you be open to a quick 5-minute chat this week?

Best regards,

${senderName}
${companyName}`;
      } else {
        draftText = `Subject: Upgrade Proposal for ${lead.name} — ${intel.whatCanBeMade.saasTitle}
${contactBlock}

Hi ${lead.name} Team,

I came across ${lead.name} in ${activeCityName} and checked out your website (${lead.website}).

We can significantly increase your direct revenue and customer retention with ${intel.whatCanBeMade.saasTitle} tailored for ${intel.categoryName}s.

Key Features for ${lead.name}:
${intel.whatCanBeMade.saasModules.map((m) => ` - ${m}`).join("\n")}

Pricing: ${intel.pricing.saasSetupFee} + ${intel.pricing.saasMonthly}
💡 Value Impact: ${intel.pricing.estimatedRoi}

Would you have 5 minutes for a quick chat this week?

Best regards,

${senderName}
${companyName}`;
      }

      setEmailDrafts((prev) => ({ ...prev, [lead.id]: draftText }));
      setDraftingId(null);
    }, 200);
  }

  function copyEmail(id) {
    const text = emailDrafts[id];
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  const filteredLeads = leads
    .filter((l) => (!filterNoWebsiteOnly || !l.hasWebsite))
    .sort((a, b) => {
      if (sortBy === "score") return b.score - a.score;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "category") return a.category.localeCompare(b.category);
      return 0;
    });

  const cityList = COUNTRY_CITIES_MAP[selectedCountry] || [];

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: "#0B132B",
        color: "#F1F5F9",
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif"
      }}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <header className="border-b" style={{ borderColor: "#1E293B" }}>
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center" style={{ width: 34, height: 34 }}>
              <Radar size={22} style={{ color: "#2DD4BF" }} className={loading ? "animate-spin" : ""} />
            </div>
            <div>
              <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 21, letterSpacing: "-0.01em" }}>
                Lead Scout <span style={{ fontSize: 11, background: "#0F2942", color: "#2DD4BF", border: "1px solid #0D9488", borderRadius: 12, padding: "2px 8px", marginLeft: 6, verticalAlign: "middle" }}>Automated Lead Engine</span>
              </h1>
              <p style={{ fontSize: 12, color: "#64748B", fontFamily: "'IBM Plex Mono', monospace" }}>
                whole-city bbox search → real OSM contacts only → product roadmap & pricing
              </p>
            </div>
          </div>

          {/* Location Controls & Refresh Action */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Country Selector */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-xs text-white">
              <Globe size={13} className="text-teal-400" />
              <select
                value={selectedCountry}
                onChange={(e) => handleCountryChange(e.target.value)}
                className="bg-transparent text-white cursor-pointer outline-none text-xs font-medium"
              >
                {Object.keys(COUNTRY_CITIES_MAP).map((c) => (
                  <option key={c} value={c} className="bg-slate-900 text-white">
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* City / Region Selector */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-xs text-white">
              <MapPin size={13} className="text-teal-400" />
              {!isCustomMode ? (
                <select
                  value={selectedCity}
                  onChange={(e) => {
                    if (e.target.value === "__CUSTOM__") {
                      setIsCustomMode(true);
                      setCustomCity("");
                    } else {
                      setSelectedCity(e.target.value);
                      runLeadScan(selectedCountry, e.target.value, niche, false);
                    }
                  }}
                  className="bg-transparent text-white cursor-pointer outline-none text-xs font-medium"
                >
                  {cityList.map((ct) => (
                    <option key={ct} value={ct} className="bg-slate-900 text-white">
                      {ct}
                    </option>
                  ))}
                  <option value="__CUSTOM__" className="bg-slate-900 text-teal-400 font-semibold">
                    + Search / Custom City...
                  </option>
                </select>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    placeholder="Enter city name..."
                    value={customCity}
                    onChange={(e) => setCustomCity(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") runLeadScan(selectedCountry, customCity, niche, false);
                    }}
                    className="bg-slate-800 text-white px-2 py-0.5 rounded text-xs border border-slate-600 outline-none"
                  />
                  <button
                    onClick={() => runLeadScan(selectedCountry, customCity, niche, false)}
                    className="px-2 py-0.5 rounded bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs cursor-pointer"
                  >
                    Go
                  </button>
                  <button
                    onClick={() => setIsCustomMode(false)}
                    className="text-gray-400 text-xs hover:text-white px-1"
                    title="Back to dropdown"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Toggle Custom Settings Panel */}
            <button
              onClick={() => setShowSearchForm(!showSearchForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all"
              style={{ border: "1px solid #1E293B", color: "#F1F5F9", background: "#162238" }}
            >
              <Filter size={13} className="text-teal-400" /> {showSearchForm ? "Hide Filters" : "Category / Niche Search"}
            </button>

            {/* Refresh Button with Cooldown Handling */}
            <button
              onClick={() => runLeadScan(selectedCountry, activeCityName, niche, true)}
              disabled={loading || cooldownRemaining > 0}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold shadow transition-all ${cooldownRemaining > 0
                  ? "bg-slate-800 text-gray-400 border border-slate-700 cursor-not-allowed"
                  : "bg-teal-500 hover:bg-teal-400 text-slate-950 cursor-pointer shadow-teal-500/10"
                }`}
              title={cooldownRemaining > 0 ? `Cooldown active (${cooldownRemaining}s remaining)` : "Refresh live OpenStreetMap data"}
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              {cooldownRemaining > 0 ? `Cooldown (${cooldownRemaining}s)` : "Refresh Live Data"}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-6 flex flex-col gap-6">
        {/* Custom Niche / Filter Form */}
        {showSearchForm && (
          <div className="p-5 rounded-lg flex flex-col gap-4 shadow-lg" style={{ background: "#162238", border: "1px solid #1E293B" }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                <span>SPECIFIC BUSINESS TYPE OR KEYWORD</span>
                <input
                  type="text"
                  placeholder="e.g. Shawarma, Cafe, Dental Clinic, Gym, Salon"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white focus:border-teal-500 outline-none"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-slate-400">
                <span>CURRENT LOCATION HIERARCHY</span>
                <div className="p-2 bg-slate-900 border border-slate-700 rounded text-sm text-teal-300 font-medium">
                  {selectedCountry} ➔ {activeCityName}
                </div>
              </label>
            </div>

            <button
              onClick={() => runLeadScan(selectedCountry, activeCityName, niche, false)}
              className="self-end px-5 py-2 rounded text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 cursor-pointer shadow"
            >
              Apply Filter & Scan City
            </button>
          </div>
        )}

        {/* ⚡ Quick Category Filter Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { label: "🔥 All Local Leads", n: "" },
            { label: "🍽️ Restaurants & Food", n: "restaurant" },
            { label: "🌯 Shawarma Outlets", n: "shawarma" },
            { label: "🩺 Clinics & Doctors", n: "clinic" },
            { label: "✂️ Salons & Spas", n: "salon" },
            { label: "🏋️ Gyms & Fitness", n: "gym" },
            { label: "🛍️ Retail Shops", n: "shop" }
          ].map((catBtn) => (
            <button
              key={catBtn.label}
              onClick={() => {
                setNiche(catBtn.n);
                runLeadScan(selectedCountry, activeCityName, catBtn.n, false);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition-all ${niche === catBtn.n
                  ? "bg-teal-500 text-slate-950 font-bold shadow-lg shadow-teal-500/20"
                  : "bg-slate-800/80 text-slate-300 border border-slate-700/80 hover:border-teal-500/50"
                }`}
            >
              {catBtn.label}
            </button>
          ))}
        </div>

        {/* Status & Freshness Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg" style={{ background: "#162238", border: "1px solid #1E293B" }}>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ color: "#F1F5F9", fontWeight: 700, fontSize: 16 }}>
                {filteredLeads.length} Verified Business Leads
              </span>
              <span style={{ color: "#94A3B8", fontSize: 13 }}>
                in <strong style={{ color: "#2DD4BF" }}>{activeCityName}, {selectedCountry}</strong> {niche ? `matching "${niche}"` : ""}
              </span>
            </div>

            {/* Data Freshness Notice & Cache Banner */}
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded bg-slate-900 text-teal-300 border border-slate-700 font-medium">
                <Info size={12} className="text-teal-400" /> OpenStreetMap community data — may not reflect current status
              </span>

              {cacheInfo.isCached ? (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded bg-blue-950 text-cyan-300 border border-blue-800 font-medium">
                  <Clock size={12} /> {cacheInfo.cachedMinutesAgo === 0 ? "Cached just now" : `Cached ${cacheInfo.cachedMinutesAgo}m ago`} ({cacheInfo.fetchedAtTime})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800 font-medium">
                  <CheckCircle2 size={12} /> Fresh Live Scan ({cacheInfo.fetchedAtTime || "Just fetched"})
                </span>
              )}

              {cooldownRemaining > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-teal-400 font-mono">
                  <Clock size={11} /> Cooldown active ({cooldownRemaining}s)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-xs" style={{ color: "#94A3B8" }}>
              <input
                type="checkbox"
                checked={filterNoWebsiteOnly}
                onChange={(e) => setFilterNoWebsiteOnly(e.target.checked)}
                className="rounded border-gray-700 bg-gray-900 accent-teal-500 cursor-pointer"
              />
              No website only
            </label>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs rounded px-2.5 py-1.5 cursor-pointer outline-none"
              style={{ background: "#0F172A", border: "1px solid #1E293B", color: "#F1F5F9" }}
            >
              <option value="score">Sort: Highest Potential Score</option>
              <option value="name">Sort: Business Name</option>
              <option value="category">Sort: Category</option>
            </select>
          </div>
        </div>

        {/* Progress Indicator during Parallel Queries */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 size={36} className="animate-spin text-teal-400" />
            <div className="flex flex-col items-center gap-1 text-center">
              <p style={{ color: "#F1F5F9", fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600 }}>
                {scanStatus.status || "Scanning city leads..."}
              </p>
              <p className="text-xs text-slate-400 font-mono">
                Executing parallel fast queries & validating contacts...
              </p>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg p-4 bg-red-950/60 border border-red-800 text-red-300 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Lead Feed */}
        {!loading && (
          <div className="flex flex-col gap-4">
            {filteredLeads.map((lead) => (
              <AutomatedLeadCard
                key={lead.id}
                lead={lead}
                expanded={expandedId === lead.id}
                onToggle={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                draft={emailDrafts[lead.id]}
                drafting={draftingId === lead.id}
                copied={copiedId === lead.id}
                onDraft={() => draftEmail(lead)}
                onCopy={() => copyEmail(lead.id)}
              />
            ))}

            {filteredLeads.length === 0 && !loading && (
              <div className="text-center py-12 bg-slate-900/50 rounded-lg border border-slate-800 text-slate-400 text-sm">
                No business leads found matching your criteria in {activeCityName}. Try clearing your category filter or selecting another city.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// 🌟 Automated Lead Card Component with Guaranteed Contact Details
function AutomatedLeadCard({ lead, expanded, onToggle, draft, drafting, copied, onDraft, onCopy }) {
  const tier = scoreTier(lead.score);
  const intel = lead.intel;

  return (
    <div className="rounded-lg overflow-hidden transition-all shadow-md" style={{ background: "#162238", border: "1px solid #1E293B" }}>
      {/* Lead Card Header Summary */}
      <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-800/40" onClick={onToggle}>
        <div className="flex flex-col items-center justify-center flex-shrink-0" style={{ width: 48 }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 20, color: tier.color }}>
            {lead.score}
          </div>
          <div style={{ fontSize: 9, color: tier.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {tier.label}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontWeight: 700, fontSize: 16.5, color: "#F1F5F9" }}>{lead.name}</span>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 4,
                background: "#0F172A",
                color: "#94A3B8",
                textTransform: "capitalize"
              }}
            >
              {lead.category}
            </span>

            {lead.hasWebsite ? (
              <span className="flex items-center gap-1 text-xs" style={{ color: "#2DD4BF" }}>
                <Globe size={12} /> Has Website
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium" style={{ color: "#38BDF8", background: "#0F2942" }}>
                <GlobeLock size={12} /> No Website
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
            <span>{lead.address}</span>
            <span className="text-slate-500 font-mono text-[11px]">• OSM Data ({lead.fetchedAt || "Snapshot"})</span>
          </div>

          {/* Quick Contact Bar on Header */}
          <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap">
            <span className={`inline-flex items-center gap-1 font-mono bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/60 text-[11px] ${lead.phone ? "text-teal-300" : "text-slate-500 italic"}`}>
              <Phone size={11} className={lead.phone ? "text-teal-400" : "text-slate-500"} /> {lead.phone || "Phone not listed"}
            </span>
            <span className={`inline-flex items-center gap-1 font-mono bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/60 text-[11px] ${lead.email ? "text-cyan-300" : "text-slate-500 italic"}`}>
              <Mail size={11} className={lead.email ? "text-cyan-400" : "text-slate-500"} /> {lead.email || "Email not listed"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span
            className="hidden md:inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded font-semibold"
            style={{ background: "#0F2942", border: `1px solid ${intel.badgeColor}44`, color: intel.badgeColor }}
          >
            <Sparkles size={13} /> {intel.whatCanBeMade.saasTitle}
          </span>
          {expanded ? <ChevronUp size={18} color="#64748B" /> : <ChevronDown size={18} color="#64748B" />}
        </div>
      </div>

      {/* Expanded Deep Lead Intelligence */}
      {expanded && (
        <div className="px-5 pb-5 flex flex-col gap-4" style={{ borderTop: "1px solid #1E293B", paddingTop: 16 }}>
          {/* Grid Layout: What Already Exists vs What This Org Needs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Box 1: What Already Exists */}
            <div className="p-4 rounded-lg flex flex-col gap-2" style={{ background: "#0F172A", border: "1px solid #1E293B" }}>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <Globe size={14} className="text-teal-400" /> 1. What Already Exists
              </div>
              <div className="text-xs text-slate-300 font-medium">
                • {intel.whatExists.webStatus}
              </div>
              <div className="text-xs text-slate-300 flex items-center gap-1 font-mono">
                • Phone: {lead.phone ? <span className="text-teal-300">{lead.phone}</span> : <span className="text-slate-500 italic">not listed on OSM</span>}
              </div>
              <div className="text-xs text-slate-300 flex items-center gap-1 font-mono">
                • Email: {lead.email ? <span className="text-cyan-300">{lead.email}</span> : <span className="text-slate-500 italic">not listed on OSM</span>}
              </div>
            </div>

            {/* Box 2: What This Org Needs */}
            <div className="p-4 rounded-lg flex flex-col gap-2" style={{ background: "#0F172A", border: "1px solid #1E293B" }}>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <AlertCircle size={14} className="text-cyan-400" /> 2. What This Org Needs
              </div>
              <div className="text-xs text-cyan-200/90 leading-relaxed font-medium">
                {intel.whatIsNeeded}
              </div>
            </div>
          </div>

          {/* Box 3: What Can Be Made (Product Roadmap) */}
          <div className="p-4 rounded-lg flex flex-col gap-3" style={{ background: "#0F172A", border: `1px solid ${intel.badgeColor}44` }}>
            <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: "#1E293B" }}>
              <div className="flex items-center gap-2">
                <Wrench size={16} style={{ color: intel.badgeColor }} />
                <span style={{ fontWeight: 700, fontSize: 14.5, color: intel.badgeColor }}>
                  3. Solution Roadmap: {intel.whatCanBeMade.saasTitle}
                </span>
              </div>
              <span style={{ fontSize: 11, color: "#64748B", fontFamily: "'IBM Plex Mono', monospace" }}>
                {intel.categoryName}
              </span>
            </div>

            {/* Website Strategy */}
            <div>
              <div style={{ fontSize: 11.5, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>
                🌐 Proposed Website Strategy
              </div>
              <div style={{ fontSize: 13, color: "#F1F5F9", marginTop: 2 }}>{intel.whatCanBeMade.websiteStrategy}</div>
            </div>

            {/* SaaS Features */}
            <div>
              <div style={{ fontSize: 11.5, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>
                ⚙️ Custom SaaS Product Modules
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                {intel.whatCanBeMade.saasModules.map((mod, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                    <CheckCircle2 size={13} style={{ color: intel.badgeColor, flexShrink: 0, marginTop: 2 }} />
                    <span>{mod}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pricing & ROI Breakdown */}
            <div className="mt-1 pt-3 border-t grid grid-cols-1 md:grid-cols-3 gap-3" style={{ borderColor: "#1E293B" }}>
              <div className="rounded p-2.5" style={{ background: "#162238", border: "1px solid #1E293B" }}>
                <div style={{ fontSize: 11, color: "#94A3B8" }}>Website Build (Est. Starting Price)</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#38BDF8" }}>{intel.pricing.websiteFee}</div>
              </div>
              <div className="rounded p-2.5" style={{ background: "#162238", border: "1px solid #1E293B" }}>
                <div style={{ fontSize: 11, color: "#94A3B8" }}>SaaS Setup (Est. Starting Price)</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#2DD4BF" }}>{intel.pricing.saasSetupFee}</div>
              </div>
              <div className="rounded p-2.5" style={{ background: "#162238", border: "1px solid #1E293B" }}>
                <div style={{ fontSize: 11, color: "#94A3B8" }}>Monthly SaaS (Est. Range)</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#818CF8" }}>{intel.pricing.saasMonthly}</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-teal-400 font-medium">
              <TrendingUp size={14} /> Estimated Business Impact & ROI Range: {intel.pricing.estimatedRoi}
            </div>
          </div>

          {/* Action Row with Direct Contacts */}
          <div className="flex items-center justify-between gap-4 pt-2 flex-wrap">
            <div className="flex items-center gap-3 text-xs text-slate-300 flex-wrap">
              {lead.phone && (
                <span className="flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded border border-slate-700 text-teal-300 font-mono">
                  <Phone size={12} className="text-teal-400" /> {lead.phone}
                </span>
              )}
              {lead.email && (
                <span className="flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded border border-slate-700 text-cyan-300 font-mono">
                  <Mail size={12} className="text-cyan-400" /> {lead.email}
                </span>
              )}
              {!lead.phone && !lead.email && (
                <span className="text-slate-500 italic">No phone or email listed on OSM for this business</span>
              )}
              {lead.website && (
                <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-teal-400 hover:underline">
                  <Globe size={12} /> {lead.website.replace(/^https?:\/\//, "")} <ExternalLink size={10} />
                </a>
              )}
            </div>

            {!draft ? (
              <button
                onClick={onDraft}
                disabled={drafting}
                className="flex items-center gap-2 rounded px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white cursor-pointer shadow"
              >
                {drafting ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                {drafting ? "Drafting Proposal..." : "Draft Proposal Email"}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={onCopy}
                  className="flex items-center gap-1.5 rounded px-3.5 py-1.5 text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 cursor-pointer shadow"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied!" : "Copy Proposal Email"}
                </button>
              </div>
            )}
          </div>

          {/* Draft Email View */}
          {draft && (
            <div className="mt-2">
              <textarea
                value={draft}
                readOnly
                rows={10}
                className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-xs text-gray-200 leading-relaxed font-sans font-mono"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}