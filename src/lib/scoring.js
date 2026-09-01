/**
 * Lead Scoring — deterministic, transparent, based on real retrieved data only.
 *
 * Every point is earned from an actual field returned by the provider.
 * No AI, no guessing, no fake weighting.
 *
 * Max possible score: 100
 */

/**
 * @typedef {Object} ScoreResult
 * @property {number} score       - 0–100
 * @property {string} tier        - "Hot Lead" | "Warm Lead" | "Cool Lead"
 * @property {string} tierColor   - hex colour for UI
 * @property {ScoringReason[]} reasons
 */

/**
 * @typedef {Object} ScoringReason
 * @property {string} label
 * @property {number} points
 * @property {'positive'|'neutral'|'negative'} type
 */

export function scoreLead(lead) {
  let score = 0;
  const reasons = [];

  // ── Website status (max 25 pts) ────────────────────────────────────────
  if (lead.hasWebsite === false || lead.websiteStatus === "not_found") {
    score += 25;
    reasons.push({ label: "No website found — strong outreach opportunity", points: 25, type: "positive" });
  } else if (lead.hasWebsite === true || lead.websiteStatus === "found") {
    score += 5;
    reasons.push({ label: "Has website — upgrade / SaaS opportunity", points: 5, type: "neutral" });
  } else {
    // websiteStatus === "unknown"
    reasons.push({ label: "Website status not yet checked", points: 0, type: "neutral" });
  }

  // ── Rating (max 20 pts) ────────────────────────────────────────────────
  if (typeof lead.rating === "number") {
    if (lead.rating >= 4.5) {
      score += 20;
      reasons.push({ label: `Rating ${lead.rating} — excellent (≥4.5)`, points: 20, type: "positive" });
    } else if (lead.rating >= 4.0) {
      score += 15;
      reasons.push({ label: `Rating ${lead.rating} — good (≥4.0)`, points: 15, type: "positive" });
    } else if (lead.rating >= 3.5) {
      score += 10;
      reasons.push({ label: `Rating ${lead.rating} — average (≥3.5)`, points: 10, type: "neutral" });
    } else {
      score += 5;
      reasons.push({ label: `Rating ${lead.rating} — below average (<3.5)`, points: 5, type: "negative" });
    }
  } else {
    reasons.push({ label: "No rating data available", points: 0, type: "neutral" });
  }

  // ── Review count (max 20 pts) ──────────────────────────────────────────
  if (typeof lead.reviewCount === "number") {
    if (lead.reviewCount >= 500) {
      score += 20;
      reasons.push({ label: `${lead.reviewCount} reviews — very established`, points: 20, type: "positive" });
    } else if (lead.reviewCount >= 100) {
      score += 15;
      reasons.push({ label: `${lead.reviewCount} reviews — well established`, points: 15, type: "positive" });
    } else if (lead.reviewCount >= 20) {
      score += 10;
      reasons.push({ label: `${lead.reviewCount} reviews — moderate presence`, points: 10, type: "neutral" });
    } else if (lead.reviewCount > 0) {
      score += 5;
      reasons.push({ label: `${lead.reviewCount} reviews — limited data`, points: 5, type: "neutral" });
    } else {
      reasons.push({ label: "No reviews available", points: 0, type: "neutral" });
    }
  } else {
    reasons.push({ label: "Review count not available", points: 0, type: "neutral" });
  }

  // ── Phone availability (max 15 pts) ────────────────────────────────────
  if (lead.hasPhone === true) {
    score += 15;
    reasons.push({ label: "Phone number available", points: 15, type: "positive" });
  } else if (lead.hasPhone === false) {
    reasons.push({ label: "No phone number found", points: 0, type: "neutral" });
  } else {
    reasons.push({ label: "Phone not yet checked", points: 0, type: "neutral" });
  }

  // ── Business status (max 10 pts) ───────────────────────────────────────
  if (lead.businessStatus === "OPERATIONAL") {
    score += 10;
    reasons.push({ label: "Business is operational", points: 10, type: "positive" });
  } else if (lead.businessStatus === "CLOSED_TEMPORARILY") {
    reasons.push({ label: "Business temporarily closed", points: 0, type: "negative" });
  } else if (lead.businessStatus === "CLOSED_PERMANENTLY") {
    score = Math.max(0, score - 20);
    reasons.push({ label: "Business permanently closed — skip", points: -20, type: "negative" });
  } else if (lead.businessStatus) {
    reasons.push({ label: `Status: ${lead.businessStatus}`, points: 0, type: "neutral" });
  }

  // ── Address completeness (max 5 pts) ───────────────────────────────────
  if (lead.address && lead.address.length > 10) {
    score += 5;
    reasons.push({ label: "Complete address available", points: 5, type: "positive" });
  }

  // ── Coordinates (max 5 pts) ────────────────────────────────────────────
  if (lead.latitude !== null && lead.longitude !== null) {
    score += 5;
    reasons.push({ label: "Exact location coordinates available", points: 5, type: "positive" });
  }

  // Clamp to 0–100
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    ...getTier(score),
    reasons,
  };
}

function getTier(score) {
  if (score >= 70) return { tier: "Hot Lead", tierColor: "#14B8A6" };
  if (score >= 45) return { tier: "Warm Lead", tierColor: "#38BDF8" };
  return { tier: "Cool Lead", tierColor: "#64748B" };
}
