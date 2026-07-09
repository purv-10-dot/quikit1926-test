import type { Prisma } from "@prisma/client";
import { generateFieldKey } from "@/lib/customFields/registry";

/**
 * Product Discovery template defaults — the idea funnel statuses, the seeded
 * scoring/attribute custom fields, and the single "All ideas" Table view that a
 * discovery space provisions with. Layered on top of `seedProjectDefaults`
 * (which still seeds the 3 starter roles) inside the same create transaction so
 * provisioning stays atomic (rolls back on any failure — FR-1.2).
 *
 * Field values reuse the shared QtCustomField engine via QtIdeaFieldValue, so an
 * admin can add their own fields exactly like these. The Table UI renders the
 * seeded scoring keys specially (dots / pills) by key convention — see
 * DISCOVERY_FIELD_KEYS.
 */

/** Idea funnel — mirrors the real JPD template workflow (see screenshots). */
export const DISCOVERY_STATUSES = [
  { name: "Parking Lot", color: "#94a3b8", category: "PARKING_LOT", orderIndex: 0 },
  { name: "Discovery", color: "#6366f1", category: "DISCOVERY", orderIndex: 1 },
  { name: "Ready for Delivery", color: "#0ea5e9", category: "READY", orderIndex: 2 },
  { name: "Delivery", color: "#2563eb", category: "DELIVERY", orderIndex: 3 },
  { name: "Impact", color: "#16a34a", category: "IMPACT", orderIndex: 4 },
  { name: "Archived", color: "#64748b", category: "ARCHIVED", orderIndex: 5 },
] as const;

/** Canonical keys of the seeded fields (generateFieldKey of each name). The
 *  Table renderer and the Score recompute both key off these. */
export const DISCOVERY_FIELD_KEYS = {
  theme: "theme",
  impact: "impact",
  effort: "effort",
  reach: "reach",
  confidence: "confidence",
  roadmap: "roadmap",
  score: "score",
} as const;

/** Score is computed server-side and read-only in the UI. */
export const SCORE_FIELD_KEY = DISCOVERY_FIELD_KEYS.score;

/** Inputs the RICE Score is derived from. */
export const SCORE_INPUT_KEYS = [
  DISCOVERY_FIELD_KEYS.impact,
  DISCOVERY_FIELD_KEYS.confidence,
  DISCOVERY_FIELD_KEYS.reach,
  DISCOVERY_FIELD_KEYS.effort,
] as const;

interface SeedField {
  name: string;
  type: string;
  helpText?: string;
  /** Dropdown option labels (DROPDOWN_SINGLE). */
  options?: string[];
}

export const DISCOVERY_FIELDS: SeedField[] = [
  {
    name: "Theme",
    type: "DROPDOWN_SINGLE",
    helpText: "The strategic theme this idea supports.",
    options: [
      "Increase revenue",
      "Win enterprise customers",
      "Delight users",
      "Expand horizons",
    ],
  },
  { name: "Impact", type: "NUMBER", helpText: "Rated 1–5." },
  { name: "Effort", type: "NUMBER", helpText: "Rated 1–5." },
  { name: "Reach", type: "NUMBER", helpText: "How many users this reaches." },
  { name: "Confidence", type: "NUMBER", helpText: "Confidence, 0–100%." },
  {
    name: "Roadmap",
    type: "DROPDOWN_SINGLE",
    helpText: "Where this sits on the roadmap.",
    options: ["Now", "Next", "Later", "Won't do"],
  },
  {
    name: "Score",
    type: "NUMBER",
    helpText: "Computed: (Impact × Confidence × Reach) ÷ Effort. Read-only.",
  },
];

/** Column order of the default "All ideas" Table view. `summary` is the
 *  built-in title column; the rest are seeded field keys. (Insights and Delivery
 *  progress columns arrive in later phases.) */
export const DISCOVERY_DEFAULT_COLUMNS = [
  "summary",
  DISCOVERY_FIELD_KEYS.theme,
  DISCOVERY_FIELD_KEYS.impact,
  DISCOVERY_FIELD_KEYS.effort,
  DISCOVERY_FIELD_KEYS.reach,
  DISCOVERY_FIELD_KEYS.confidence,
  DISCOVERY_FIELD_KEYS.roadmap,
  DISCOVERY_FIELD_KEYS.score,
];

/**
 * Seed the discovery-specific defaults for a freshly created project. Must run
 * inside the project-create transaction. Idempotent via skipDuplicates /
 * unique keys, so a re-run never doubles rows.
 */
export async function seedDiscoveryDefaults(
  tx: Prisma.TransactionClient,
  projectId: string,
  orgId: string,
  createdBy: string | null = null,
): Promise<void> {
  await tx.qtIdeaStatus.createMany({
    data: DISCOVERY_STATUSES.map((s) => ({ ...s, projectId })),
    skipDuplicates: true,
  });

  let position = 0;
  for (const f of DISCOVERY_FIELDS) {
    const key = generateFieldKey(f.name);
    const field = await tx.qtCustomField.create({
      data: {
        orgId,
        scope: "space",
        projectId,
        name: f.name,
        key,
        type: f.type,
        helpText: f.helpText ?? null,
        position: position++,
        createdBy,
      },
      select: { id: true },
    });
    if (f.options?.length) {
      await tx.qtCustomFieldOption.createMany({
        data: f.options.map((label, i) => ({
          fieldId: field.id,
          label,
          value: generateFieldKey(label),
          position: i,
        })),
      });
    }
  }

  await tx.qtIdeaView.create({
    data: {
      orgId,
      projectId,
      name: "All ideas",
      type: "table",
      config: { columns: DISCOVERY_DEFAULT_COLUMNS },
      visibility: "shared",
      isDefault: true,
      orderIndex: 0,
      createdBy,
    },
  });
}
