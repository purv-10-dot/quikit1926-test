/**
 * OPSP PDF redaction.
 *
 * The OPSP preview's "Download PDF" lets the user EXCLUDE the four per-user
 * sections (Your Accountability / Quarterly Priorities / Critical # / Balanced
 * Critical #) from the exported document. This returns a copy of the form with
 * exactly those four fields emptied; every other (org-shared / strategic) field
 * is left untouched, so the rest of the PDF renders identically.
 *
 * Pure (no React/PDF) so it's unit-tested in isolation.
 */

import type { FormData } from "../hooks/useOPSPForm";

/** An empty Critical # card — title + four blank tier bullets. */
const emptyCritCard = (): FormData["criticalNumAcct"] => ({
  title: "",
  bullets: ["", "", "", ""],
});

export function redactOpspPerUserSections(form: FormData): FormData {
  return {
    ...form,
    kpiAccountability: [],
    quarterlyPriorities: [],
    criticalNumAcct: emptyCritCard(),
    balancingCritNumAcct: emptyCritCard(),
  };
}
