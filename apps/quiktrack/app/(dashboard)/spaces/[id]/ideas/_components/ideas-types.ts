import { DISCOVERY_FIELD_KEYS } from "@/lib/services/discoveryDefaults";

/** One custom-field value as it arrives over the API. */
export type IdeaFieldValue = string | number | boolean | string[] | null;

export interface FieldOption {
  id: string;
  label: string;
  value: string;
  position: number;
  isActive: boolean;
  /** Discovery weighted multi-select: strategic weight (0–5). */
  weight?: number | null;
}

export interface FieldDef {
  id: string;
  key: string;
  name: string;
  type: string;
  options: FieldOption[];
}

export interface IdeaRow {
  id: string;
  key: string;
  title: string;
  description: string | null;
  statusId: string;
  assigneeId: string | null;
  reporterId: string | null;
  createdBy: string | null;
  archivedFlag: boolean;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
  values: Record<string, IdeaFieldValue>;
  /** Real counts for the Insights / Delivery / Comments grid columns (from the API). */
  insightCount?: number;
  deliveryCount?: number;
  /** Linked work items rolled up by status category (JPD "Delivery status"). */
  deliveryCounts?: { total: number; todo: number; inProgress: number; done: number };
  commentCount?: number;
}

export interface IdeaStatus {
  id: string;
  name: string;
  color: string;
  category: string;
  orderIndex: number;
}

export interface IdeaView {
  id: string;
  name: string;
  type: string;
  config: {
    columns?: string[];
    sort?: { key: string; dir: "asc" | "desc" }[];
    filters?: { key: string; op: string; values: (string | number | boolean)[] }[];
    groupBy?: { key: string; hideEmpty?: boolean } | null;
    display?: { rowNumbers?: boolean; rowColor?: { key: string; style: "background" | "highlight" } | null } | null;
    pinnedFields?: string[];
    description?: string; // rich-text HTML for the view's "About" drawer
  } | null;
  visibility: string;
  isDefault: boolean;
}

export interface IdeasBundle {
  ideas: IdeaRow[];
  fields: FieldDef[];
  statuses: IdeaStatus[];
  views: IdeaView[];
}

/** Keys the Table renders with a bespoke cell (dots / pills) rather than a
 *  plain value. Everything else falls back to the generic renderer. */
export const K = DISCOVERY_FIELD_KEYS;

/** Fields shown as a 1–5 dot rating and the accent color of a filled dot.
 *  Lighter blue / coral to match the JPD reference. */
export const RATING_DOTS: Record<string, { max: number; fill: string }> = {
  [K.impact]: { max: 5, fill: "bg-blue-400" },
  [K.effort]: { max: 5, fill: "bg-red-400" },
  [K.reach]: { max: 5, fill: "bg-yellow-400" },
  [K.value]: { max: 5, fill: "bg-purple-400" },
};

/** Fixed roadmap pill palette (data state — not themeable). Keys are option
 *  slugs (generateFieldKey of the label), so "Won't do" → "won_t_do". */
export const ROADMAP_STYLES: Record<string, string> = {
  now: "bg-green-100 text-green-700",
  next: "bg-amber-100 text-amber-800",
  later: "bg-slate-100 text-slate-600",
  won_t_do: "bg-gray-100 text-gray-500",
};

/** Theme option → emoji + text colour + light lozenge background, matching the
 *  JPD reference. Keyed by option slug. Unknown themes fall back to a neutral chip. */
export const THEME_META: Record<string, { emoji: string; text: string; bg: string }> = {
  increase_revenue: { emoji: "🌱", text: "text-green-700", bg: "bg-green-50" },
  win_enterprise_customers: { emoji: "🎯", text: "text-rose-700", bg: "bg-rose-50" },
  delight_users: { emoji: "❤️", text: "text-rose-700", bg: "bg-rose-50" },
  expand_horizons: { emoji: "🚀", text: "text-blue-700", bg: "bg-blue-50" },
};

/** Non-field columns rendered with bespoke placeholder cells. */
export const SPECIAL_COLUMNS: Record<string, string> = {
  summary: "Summary",
  insights: "Insights",
  comments: "Comments",
  delivery: "Delivery progress",
};

/** A small, stable palette for non-roadmap dropdown chips (e.g. Theme). Colour
 *  is chosen deterministically from the option value so it's stable across
 *  renders without needing a colour column on the option. */
const CHIP_PALETTE = [
  "bg-blue-50 text-blue-700",
  "bg-purple-50 text-purple-700",
  "bg-teal-50 text-teal-700",
  "bg-amber-50 text-amber-700",
  "bg-pink-50 text-pink-700",
  "bg-indigo-50 text-indigo-700",
];

export function chipStyle(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return CHIP_PALETTE[h % CHIP_PALETTE.length];
}

/** Deterministic hex color per value (for row coloring / inline styles). */
const HEX_PALETTE = ["#3b82f6", "#8b5cf6", "#14b8a6", "#f59e0b", "#ec4899", "#6366f1", "#10b981", "#ef4444"];
export function hexColorFor(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return HEX_PALETTE[h % HEX_PALETTE.length];
}

/** Human label for a dropdown value via its field's options. */
export function optionLabel(field: FieldDef, value: string): string {
  return field.options.find((o) => o.value === value)?.label ?? value;
}

/** Strategic weight (0–5) for a dropdown value, or 0 if unset. */
export function optionWeight(field: FieldDef, value: string): number {
  return field.options.find((o) => o.value === value)?.weight ?? 0;
}

/** True if a multi-select field has any weighted option (renders weight in cells). */
export function fieldHasWeights(field: FieldDef): boolean {
  return field.options.some((o) => (o.weight ?? 0) > 0);
}
