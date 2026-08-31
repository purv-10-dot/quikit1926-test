/**
 * Deterministic pseudonymisation of a captured Fathom payload, so a REAL API
 * response can become a committed test fixture without committing a client's
 * emails, names, or the things people actually said about each other.
 *
 * WHY DETERMINISTIC, AND WHY ONE SHARED MAP
 * -----------------------------------------
 * The same person appears in at least three places in one payload — in
 * `attendees[]`, as `transcript[].speaker`, and as `action_items[].assignee`.
 * If each site got an independent fake name, the fixture would still LOOK
 * plausible while quietly losing the joins that the parity tests exist to
 * check ("does the assignee match a speaker?"). So one map is built across the
 * whole document and applied everywhere, and it is keyed by insertion order so
 * re-capturing the same meeting produces a byte-identical fixture.
 *
 * WHAT IS PRESERVED, ON PURPOSE
 * -----------------------------
 * Every timestamp, duration, key name, array length and ordering survives
 * untouched. Those are the payload FACTS the fixture exists to assert on.
 * Only human identifiers are rewritten.
 *
 * THIS IS BEST-EFFORT ON FREE PROSE
 * ---------------------------------
 * A nickname, a company said aloud, a street name — no scanner catches those.
 * `assertRedacted` is a safety net against the mechanical failure modes, NOT a
 * guarantee. The capture script prints the redacted transcript and requires a
 * human to read it before the fixture is promoted. Treat the output as
 * reviewed-by-a-person, never as machine-guaranteed.
 */

/** RFC-2606 reserved TLD, and it matches the domain style in Fathom's own demo data. */
const FAKE_DOMAIN = "democlient.example";

/** Stable fake identities, handed out in first-seen order. */
const NAME_ROSTER = [
  "Priya Nair",
  "Rahul Verma",
  "Alex Given",
  "Meera Iyer",
  "Sanjay Rao",
  "Nisha Patel",
  "Arjun Menon",
  "Kavya Reddy",
  "Vikram Shah",
  "Divya Kulkarni",
];

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** `https://fathom.video/calls/883` / `/share/abc` — the id identifies the real meeting. */
const RECORDING_URL_RE = /(fathom\.(?:video|ai)\/(?:calls|share|meetings)\/)([\w-]+)/gi;
const LINKEDIN_RE = /(linkedin\.com\/in\/)([\w-]+)/gi;

export interface RedactionMap {
  /** real (lowercased) → fake. Reverse lookup for the operator, scratchpad only. */
  emails: Record<string, string>;
  names: Record<string, string>;
  recordingIds: Record<string, string>;
}

export interface RedactionResult {
  payload: unknown;
  map: RedactionMap;
  /** Every distinct real identifier that was replaced — for the operator's eyes. */
  replacedCount: number;
}

/**
 * Names worth rewriting look like "Rohit Deshmukh" or "Harjinder (Bobby) Kohli":
 * one to four capitalised words. Deliberately conservative — over-matching would
 * shred ordinary prose into unreadable fixture text and destroy the transcript's
 * value as a parsing test.
 */
function looksLikePersonName(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 60) return false;
  const words = t.split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  return words.every((w) => /^[("']?\p{Lu}[\p{L}'.)-]*$/u.test(w));
}

/** Keys whose STRING value is a person's name wherever it appears in the tree. */
const NAME_KEYS = new Set([
  "name",
  "display_name",
  "displayname",
  "full_name",
  "fullname",
  "speaker",
  "speaker_name",
  "assignee",
  "owner",
  "assigned_to",
  "assignedto",
  "recorded_by",
  "host",
  "created_by",
]);

class Redactor {
  readonly emails: Record<string, string> = {};
  readonly names: Record<string, string> = {};
  readonly recordingIds: Record<string, string> = {};
  private nameSeq = 0;
  private recSeq = 0;

  email(real: string): string {
    const key = real.toLowerCase();
    if (!this.emails[key]) {
      this.emails[key] = `person${Object.keys(this.emails).length + 1}@${FAKE_DOMAIN}`;
    }
    return this.emails[key];
  }

  name(real: string): string {
    const key = real.trim().toLowerCase();
    if (!this.names[key]) {
      const fake = NAME_ROSTER[this.nameSeq] ?? `Person ${this.nameSeq + 1}`;
      this.nameSeq += 1;
      this.names[key] = fake;
    }
    return this.names[key];
  }

  recordingId(real: string): string {
    if (!this.recordingIds[real]) {
      this.recSeq += 1;
      this.recordingIds[real] = `redacted${this.recSeq}`;
    }
    return this.recordingIds[real];
  }

  /**
   * Rewrite identifiers inside a free-text string: emails, recording/LinkedIn
   * URLs, and any ALREADY-KNOWN person name. Names are only substituted in prose
   * once they have been learned from a structured field, which is why the walk
   * runs a name-collection pass before the text pass — a first name mid-sentence
   * ("Thanks, Reena.") is PII, but "Thanks" is not a name to invent a mapping for.
   */
  text(s: string): string {
    let out = s.replace(EMAIL_RE, (m) => this.email(m));
    out = out.replace(RECORDING_URL_RE, (_m, prefix: string, id: string) => `${prefix}${this.recordingId(id)}`);
    out = out.replace(LINKEDIN_RE, (_m, prefix: string, slug: string) => `${prefix}${this.name(slug).toLowerCase().replace(/\s+/g, "-")}`);

    for (const [real, fake] of Object.entries(this.names)) {
      // Whole-word, case-insensitive. Also catch the bare first name, which is
      // how people are actually addressed in a meeting.
      const parts = [real, real.split(/\s+/)[0]].filter((p) => p.length > 2);
      for (const part of new Set(parts)) {
        const fakePart = part === real ? fake : fake.split(/\s+/)[0];
        out = out.replace(new RegExp(`\\b${escapeRe(part)}\\b`, "gi"), fakePart);
      }
    }
    return out;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pass 1 — learn every person name from structured fields, before touching prose. */
function collectNames(node: unknown, r: Redactor, keyHint?: string): void {
  if (typeof node === "string") {
    if (keyHint && NAME_KEYS.has(keyHint.toLowerCase()) && looksLikePersonName(node)) r.name(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectNames(item, r, keyHint);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) collectNames(v, r, k);
  }
}

/** Pass 2 — rewrite. Structure, key names, numbers and ordering are untouched. */
function rewrite(node: unknown, r: Redactor, keyHint?: string): unknown {
  if (typeof node === "string") {
    if (keyHint && NAME_KEYS.has(keyHint.toLowerCase()) && looksLikePersonName(node)) return r.name(node);
    return r.text(node);
  }
  if (Array.isArray(node)) return node.map((item) => rewrite(item, r, keyHint));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = rewrite(v, r, k);
    return out;
  }
  return node;
}

/** Redact a captured Fathom payload. Pure: same input → byte-identical output. */
export function redactFathomPayload(payload: unknown): RedactionResult {
  const r = new Redactor();
  collectNames(payload, r);
  const redacted = rewrite(payload, r);
  return {
    payload: redacted,
    map: { emails: { ...r.emails }, names: { ...r.names }, recordingIds: { ...r.recordingIds } },
    replacedCount:
      Object.keys(r.emails).length + Object.keys(r.names).length + Object.keys(r.recordingIds).length,
  };
}

/**
 * Safety net. Returns the JSON paths where a real identifier survived redaction.
 * An empty array means the mechanical checks passed — it does NOT mean the
 * payload is safe to publish; see the module header.
 *
 * The caller MUST refuse to write the fixture when this returns anything.
 */
export function assertRedacted(redacted: unknown, map: RedactionMap): string[] {
  const problems: string[] = [];
  const realEmails = new Set(Object.keys(map.emails));
  const realNames = Object.keys(map.names);
  const realRecIds = new Set(Object.keys(map.recordingIds));

  const walk = (node: unknown, path: string): void => {
    if (typeof node === "string") {
      for (const m of node.match(EMAIL_RE) ?? []) {
        if (!m.toLowerCase().endsWith(`@${FAKE_DOMAIN}`)) {
          problems.push(`${path}: leaked email ${m}`);
        } else if (realEmails.has(m.toLowerCase())) {
          problems.push(`${path}: real email survived ${m}`);
        }
      }
      for (const real of realNames) {
        if (new RegExp(`\\b${escapeRe(real)}\\b`, "i").test(node)) {
          problems.push(`${path}: real name survived "${real}"`);
        }
      }
      for (const m of node.matchAll(RECORDING_URL_RE)) {
        // groups: [full, prefix, id]
        if (realRecIds.has(m[2])) problems.push(`${path}: real recording id survived ${m[2]}`);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, path ? `${path}.${k}` : k);
    }
  };

  walk(redacted, "");
  return problems;
}
