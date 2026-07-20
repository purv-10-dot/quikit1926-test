"use client";

/**
 * Labour RA Bill hooks.
 *
 * Preview is a dry-run of the deterministic labour-billing engine (no writes).
 * To GENERATE, feed `preview.lines` into the existing RAB create endpoint
 * (POST /api/projects/rab) with { projectId, woId, lines, retentionPercent } —
 * that reuses the shared header/deduction/approval + billing-ledger posting.
 */

import { useMutation } from "@tanstack/react-query";
import { mutateJson } from "@/lib/react-query/fetch-json";
import type { LabourRabPreview } from "@/lib/rab/labour-rab-service";

export function useLabourRabPreview() {
  return useMutation({
    mutationFn: (input: {
      projectId: string;
      workOrderId: string;
      billUpto: string;
      retentionPercent?: number;
    }) =>
      mutateJson<{ data: LabourRabPreview }>("/api/projects/rab/labour/preview", "POST", input),
  });
}

/** Shape preview lines for the existing RAB create endpoint. */
export function toRabCreateLines(preview: LabourRabPreview) {
  return preview.lines.map((l) => ({
    boqItemId: l.boqItemId,
    currentQty: l.thisBillQty,
    uomId: l.uomId,
    description: l.description,
  }));
}
