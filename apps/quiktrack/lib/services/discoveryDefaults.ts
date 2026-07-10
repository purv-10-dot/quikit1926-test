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

/** Column order of the default "All ideas" Table view, matching the JPD
 *  reference exactly: Summary, Theme, Insights, Impact, Effort, Roadmap,
 *  Delivery progress. `summary` is the built-in title column; `insights` and
 *  `delivery` are special (feature-backed later) columns; the rest are field
 *  keys. Reach/Confidence/Score fields still exist (they feed the Score) but
 *  aren't shown in this view by default. */
export const DISCOVERY_DEFAULT_COLUMNS = [
  "summary",
  DISCOVERY_FIELD_KEYS.theme,
  "insights",
  DISCOVERY_FIELD_KEYS.impact,
  DISCOVERY_FIELD_KEYS.effort,
  DISCOVERY_FIELD_KEYS.roadmap,
  "delivery",
];

/** The five sample ideas every new discovery space is pre-filled with (mirrors
 *  the JPD template). Values use option SLUGS (generateFieldKey of the label).
 *  impact/effort are 1–5 ratings. */
export const SAMPLE_IDEAS: Array<{
  title: string;
  theme: string;
  impact: number;
  effort: number;
  roadmap: string;
}> = [
  { title: "New rewards program", theme: "increase_revenue", impact: 5, effort: 2, roadmap: "now" },
  { title: "Express checkout", theme: "win_enterprise_customers", impact: 4, effort: 2, roadmap: "next" },
  { title: "Improve waiting list experience", theme: "delight_users", impact: 4, effort: 4, roadmap: "next" },
  { title: "Refactor user profile data", theme: "delight_users", impact: 3, effort: 4, roadmap: "later" },
  { title: "Explore VR travel features", theme: "expand_horizons", impact: 1, effort: 5, roadmap: "won_t_do" },
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
  const firstStatus = await tx.qtIdeaStatus.findFirst({
    where: { projectId, isDeleted: false },
    orderBy: { orderIndex: "asc" },
    select: { id: true },
  });

  const fieldIdByKey = new Map<string, string>();
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
    fieldIdByKey.set(key, field.id);
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

  // Pre-fill the five sample ideas (FR: "always pre-filled on create").
  if (firstStatus) {
    const project = await tx.qtProject.findUnique({
      where: { id: projectId },
      select: { projectKey: true },
    });
    const prefix = project?.projectKey ?? "IDEA";
    const themeId = fieldIdByKey.get(DISCOVERY_FIELD_KEYS.theme);
    const impactId = fieldIdByKey.get(DISCOVERY_FIELD_KEYS.impact);
    const effortId = fieldIdByKey.get(DISCOVERY_FIELD_KEYS.effort);
    const roadmapId = fieldIdByKey.get(DISCOVERY_FIELD_KEYS.roadmap);

    for (let i = 0; i < SAMPLE_IDEAS.length; i++) {
      const s = SAMPLE_IDEAS[i];
      const idea = await tx.qtIdea.create({
        data: {
          orgId,
          projectId,
          key: `${prefix}-${i + 1}`,
          title: s.title,
          statusId: firstStatus.id,
          reporterId: createdBy,
          orderIndex: i,
          createdBy,
          updatedBy: createdBy,
        },
        select: { id: true },
      });
      const rows: Array<{ fieldId: string; valueText?: string; valueNumber?: number }> = [];
      if (themeId) rows.push({ fieldId: themeId, valueText: s.theme });
      if (roadmapId) rows.push({ fieldId: roadmapId, valueText: s.roadmap });
      if (impactId) rows.push({ fieldId: impactId, valueNumber: s.impact });
      if (effortId) rows.push({ fieldId: effortId, valueNumber: s.effort });
      if (rows.length) {
        await tx.qtIdeaFieldValue.createMany({
          data: rows.map((r) => ({ orgId, ideaId: idea.id, createdBy, updatedBy: createdBy, ...r })),
        });
      }
    }
  }
}
