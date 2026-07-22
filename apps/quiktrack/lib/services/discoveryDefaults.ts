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
  // Extended JPD attribute fields (shown in the idea detail panel).
  customerSegments: "customer_segments",
  value: "value",
  goals: "goals",
  productArea: "product_area",
  projectStart: "project_start",
  projectTarget: "project_target",
  category: "category",
  specReady: "spec_ready",
  designsReady: "designs_ready",
  ideaShortDescription: "idea_short_description",
  deliveryStatus: "delivery_status",
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
    type: "DROPDOWN_MULTI",
    helpText: "The strategic theme(s) this idea supports.",
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
  // --- Extended JPD attribute fields (idea detail panel) ---
  {
    name: "Customer segments",
    type: "DROPDOWN_MULTI",
    helpText: "Which customer segments this idea targets.",
    options: ["Enterprise", "Mid-market", "SMB", "Consumer"],
  },
  { name: "Value", type: "NUMBER", helpText: "Perceived customer value, 1–5." },
  {
    name: "Goals",
    type: "DROPDOWN_MULTI",
    helpText: "Product goals this idea contributes to.",
    options: ["Growth", "Retention", "Activation", "Revenue"],
  },
  {
    name: "Product Area",
    type: "DROPDOWN_SINGLE",
    helpText: "The product area this idea belongs to.",
    options: ["Checkout", "Onboarding", "Platform", "Mobile"],
  },
  { name: "Project start", type: "DATE", helpText: "Planned start." },
  { name: "Project target", type: "DATE", helpText: "Target completion." },
  {
    name: "Category",
    type: "DROPDOWN_SINGLE",
    helpText: "Idea category.",
    options: ["Sample ideas", "Customer request", "Internal", "Experiment"],
  },
  { name: "Spec ready", type: "CHECKBOX", helpText: "Spec is ready." },
  { name: "Designs ready", type: "CHECKBOX", helpText: "Designs are ready." },
  { name: "Documents", type: "URL", helpText: "Link to a supporting document." },
  { name: "Labels", type: "LABELS", helpText: "Free-form labels for grouping." },
  { name: "Idea short description", type: "SHORT_TEXT", helpText: "A one-line summary." },
  {
    name: "Delivery status",
    type: "DROPDOWN_SINGLE",
    helpText: "Delivery tracking status.",
    options: ["Not started", "In progress", "Shipped"],
  },
];

/**
 * How the idea detail panel groups fields into its three accordions, matching
 * the JPD reference. Keys not listed fall through to "Available fields".
 * (System fields like Assignee/Reporter/Created come from the idea record and
 * are rendered separately by the panel.)
 */
export const PINNED_FIELD_KEYS: string[] = [
  DISCOVERY_FIELD_KEYS.theme,
  DISCOVERY_FIELD_KEYS.roadmap,
  DISCOVERY_FIELD_KEYS.score,
  DISCOVERY_FIELD_KEYS.customerSegments,
  DISCOVERY_FIELD_KEYS.value,
];

export const IN_VIEW_FIELD_KEYS: string[] = [
  DISCOVERY_FIELD_KEYS.impact,
  DISCOVERY_FIELD_KEYS.effort,
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
  description?: string;
  reach?: number;
  confidence?: number;
  value?: number;
  category?: string;
  productArea?: string;
  customerSegments?: string[];
  goals?: string[];
  specReady?: boolean;
  designsReady?: boolean;
  shortDescription?: string;
  projectStart?: string;
  projectTarget?: string;
}> = [
  {
    title: "New rewards program",
    theme: "increase_revenue",
    impact: 5,
    effort: 2,
    roadmap: "now",
    reach: 3,
    confidence: 100,
    value: 5,
    category: "sample_ideas",
    customerSegments: ["enterprise"],
    specReady: true,
    designsReady: true,
    shortDescription: "This is an idea about X",
    projectStart: "2025-01-01",
    projectTarget: "2025-07-01",
    description:
      "💡 Hypothesis\n\nCreating a reward program for our customers will increase the adoption of our travel booking platform.\n\nThis will benefit users by providing them with more advantages as they use the platform and will encourage new users to use the platform even more.\n\nWe will know if this is true if the number of travel booked per user per year significantly increases after the first six months of experimentation.\n\n✅ Validation\n\nAfter a runtime of 16 weeks, we saw the number of booking per user increase significantly: +17%. The number of returning users has also increased by 24%.\n\nThis validates our hypothesis that a reward program has increased our users' platform adoption.\n\n✔️ Decision\n\nWe will move this feature from Beta to make it generally available to all our customers as its benefit has been proven.",
  },
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
    const K = DISCOVERY_FIELD_KEYS;
    const id = (key: string) => fieldIdByKey.get(key);

    for (let i = 0; i < SAMPLE_IDEAS.length; i++) {
      const s = SAMPLE_IDEAS[i];
      const idea = await tx.qtIdea.create({
        data: {
          orgId,
          projectId,
          key: `${prefix}-${i + 1}`,
          title: s.title,
          description: s.description ?? null,
          statusId: firstStatus.id,
          reporterId: createdBy,
          orderIndex: i,
          createdBy,
          updatedBy: createdBy,
        },
        select: { id: true },
      });

      // Build one QtIdeaFieldValue row per set sample value, using the correct
      // typed column for each field's storage kind.
      const rows: Prisma.QtIdeaFieldValueCreateManyInput[] = [];
      const base = { orgId, ideaId: idea.id, createdBy, updatedBy: createdBy };
      const text = (key: string, v?: string) => { const f = id(key); if (f && v !== undefined) rows.push({ ...base, fieldId: f, valueText: v }); };
      const num = (key: string, v?: number) => { const f = id(key); if (f && v !== undefined) rows.push({ ...base, fieldId: f, valueNumber: v }); };
      const date = (key: string, v?: string) => { const f = id(key); if (f && v !== undefined) rows.push({ ...base, fieldId: f, valueDate: new Date(v) }); };
      const bool = (key: string, v?: boolean) => { const f = id(key); if (f && v !== undefined) rows.push({ ...base, fieldId: f, valueBoolean: v }); };
      const json = (key: string, v?: string[]) => { const f = id(key); if (f && v && v.length) rows.push({ ...base, fieldId: f, valueJson: v }); };

      json(K.theme, [s.theme]); // Theme is DROPDOWN_MULTI → array value
      text(K.roadmap, s.roadmap);
      num(K.impact, s.impact);
      num(K.effort, s.effort);
      num(K.reach, s.reach);
      num(K.confidence, s.confidence);
      num(K.value, s.value);
      text(K.category, s.category);
      text(K.productArea, s.productArea);
      json(K.customerSegments, s.customerSegments);
      json(K.goals, s.goals);
      bool(K.specReady, s.specReady);
      bool(K.designsReady, s.designsReady);
      text(K.ideaShortDescription, s.shortDescription);
      date(K.projectStart, s.projectStart);
      date(K.projectTarget, s.projectTarget);

      if (rows.length) {
        await tx.qtIdeaFieldValue.createMany({ data: rows });
      }
    }
  }
}
