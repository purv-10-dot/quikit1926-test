/**
 * Pure helpers for the BOQ Import drawer.
 *
 * Extracted verbatim from BOQImportDrawer.tsx as part of the god-file
 * decomposition. No React, no side effects.
 */

import { NO_IMPORT_PERMISSION_MSG } from "./constants";

export function boqUploadError(
  res: Response,
  json: { error?: string; message?: string } | null | undefined,
  fallback: string,
): string {
  if (res.status === 403) return NO_IMPORT_PERMISSION_MSG;
  return json?.error ?? json?.message ?? fallback;
}
