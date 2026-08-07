/**
 * FR-RE Slice 0 — the agent RUNTIME payload.
 *
 * getFormRuntime returns everything the agent client needs to render the live
 * disposition form AND evaluate its rules: the full structure (tabs -> sections,
 * fields -> options) plus the rules in the pure EvalRule shape (reusing
 * loadEvalRules, so the client hands them straight to evaluateFormRules — same
 * engine, client preview + server apply).
 *
 * SECURITY: this endpoint is agent-facing and has NO settings gate, so the
 * tenant scope IS its security. getFormRuntime requires the caller's tenantId
 * and rejects (404) a version that does not belong to it — no cross-tenant read.
 */
import { prisma } from "@/lib/db/prisma";
import { getFormStructure, FormStructureError } from "@/lib/services/forms/form-structure.service";
import { loadEvalRules } from "@/lib/services/forms/form-rule-apply.service";
import { getLiveDispositionVersionId } from "@/lib/services/forms/disposition-save.service";
import type { EvalRule } from "@/lib/services/forms/form-rule-evaluator";

type RuntimeStructure = Awaited<ReturnType<typeof getFormStructure>>;

/** All of a version's fields (flat, with options + placement) — what the agent renders. */
async function getVersionFields(versionId: string) {
  return prisma.qcfFormField.findMany({
    where: { formSetVersionId: versionId },
    orderBy: { sortOrder: "asc" },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
}

export interface FormRuntime {
  versionId: string;
  /** Layout: tabs + sections (fields are also nested here when placed). */
  tabs: RuntimeStructure;
  /** ALL fields, flat, with options — including unplaced ones (the render set). */
  fields: Awaited<ReturnType<typeof getVersionFields>>;
  rules: EvalRule[];
}

/** The live form payload for a version, scoped to the caller's tenant. */
export async function getFormRuntime(versionId: string, tenantId: string): Promise<FormRuntime> {
  const version = await prisma.qcfFormSetVersion.findUnique({
    where: { id: versionId },
    select: { id: true, formSet: { select: { tenantId: true } } },
  });
  // Not found OR belongs to another tenant -> 404 (don't reveal existence).
  if (!version || version.formSet.tenantId !== tenantId) {
    throw new FormStructureError("Form version not found", 404);
  }

  const [tabs, fields, rules] = await Promise.all([
    getFormStructure(versionId),
    getVersionFields(versionId),
    loadEvalRules(versionId),
  ]);

  return { versionId, tabs, fields, rules };
}

/**
 * Agent-facing resolver: the tenant's LIVE (published, default) call_disposition
 * runtime, or null when no form is live. Lets the agent client fetch the form to
 * render + evaluate without knowing the versionId (and without admin access).
 */
export async function getCurrentDispositionRuntime(tenantId: string): Promise<FormRuntime | null> {
  const versionId = await getLiveDispositionVersionId(tenantId);
  if (!versionId) return null;
  return getFormRuntime(versionId, tenantId);
}
