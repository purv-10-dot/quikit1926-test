/**
 * Fields the GRID may edit.
 *
 * Deliberately excludes the case BODY (steps, preconditions, expectations): those go
 * through the full editor so the change is snapshotted as a new version. The inline
 * path does not version, so letting body fields in would silently break the guarantee
 * historical runs depend on. The API schema is `.strict()` for the same reason.
 */
export interface InlinePatch {
  title?: string;
  priority?: string;
  type?: string;
  automationStatus?: string;
  approvalState?: string;
}
