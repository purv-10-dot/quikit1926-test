"use client";

import { useEffect, useMemo, useState } from "react";
import { useApiData } from "@/lib/hooks/useApiData";
import { PREFERRED_NEW_CASE_KIND } from "@/lib/test/caseLayout";
import { formatEstimate, parseEstimate } from "@/lib/test/estimate";
import type { TemplateKind } from "./case-body-fields";
import type { MetaValues, TemplateOption } from "./case-meta-fields";
import type { StepDraft } from "./steps-editor";

/**
 * Load/save state for the case editor.
 *
 * Extracted from `case-editor-panel.tsx` to keep it under the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md. That file is the one most at risk of becoming
 * another 114 KB `edit-issue-modal.tsx`, so form plumbing lives here and the
 * panel stays layout.
 */

interface CaseDetail {
  id: string;
  refId: number;
  title: string;
  description: string | null;
  preconditions: string | null;
  expectedResult: string | null;
  priority: string;
  type: string;
  automationStatus: string;
  automationId: string | null;
  automationTool: string | null;
  automationCandidate: string | null;
  refTickets: string | null;
  estimateMs: number | null;
  templateId: string | null;
  currentVersion: number;
  steps: Array<{ action: string; expected: string | null }>;
}

const EMPTY_META: MetaValues = {
  templateId: "",
  priority: "MEDIUM",
  type: "FUNCTIONAL",
  automationStatus: "MANUAL",
  automationId: "",
  automationTool: "",
  automationCandidate: "",
  estimate: "",
  refTickets: "",
};

export function useCaseForm({
  open,
  caseId,
  sectionId,
  projectId,
}: {
  open: boolean;
  caseId: string | null;
  sectionId: string | null;
  projectId: string;
}) {
  const isEdit = caseId !== null;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [preconditions, setPreconditions] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [meta, setMeta] = useState<MetaValues>({ ...EMPTY_META });
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [refId, setRefId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: templates } = useApiData<TemplateOption[]>(
    ["quiktrack", "test-templates"],
    open ? "/api/test/templates" : null,
    { staleTime: 5 * 60_000 },
  );
  const templateList = useMemo(() => templates ?? [], [templates]);

  /**
   * Body layout to render.
   *
   * On CREATE the fallback matches what the form will pre-select, so the body does
   * not render the step grid for a moment and then snap to the text field once the
   * template list arrives. On EDIT it stays STEPS, which is what a case with no
   * template was authored as (the migration backfilled those to STEPS).
   */
  const kind: TemplateKind =
    templateList.find((t) => t.id === meta.templateId)?.kind ??
    (isEdit ? "STEPS" : PREFERRED_NEW_CASE_KIND);

  const estimateError =
    meta.estimate.trim() && parseEstimate(meta.estimate) === null
      ? "Use a duration like 30m or 1h30m."
      : undefined;

  // Create mode resets everything, so a previously-edited case cannot leak its
  // values into a new one.
  useEffect(() => {
    if (!open) return;
    setError(null);

    if (!isEdit) {
      setTitle("");
      setDescription("");
      setPreconditions("");
      setExpectedResult("");
      setSteps([]);
      setVersion(null);
      setRefId(null);
      // A new case opens on "Test Case (Text)" — a UI preference, so no database
      // change is involved (every provisioned org still has STEPS flagged as its
      // `isDefault`, and that is left alone).
      //
      // Three-step fallback so the form never opens with nothing selected: the
      // preferred kind, then whatever the ORG marks default, then the first template.
      const dflt =
        templateList.find((t) => t.kind === PREFERRED_NEW_CASE_KIND) ??
        templateList.find((t) => t.isDefault) ??
        templateList[0] ??
        null;
      setMeta({ ...EMPTY_META, templateId: dflt?.id ?? "" });
      return;
    }

    let alive = true;
    setLoading(true);
    fetch(`/api/test/cases/${caseId}`)
      .then((r) => r.json())
      .then((json: { success: boolean; data?: CaseDetail; error?: string }) => {
        if (!alive) return;
        if (!json.success || !json.data) {
          setError(json.error ?? "Could not load this case.");
          return;
        }
        const d = json.data;
        setTitle(d.title);
        setDescription(d.description ?? "");
        setPreconditions(d.preconditions ?? "");
        setExpectedResult(d.expectedResult ?? "");
        setMeta({
          templateId: d.templateId ?? "",
          priority: d.priority,
          type: d.type,
          automationStatus: d.automationStatus,
          automationId: d.automationId ?? "",
          automationTool: d.automationTool ?? "",
          automationCandidate: d.automationCandidate ?? "",
          estimate: formatEstimate(d.estimateMs),
          refTickets: d.refTickets ?? "",
        });
        setSteps(
          d.steps.map((s) => ({ action: s.action, expected: s.expected ?? "" })),
        );
        setVersion(d.currentVersion);
        setRefId(d.refId);
      })
      .catch(() => {
        if (alive) setError("Could not load this case.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [open, caseId, isEdit, templateList]);

  /** Returns true on success. */
  const save = async (): Promise<boolean> => {
    if (!title.trim()) {
      setError("A title is required.");
      return false;
    }
    if (!isEdit && !sectionId) {
      setError("Choose a folder for this case first.");
      return false;
    }
    if (estimateError) {
      setError(estimateError);
      return false;
    }

    setSaving(true);
    setError(null);

    // Drop blank rows so an accidentally-added empty step doesn't fail the
    // server's min-length validation.
    const cleanSteps = steps
      .filter((s) => s.action.trim().length > 0)
      .map((s) => ({
        action: s.action.trim(),
        expected: s.expected.trim() || undefined,
      }));

    // On edit, "" clears a field (null); on create it must be OMITTED so the
    // partial unique index never sees an empty-string automationId.
    const clearable = (v: string) => v.trim() || (isEdit ? null : undefined);

    const payload = {
      ...(isEdit ? {} : { projectId, sectionId }),
      title: title.trim(),
      description: clearable(description),
      preconditions: clearable(preconditions),
      expectedResult: clearable(expectedResult),
      priority: meta.priority,
      type: meta.type,
      automationStatus: meta.automationStatus,
      automationId: clearable(meta.automationId),
      automationTool: clearable(meta.automationTool),
      automationCandidate: clearable(meta.automationCandidate),
      refTickets: clearable(meta.refTickets),
      estimateMs: parseEstimate(meta.estimate) ?? (isEdit ? null : undefined),
      templateId: meta.templateId || (isEdit ? null : undefined),
      steps: cleanSteps,
    };

    try {
      const res = await fetch(
        isEdit ? `/api/test/cases/${caseId}` : "/api/test/cases",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setError(json.error ?? "Could not save this case.");
        return false;
      }
      return true;
    } catch {
      setError("Could not save this case.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    isEdit,
    title, setTitle,
    description, setDescription,
    preconditions, setPreconditions,
    expectedResult, setExpectedResult,
    meta,
    patchMeta: (patch: Partial<MetaValues>) => setMeta((m) => ({ ...m, ...patch })),
    steps, setSteps,
    templateList,
    kind,
    estimateError,
    version, refId,
    loading, saving, error, setError,
    save,
  };
}
