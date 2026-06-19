/**
 * Offering type → human label mapping.
 *
 * The `type` field on Offering is a FREE STRING — these helpers handle
 * the conventional values plus a graceful fallback (capitalised slug)
 * for anything new. Used by:
 *   - Brand Creation Wizard ("Products" / "Treatments" / "Menu Items")
 *   - Catalog page tabs
 *   - Post-creation attachment picker
 *   - Campaign-creation offering selector
 *
 * Don't import this from API routes — it's a UI concern; the DB stores
 * the raw type slug verbatim.
 */

const KNOWN_LABELS: Record<string, { singular: string; plural: string }> = {
  product: { singular: "Product", plural: "Products" },
  service: { singular: "Service", plural: "Services" },
  menu_item: { singular: "Menu Item", plural: "Menu Items" },
  project: { singular: "Project", plural: "Projects" },
  course: { singular: "Course", plural: "Courses" },
  treatment: { singular: "Treatment", plural: "Treatments" },
  property: { singular: "Property", plural: "Properties" },
  package: { singular: "Package", plural: "Packages" },
  collection: { singular: "Collection", plural: "Collections" },
  event: { singular: "Event", plural: "Events" },
};

export type LabelForm = "singular" | "plural";

function fallbackLabel(type: string, form: LabelForm): string {
  const words = type
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase());
  const singular = words.join(" ") || "Item";
  return form === "plural" ? `${singular}s` : singular;
}

export function offeringLabel(type: string, form: LabelForm = "plural"): string {
  const known = KNOWN_LABELS[type];
  return known ? known[form] : fallbackLabel(type, form);
}

export function offeringSetLabel(types: readonly string[]): string {
  const unique = Array.from(new Set(types.filter(Boolean)));
  if (unique.length === 0) return "Catalog";
  if (unique.length === 1) return offeringLabel(unique[0], "plural");
  if (unique.length === 2) {
    return `${offeringLabel(unique[0], "plural")} and ${offeringLabel(unique[1], "plural")}`;
  }
  return "Catalog";
}

export function isKnownOfferingType(type: string): boolean {
  return type in KNOWN_LABELS;
}

export const KNOWN_OFFERING_TYPES: readonly string[] = Object.keys(KNOWN_LABELS);
