"use client";

import { useEffect, useState } from "react";
import {
  Field,
  Input,
  RightPanel,
  RightPanelCancelButton,
  RightPanelFooter,
  RightPanelSubmitButton,
  Select,
  Textarea,
} from "@quikit/ui";
import {
  AUTOMATION_OPTIONS,
  PRIORITY_OPTIONS,
  TYPE_OPTIONS,
  caseRef,
} from "./case-meta";
import { CoverageLinks } from "./coverage-links";
import { StepsEditor, type StepDraft } from "./steps-editor";

/**
 * Create / edit a test case.
 *
 * Editing sends a PATCH, which ALWAYS produces a new version server-side — the
 * previous definition stays pinned to any run that already executed it. The
 * panel makes that explicit rather than letting it look like an in-place edit.
 */

interface CaseDetail {
  id: string;
  refId: number;
  title: string;
  description: string | null;
  preconditions: string | null;
  priority: string;
  type: string;
  automationStatus: string;
  automationId: string | null;
  currentVersion: number;
  steps: Array<{ action: string; expected: string | null }>;
}

interface CaseEditorPanelProps {
  open: boolean;
  onClose: () => void;
  /** null = create mode. */
  caseId: string | null;
  sectionId: string | null;
  projectId: string;
  onSaved: () => void;
}

const EMPTY = {
  title: "",
  description: "",
  preconditions: "",
  priority: "MEDIUM",
  type: "FUNCTIONAL",
  automationStatus: "MANUAL",
  automationId: "",
};

export function CaseEditorPanel({
  open,
  onClose,
  caseId,
  sectionId,
  projectId,
  onSaved,
}: CaseEditorPanelProps) {
  const isEdit = caseId !== null;

  const [form, setForm] = useState({ ...EMPTY });
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [refId, setRefId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load on open. Create mode resets to a blank form so a previously-edited
  // case can't leak its values into a new one.
  useEffect(() => {
    if (!open) return;
    setError(null);

    if (!isEdit) {
      setForm({ ...EMPTY });
      setSteps([]);
      setVersion(null);
      setRefId(null);
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
        setForm({
          title: d.title,
          description: d.description ?? "",
          preconditions: d.preconditions ?? "",
          priority: d.priority,
          type: d.type,
          automationStatus: d.automationStatus,
          automationId: d.automationId ?? "",
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
  }, [open, caseId, isEdit]);

  const save = async () => {
    if (!form.title.trim()) {
      setError("A title is required.");
      return;
    }
    if (!isEdit && !sectionId) {
      setError("Choose a folder for this case first.");
      return;
    }

    setSaving(true);
    setError(null);

    // Drop blank rows so an accidentally-added empty step doesn't fail
    // validation (action has a min length server-side).
    const cleanSteps = steps
      .filter((s) => s.action.trim().length > 0)
      .map((s) => ({
        action: s.action.trim(),
        expected: s.expected.trim() || undefined,
      }));

    const payload = {
      ...(isEdit ? {} : { projectId, sectionId }),
      title: form.title.trim(),
      description: form.description.trim() || (isEdit ? null : undefined),
      preconditions: form.preconditions.trim() || (isEdit ? null : undefined),
      priority: form.priority,
      type: form.type,
      automationStatus: form.automationStatus,
      // Empty string clears the id on edit; on create it must be omitted so the
      // partial unique index doesn't see an empty-string collision.
      automationId: form.automationId.trim() || (isEdit ? null : undefined),
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
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Could not save this case.");
    } finally {
      setSaving(false);
    }
  };

  const subtitle = isEdit
    ? `${refId !== null ? caseRef(refId) : ""}${
        version !== null ? ` · saving creates version ${version + 1}` : ""
      }`
    : "New test case";

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit test case" : "New test case"}
      subtitle={subtitle}
      size="lg"
      footer={
        <RightPanelFooter>
          <RightPanelCancelButton onClick={onClose} />
          <RightPanelSubmitButton
            onClick={save}
            disabled={saving || loading}
            label={saving ? "Saving…" : isEdit ? "Save new version" : "Create case"}
          />
        </RightPanelFooter>
      }
    >
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <Field label="Title" required>
            <Input
              value={form.title}
              placeholder="Login with valid credentials redirects to dashboard"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Priority">
              <Select
                options={PRIORITY_OPTIONS}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              />
            </Field>
            <Field label="Type">
              <Select
                options={TYPE_OPTIONS}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              />
            </Field>
            <Field label="Automation">
              <Select
                options={AUTOMATION_OPTIONS}
                value={form.automationStatus}
                onChange={(e) =>
                  setForm({ ...form, automationStatus: e.target.value })
                }
              />
            </Field>
          </div>

          <Field
            label="Automation ID"
            hint="How CI maps its test to this case, e.g. login.spec.ts::valid_creds. Must be unique in this project."
          >
            <Input
              value={form.automationId}
              placeholder="login.spec.ts::valid_creds"
              onChange={(e) => setForm({ ...form, automationId: e.target.value })}
            />
          </Field>

          <Field label="Preconditions">
            <Textarea
              rows={2}
              value={form.preconditions}
              placeholder="A registered user exists with a verified email address."
              onChange={(e) =>
                setForm({ ...form, preconditions: e.target.value })
              }
            />
          </Field>

          <Field label="Description">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Steps</p>
            <StepsEditor steps={steps} onChange={setSteps} disabled={saving} />
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Coverage</p>
            <p className="mb-2 text-xs text-gray-500">
              Work items this case verifies. Linking one makes this case&apos;s
              results appear on that item&apos;s QuikTest panel.
            </p>
            <CoverageLinks
              caseId={caseId}
              projectId={projectId}
              disabled={saving}
            />
          </div>
        </div>
      )}
    </RightPanel>
  );
}
