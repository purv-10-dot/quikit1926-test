/**
 * OPSP pre-finalize validation.
 *
 * Two checks:
 *  1. Projection vs breakdown — only enforced for Manual rows. The matrix:
 *       - Automatic + any         → skip (calculateBreakdown owns the row)
 *       - any       + Standalone  → skip (StandaloneSelect dropdown enforces values;
 *                                          breakdownProjected auto-fills regardless
 *                                          of breakdownType for Standalone)
 *       - Manual    + Cumulative  → Σ cells === Projected
 *       - Manual    + CumulativeTillEnd → last cell === Projected
 *  2. Owner missing — for Key Thrusts, Key Initiatives, and Rocks: any row with a
 *     description but no owner is flagged.
 *
 * Empty rows (no projected and no breakdown values) are skipped — they aren't
 * "wrong", just unfilled.
 */
import type { FormData } from "../hooks/useOPSPForm";
import { resolveProjected, breakdownProjected, actionsQtrErrors } from "../components/modals";
import { catMetaCache } from "../components/category";
import type { TargetRow, GoalRow, ActionRow } from "../types";

export interface ValidationError {
  /** "Targets" | "Goals" | "Actions" | "Key Thrusts" | "Key Initiatives" | "Rocks" */
  section: string;
  /** 1-indexed row number for the section's table */
  row: number;
  message: string;
}

const partKeys = {
  targets: ["y1", "y2", "y3", "y4", "y5"] as const,
  goals: ["q1", "q2", "q3", "q4"] as const,
  actions: ["m1", "m2", "m3"] as const,
};

const fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/**
 * True when a category-row section row is incomplete in the one way that must
 * never be saved: a category is selected but the Projected value is blank.
 * (A fully-empty row — no category and no value — is fine; clearing a whole row
 * is allowed.) Shared by `checkBreakdown` (pre-finalize validation) and the
 * edit-after-finalize commit gate so they apply the same rule.
 */
export function categoryRowMissingProjected(row: { category?: string | null; projected?: string | null }): boolean {
  const cat = (row.category ?? "").trim();
  const projected = (row.projected ?? "").trim();
  return cat !== "" && projected === "";
}

function checkBreakdown(
  section: string,
  rows: Array<Record<string, string>>,
  parts: readonly string[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  rows.forEach((row, i) => {
    const cat = (row.category ?? "").trim();
    const projectedStr = (row.projected ?? "").trim();
    const projected = resolveProjected(cat, projectedStr);

    const partVals = parts.map((k) => resolveProjected(cat, String(row[k] ?? "")) ?? 0);
    const anyPart = parts.some((k) => String(row[k] ?? "").trim() !== "");
    const allParts = parts.every((k) => String(row[k] ?? "").trim() !== "");

    // Skip fully empty rows.
    if (!projectedStr && !anyPart && !cat) return;

    // Category picked but Projected left blank — block finalize with a clear,
    // actionable message. Without this check the row was silently skipped at
    // page-level finalize even though the in-modal validator flagged it,
    // letting users finalize partial Actions/Goals/Targets data.
    if (categoryRowMissingProjected(row)) {
      errors.push({
        section,
        row: i + 1,
        message: `${section} row ${i + 1} (${cat}): Projected value is required — enter a value or remove this row.`,
      });
      return;
    }

    // Projected entered but no category — the row is incomplete; skip
    // silently (the projected value has no category to validate against and
    // there's no UI affordance to fix this without picking a category).
    if (!cat) return;

    const meta = catMetaCache.get(cat);
    // Default to Automatic + Cumulative when meta is missing — same fallback
    // as the modals. Auto rows are calculator-owned, so no validation fires.
    const breakdownType = meta?.breakdownType ?? "Automatic";
    const categoryType = meta?.categoryType ?? "Cumulative";

    if (breakdownType === "Automatic") return;
    if (categoryType === "Standalone") return; // dropdown enforces cell values

    // ── Manual + Cumulative — sum check ──
    if (categoryType === "Cumulative") {
      if (projected !== null && projected > 0 && !allParts) {
        errors.push({
          section,
          row: i + 1,
          message: `${section} row ${i + 1}${cat ? ` (${cat})` : ""}: missing breakdown values for ${parts.join("/")}.`,
        });
        return;
      }
      if (projected !== null && allParts) {
        const sum = partVals.reduce((a, b) => a + b, 0);
        if (Math.abs(projected - sum) >= 0.01) {
          errors.push({
            section,
            row: i + 1,
            message: `${section} row ${i + 1}${cat ? ` (${cat})` : ""}: ${parts.map((p) => p.toUpperCase()).join("+")} add up to ${fmt.format(sum)}, but Projected is ${fmt.format(projected)} — short by ${fmt.format(projected - sum)}.`,
          });
        }
      }
      return;
    }

    // ── Manual + CumulativeTillEnd — last cell check ──
    if (categoryType === "CumulativeTillEnd") {
      if (projected !== null && projected > 0 && !allParts) {
        errors.push({
          section,
          row: i + 1,
          message: `${section} row ${i + 1}${cat ? ` (${cat})` : ""}: missing breakdown values for ${parts.join("/")}.`,
        });
        return;
      }
      if (projected !== null && allParts) {
        const last = partVals[partVals.length - 1] ?? 0;
        if (Math.abs(projected - last) >= 0.01) {
          const lastKey = parts[parts.length - 1].toUpperCase();
          errors.push({
            section,
            row: i + 1,
            message: `${section} row ${i + 1}${cat ? ` (${cat})` : ""}: the final period (${lastKey} = ${fmt.format(last)}) should match Projected (${fmt.format(projected)}).`,
          });
        }
      }
    }
  });
  return errors;
}

/**
 * Rocks (Quarterly Priorities) are mandatory: an OPSP can't be finalized with
 * zero filled rocks. Emits a single section-level error when no row has a
 * description. Per-row owner enforcement is handled separately by `checkOwners`,
 * so a filled-but-ownerless rock still blocks finalize via that rule (no
 * double-flagging here).
 */
function checkRocksPresent(
  rows: Array<{ desc: string; owner: string }>,
): ValidationError[] {
  const anyFilled = rows.some((r) => r.desc.trim() !== "");
  return anyFilled
    ? []
    : [{
        section: "Rocks",
        row: 1,
        message: "Rocks are mandatory — add at least one Quarterly Priority and assign an owner before finalizing.",
      }];
}

function checkOwners(
  section: string,
  rows: Array<{ desc: string; owner: string }>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  rows.forEach((r, i) => {
    if (r.desc.trim() && !r.owner) {
      errors.push({
        section,
        row: i + 1,
        message: `Row ${i + 1}: description filled but owner missing`,
      });
    }
  });
  return errors;
}

/**
 * Pre-finalize pass: for any row that has a Category + Projected but empty
 * period cells (y/q/m), auto-fill the period cells via `breakdownProjected`
 * with `force: true`. The matrix-modal UI that used to let users hand-enter
 * Manual rows was removed, so without this pass any Manual+Cumulative or
 * Manual+CumulativeTillEnd row would permanently fail validation.
 *
 * Rows that already have ANY period cell filled are left alone (the user
 * has opted into a custom distribution and we shouldn't clobber it).
 */
export function backfillPeriods(form: FormData): FormData {
  const yrs = Math.max(3, Math.min(5, form.targetYears ?? 5));
  const targetParts = partKeys.targets.slice(0, yrs);

  const fillRow = <R extends Record<string, string>>(
    row: R,
    parts: readonly string[],
    periods: number,
  ): R => {
    const cat = (row.category ?? "").trim();
    const proj = (row.projected ?? "").trim();
    if (!cat || !proj) return row;
    const anyFilled = parts.some((k) => String(row[k] ?? "").trim() !== "");
    if (anyFilled) return row;
    const slices = breakdownProjected(cat, proj, periods, { force: true });
    if (!slices) return row;
    const patch: Record<string, string> = {};
    parts.forEach((k, idx) => {
      patch[k] = slices[idx] ?? "";
    });
    return { ...row, ...patch };
  };

  return {
    ...form,
    targetRows: form.targetRows.map((r) =>
      fillRow(r as unknown as Record<string, string>, targetParts, yrs),
    ) as unknown as TargetRow[],
    goalRows: form.goalRows.map((r) =>
      fillRow(r as unknown as Record<string, string>, partKeys.goals, 4),
    ) as unknown as GoalRow[],
    actionsQtr: form.actionsQtr.map((r) =>
      fillRow(r as unknown as Record<string, string>, partKeys.actions, 3),
    ) as unknown as ActionRow[],
  };
}

export function validateOPSP(form: FormData): ValidationError[] {
  // Honor the user-selected target horizon (3–5 yrs) — only validate those columns.
  const yrs = Math.max(3, Math.min(5, form.targetYears ?? 5));
  const targetParts = partKeys.targets.slice(0, yrs);
  return [
    ...checkBreakdown("Targets", form.targetRows as unknown as Array<Record<string, string>>, targetParts),
    ...checkBreakdown("Goals", form.goalRows as unknown as Array<Record<string, string>>, partKeys.goals),
    // Actions (QTR) uses the SAME validator the ACTIONS modal does (categoryType-
    // based, catches lastBelowProjected / monotonic / cell-over / exceeds-goal),
    // so Finalize blocks with the modal's exact message whenever Submit would be
    // disabled — closing the modal can't sneak invalid Actions past Finalize.
    ...actionsQtrErrors(form.actionsQtr, form.goalRows).map((e) => {
      const cat = (form.actionsQtr[e.rowIndex]?.category ?? "").trim();
      return {
        section: "Actions",
        row: e.rowIndex + 1,
        message: `Actions row ${e.rowIndex + 1}${cat ? ` (${cat})` : ""}: ${e.message}`,
      };
    }),
    // Key Thrusts + Key Initiatives no longer require an owner — the column
    // was removed from the UI per spec, so checking them would block Finalize
    // for data that has no UI to fill the field.
    ...checkRocksPresent(form.rocks),
    ...checkOwners("Rocks", form.rocks),
  ];
}
