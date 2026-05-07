/**
 * BOQ format detector.
 *
 * Given a workbook (array of raw sheets), classify each sheet as STRICT,
 * GENERIC, or UNKNOWN, then roll up to a workbook-level verdict:
 *
 *   - all STRICT (or STRICT + ignored)  → workbook = STRICT
 *   - all GENERIC (or GENERIC + ignored) → workbook = GENERIC
 *   - mixed STRICT + GENERIC             → workbook = STRICT (warn caller)
 *   - none recognised                    → UNKNOWN (caller picks default)
 *
 * Detection is structural (header sniffing) — it never relies on sheet
 * names. The category-map module handles sheet name → category and is
 * orthogonal to mode detection.
 */

import type { DetectionResult, DetectedSheet, RawSheet, ImportMode } from "./types";
import { looksLikeStrictTemplate } from "./strict-adapter";
import { looksLikeGenericSor } from "./generic-adapter";
import { shouldIgnoreSheet } from "./category-map";

export function detectImportMode(sheets: RawSheet[]): DetectionResult {
  const perSheet: DetectedSheet[] = [];
  let strictCount = 0;
  let genericCount = 0;

  for (const s of sheets) {
    if (shouldIgnoreSheet(s.sheetName)) {
      perSheet.push({
        sheetName: s.sheetName,
        detectedMode: "UNKNOWN",
        confidence: 0,
        reason: "ignored: instructions / cover / reference tab",
      });
      continue;
    }

    const strict = looksLikeStrictTemplate(s);
    const generic = looksLikeGenericSor(s);

    if (strict.ok && !generic.ok) {
      strictCount++;
      perSheet.push({
        sheetName: s.sheetName,
        detectedMode: "STRICT_TEMPLATE",
        confidence: 0.95,
        reason: strict.reason,
        headerRowIndex: strict.headerRowIndex,
      });
      continue;
    }
    if (generic.ok && !strict.ok) {
      genericCount++;
      perSheet.push({
        sheetName: s.sheetName,
        detectedMode: "GENERIC_SOR",
        confidence: 0.95,
        reason: generic.reason,
        headerRowIndex: generic.headerRowIndex,
      });
      continue;
    }
    if (strict.ok && generic.ok) {
      // Both matched — break the tie by checking which signal is stronger.
      // Generic signal (S.No. + a column F unit header) is more specific.
      genericCount++;
      perSheet.push({
        sheetName: s.sheetName,
        detectedMode: "GENERIC_SOR",
        confidence: 0.7,
        reason: `both formats match — preferring generic (${generic.reason})`,
        headerRowIndex: generic.headerRowIndex,
      });
      continue;
    }

    perSheet.push({
      sheetName: s.sheetName,
      detectedMode: "UNKNOWN",
      confidence: 0,
      reason: `neither format detected (strict: ${strict.reason}; generic: ${generic.reason})`,
    });
  }

  let workbookMode: ImportMode | "UNKNOWN" = "UNKNOWN";
  if (strictCount > 0 && genericCount === 0) workbookMode = "STRICT_TEMPLATE";
  else if (genericCount > 0 && strictCount === 0) workbookMode = "GENERIC_SOR";
  else if (strictCount > 0 && genericCount > 0) workbookMode = "GENERIC_SOR"; // mixed — generic is more permissive

  return { workbookMode, perSheet };
}
