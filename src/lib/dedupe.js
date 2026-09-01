/**
 * Lead Deduplication
 *
 * Strategy:
 * 1. Primary key: provider sourceId (Google place_id) — exact match
 * 2. Fallback: normalised name + normalised address segment
 *
 * Branches of the same chain (e.g. "Domino's – Andheri" vs "Domino's – Bandra")
 * are intentionally kept separate because their addresses differ.
 */

/**
 * @param {Object[]} leads - array of normalised lead objects
 * @returns {Object[]} deduplicated leads
 */
export function deduplicateLeads(leads) {
  const seenById = new Set();
  const seenByKey = new Set();
  const unique = [];

  for (const lead of leads) {
    // Primary: exact provider ID
    if (lead.sourceId) {
      if (seenById.has(lead.sourceId)) continue;
      seenById.add(lead.sourceId);
    } else {
      // Fallback: name + first segment of address (street / locality)
      const namePart = normStr(lead.name);
      const addrPart = normStr(firstAddressSegment(lead.address));
      if (!namePart) continue; // drop unnamed results
      const key = `${namePart}||${addrPart}`;
      if (seenByKey.has(key)) continue;
      seenByKey.add(key);
    }

    unique.push(lead);
  }

  return unique;
}

function normStr(s) {
  if (!s) return "";
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0900-\u097f]/g, "") // keep ASCII alphanumeric + Devanagari
    .slice(0, 60);
}

function firstAddressSegment(address) {
  if (!address) return "";
  // Take everything up to the first comma — usually the street/locality
  return address.split(",")[0].trim();
}
