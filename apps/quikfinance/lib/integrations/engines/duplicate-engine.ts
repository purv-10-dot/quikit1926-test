/**
 * Duplicate Detection Engine — pure matching logic for the migration wizard.
 * Scores candidate matches across GSTIN, PAN, email, and phone and emits merge
 * suggestions. Used to keep imports clean (no duplicate customers/vendors).
 */

export type PartyKeys = {
  id: string;
  name?: string | null;
  gstin?: string | null;
  pan?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type MatchReason = "gstin" | "pan" | "email" | "phone" | "name";

export type DuplicateMatch = {
  incomingId: string;
  existingId: string;
  score: number; // 0..100
  reasons: MatchReason[];
  recommend: "merge" | "review" | "import";
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const pan = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

/** PAN is characters 3–12 of an Indian GSTIN — derive when PAN is absent. */
function panFromGstin(gstin?: string | null): string {
  const g = pan(gstin);
  return g.length >= 15 ? g.slice(2, 12) : "";
}

const WEIGHTS: Record<MatchReason, number> = { gstin: 60, pan: 45, email: 30, phone: 25, name: 10 };

export function scoreMatch(incoming: PartyKeys, existing: PartyKeys): DuplicateMatch | null {
  const reasons: MatchReason[] = [];

  const inGstin = pan(incoming.gstin);
  const exGstin = pan(existing.gstin);
  if (inGstin && exGstin && inGstin === exGstin) reasons.push("gstin");

  const inPan = pan(incoming.pan) || panFromGstin(incoming.gstin);
  const exPan = pan(existing.pan) || panFromGstin(existing.gstin);
  if (inPan && exPan && inPan === exPan && !reasons.includes("gstin")) reasons.push("pan");

  if (norm(incoming.email) && norm(incoming.email) === norm(existing.email)) reasons.push("email");

  const inPhone = digits(incoming.phone);
  const exPhone = digits(existing.phone);
  if (inPhone.length >= 7 && inPhone.slice(-10) === exPhone.slice(-10)) reasons.push("phone");

  if (norm(incoming.name) && norm(incoming.name) === norm(existing.name)) reasons.push("name");

  if (reasons.length === 0) return null;
  const score = Math.min(100, reasons.reduce((sum, r) => sum + WEIGHTS[r], 0));
  const recommend = score >= 60 ? "merge" : score >= 30 ? "review" : "import";
  return { incomingId: incoming.id, existingId: existing.id, score, reasons, recommend };
}

/** Find the best duplicate match for each incoming party against existing ones. */
export function detectDuplicates(incoming: PartyKeys[], existing: PartyKeys[]): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  for (const inc of incoming) {
    let best: DuplicateMatch | null = null;
    for (const ex of existing) {
      const m = scoreMatch(inc, ex);
      if (m && (!best || m.score > best.score)) best = m;
    }
    if (best) matches.push(best);
  }
  return matches;
}
