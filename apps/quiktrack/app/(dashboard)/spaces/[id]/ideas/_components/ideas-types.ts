import { DISCOVERY_FIELD_KEYS } from "@/lib/services/discoveryDefaults";

/** One custom-field value as it arrives over the API. */
export type IdeaFieldValue = string | number | boolean | string[] | null;

export interface FieldOption {
  id: string;
  label: string;
  value: string;
  position: number;
  isActive: boolean;
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
  archivedFlag: boolean;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
  values: Record<string, IdeaFieldValue>;
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
  config: { columns?: string[] } | null;
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

/** Fields shown as a 1–5 dot rating and the accent color of a filled dot. */
export const RATING_DOTS: Record<string, { max: number; fill: string }> = {
  [K.impact]: { max: 5, fill: "bg-blue-500" },
  [K.effort]: { max: 5, fill: "bg-rose-400" },
};

/** Fixed roadmap pill palette (data state — not themeable). */
export const ROADMAP_STYLES: Record<string, string> = {
  now: "bg-green-100 text-green-700",
  next: "bg-amber-100 text-amber-800",
  later: "bg-slate-100 text-slate-600",
  wont_do: "bg-gray-100 text-gray-500",
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

/** Human label for a dropdown value via its field's options. */
export function optionLabel(field: FieldDef, value: string): string {
  return field.options.find((o) => o.value === value)?.label ?? value;
}
