/**
 * Pure permission/editability model for the OPSP Create page.
 *
 * Splits the OPSP into two editable layers, each with its own gate:
 *   - STRATEGIC plan (People/Process/Targets/Goals/Actions/…) → needs
 *     `OPSP.Create:create` (admins bypass). Locked by the org-wide finalize.
 *   - OWN per-user sections (Accountability / Quarterly Priorities / Critical #
 *     / Balanced Critical #) → any viewer may edit their own; editing ANOTHER
 *     user's needs `OPSP.EditUser:update`. Both respect the finalize lock.
 *
 * Kept free of React/DB so the matrix is unit-tested in isolation and the page
 * stays a thin consumer (single source of truth for the gates + banner flags).
 */

export interface OpspEditabilityInput {
  /** Holds the system admin role. */
  isAdmin: boolean;
  /** `OPSP.Create:create` (or admin) — authors the full strategic plan. */
  canCreate: boolean;
  /** `OPSP.History.EditFinalize:update` — edit a finalized (not reviewed) OPSP. */
  canEditFinalized: boolean;
  /** `OPSP.EditUser:update` — edit another user's per-user sections. */
  canEditUser: boolean;
  /** Org OPSP status: "draft" | "finalized" | "reviewed". */
  status: string;
  /** True when the section user-picker points at someone other than self. */
  viewingOtherUser: boolean;
}

export interface OpspEditability {
  statusLocked: boolean;
  reviewSubmitted: boolean;
  /** Org-wide finalize lock (reviewed = hard lock; finalized = unlocked by EditFinalize). */
  lockedByStatus: boolean;
  /** STRATEGIC plan is read-only. */
  isLocked: boolean;
  /** The 4 per-user sections are read-only. */
  sectionsReadOnly: boolean;
  /** Banner: non-admin holds Edit-after-Finalize but not Create (req 4). */
  needsCreateForEditFinalize: boolean;
  /** Banner: non-admin without Create can edit ONLY their own 4 sections (pre-finalize). */
  sectionsOnlyNotice: boolean;
}

export function computeOpspEditability(i: OpspEditabilityInput): OpspEditability {
  const statusLocked = i.status === "finalized" || i.status === "reviewed";
  const reviewSubmitted = i.status === "reviewed";
  // Reviewed is a hard lock for everyone; merely-finalized is unlocked by
  // the Edit-after-Finalize permission.
  const lockedByStatus = reviewSubmitted || (statusLocked && !i.canEditFinalized);

  const isLocked = !i.canCreate || lockedByStatus;
  const sectionsReadOnly =
    lockedByStatus || (i.viewingOtherUser ? !i.canEditUser : false);

  const needsCreateForEditFinalize = !i.isAdmin && i.canEditFinalized && !i.canCreate;
  const sectionsOnlyNotice = !i.isAdmin && !i.canCreate && !lockedByStatus;

  return {
    statusLocked,
    reviewSubmitted,
    lockedByStatus,
    isLocked,
    sectionsReadOnly,
    needsCreateForEditFinalize,
    sectionsOnlyNotice,
  };
}
