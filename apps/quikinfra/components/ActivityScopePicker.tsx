"use client";

/**
 * Activity Scope Picker — the FREE_SCOPE parallel of BOQCascadingPicker.
 *
 * Activity trees are usually shallow, so instead of one combobox per depth
 * this is a single searchable select over the LEAF activities, each labelled
 * with its breadcrumb `path` (ancestor codes). onSelect fires with the chosen
 * leaf so the parent form can auto-fill code / planned qty / uom.
 */

import { SearchSelect, type SearchSelectOption } from "./SearchSelect";

export interface ActivityLeafOption {
  id: string;
  activityCode: string;
  description: string;
  uomId?: string | null;
  /** Readable unit code (e.g. "CUM"), resolved from the UOM master. */
  uomCode?: string | null;
  tenderQty?: number | null;
  /** Optional revised/variation qty — supersedes `tenderQty` as the target. */
  scopeQty?: number | null;
  /** Breadcrumb of ancestor activity codes, e.g. "A / A.1". */
  path?: string;
}

interface Props {
  /** Leaf activities for the current project (from /activities?leaves=true). */
  items: ActivityLeafOption[];
  /** The currently-selected activity id, or null. */
  value: string | null;
  /** Called when the user picks a leaf. Called with null when cleared. */
  onSelect: (row: ActivityLeafOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ActivityScopePicker({
  items,
  value,
  onSelect,
  placeholder = "Select activity",
  disabled,
}: Props) {
  const options: SearchSelectOption[] = items.map((a) => ({
    value: a.id,
    label: a.path
      ? `${a.path} / ${a.activityCode} · ${a.description}`
      : `${a.activityCode} · ${a.description}`,
    sublabel:
      a.tenderQty != null
        ? `Tender: ${a.tenderQty}${a.uomCode ? " " + a.uomCode : ""}`
        : undefined,
    searchText: `${a.activityCode} ${a.description} ${a.path ?? ""}`,
    badge: a.uomCode ?? undefined,
  }));

  return (
    <SearchSelect
      value={value ?? ""}
      onChange={(val) => onSelect(items.find((a) => a.id === val) ?? null)}
      options={options}
      placeholder={placeholder}
      emptyText="No activities match"
      disabled={disabled}
    />
  );
}
