/**
 * Shared types for the DPR form.
 *
 * Extracted verbatim from DPRForm.tsx as part of the god-file decomposition.
 * Pure type declarations — no runtime code, so importing from here is free.
 */

export interface WorkItem {
  boqItemId: string;
  /** FREE_SCOPE anchor — set instead of a BOQ leaf when the project is Free-Scope. */
  scopeType?: string;
  scopeId?: string;
  boqNo: string;
  description: string;
  unit: string;
  /** Total scope from BOQ (tender qty). */
  totalTarget: number;
  /** Cumulative qty done before today. */
  prevQty: number;
  balanceQty: number;
  /** "" = Self Work, otherwise a Work Order id. */
  contractorWO: string;
  todayQty: string;
  location: string;
  remarks: string;
  /** Site photos for this activity. New photos are base64 data URLs; photos
   *  already saved to S3 arrive as signed view URLs. */
  images: string[];
  /** Parallel to `images`: the stored S3 key for each existing photo, or ""
   *  for a newly-added (not-yet-uploaded) base64 photo. */
  imageKeys: string[];
}

export interface MaterialRow {
  itemId: string;
  // Denormalized from the item master at pick time (onSelect) or edit-load,
  // so the lazy picker + UOM cell render without loading the whole master.
  itemName?: string;
  uomId?: string;
  uomCode?: string;
  consumedQty: string;
  remarks: string;
}

export interface ManpowerRow {
  contractorId: string;
  /** Free-text location within the site this crew worked. */
  workingArea: string;
  /** Per-trade head/effort counts (man-days/man-hours) entered as a wide grid. */
  messan: string;
  maleHelper: string;
  femaleHelper: string;
  carpenter: string;
  fitter: string;
  painter: string;
  plumber: string;
  electrician: string;
  operator: string;
}

export interface StaffRow {
  name: string;
  designation: string;
  present: boolean;
  reason: string;
}

export interface MachineryRow {
  description: string;
  condition: "Running" | "Idle" | "Breakdown" | "Under Repair";
  requiredQty: string;
  actualQty: string;
  remarks: string;
}

// ── Raw shapes of an existing DPR record (edit mode hydration source) ──
export interface DprEditWorkItem {
  boqItemId?: string;
  scopeType?: string;
  scopeId?: string;
  boqNo?: string;
  description?: string;
  unit?: string;
  totalTarget?: number | string;
  prevQty?: number | string;
  todayQty?: number | string;
  workOrderId?: string;
  location?: string;
  remarks?: string;
  images?: string[];
  imageKeys?: string[];
}
export interface DprEditMaterial {
  itemId?: string;
  consumedQty?: number | string;
  remarks?: string;
}
export interface DprEditManpower {
  contractorId?: string;
  workingArea?: string;
  messan?: number | string;
  maleHelper?: number | string;
  femaleHelper?: number | string;
  carpenter?: number | string;
  fitter?: number | string;
  painter?: number | string;
  plumber?: number | string;
  electrician?: number | string;
  operator?: number | string;
}
export interface DprEditStaff {
  name?: string;
  designation?: string;
  present?: boolean;
  reason?: string;
}
export interface DprEditMachinery {
  description?: string;
  condition?: string;
  requiredQty?: number | string;
  actualQty?: number | string;
  remarks?: string;
}
export interface DPRRecord {
  id?: string;
  projectId?: string;
  projectName?: string;
  consumptionLocationId?: string;
  reportDate?: string;
  weatherCondition?: string;
  weatherDetail?: unknown;
  workHalted?: boolean;
  siteRemarks?: string;
  dprNumber?: string;
  workItems?: DprEditWorkItem[];
  materials?: DprEditMaterial[];
  manpower?: DprEditManpower[];
  staff?: DprEditStaff[];
  machinery?: DprEditMachinery[];
}

/** BOQ activity row passed back from the picker modal. */
export interface BoqPickerRow {
  id: string;
  boq_no: string;
  display_name: string;
  unit?: string | null;
  scopeQty?: number | string;
  balanceQty?: number | string;
}

/**
 * Shared DPR form — used by both the "New DPR" and "Edit DPR" pages.
 * When `editData` is passed, the form hydrates from the existing record
 * and handleSave switches to PUT /api/projects/dpr/:id.
 */
export interface DPRFormProps {
  /** When present, switches to edit mode and pre-fills every field. */
  editData?: DPRRecord;
  /** When true, hides the sticky page header strip (date picker / project /
   *  Save / Submit) so the form can render cleanly inside a side drawer
   *  that supplies its own header / footer chrome. After a successful
   *  save, `onSaved` fires instead of the default `router.push` so the
   *  drawer host can close itself and refresh the list. */
  embedded?: boolean;
  /** Called after a successful create / update when `embedded` is true. */
  onSaved?: () => void;
}
