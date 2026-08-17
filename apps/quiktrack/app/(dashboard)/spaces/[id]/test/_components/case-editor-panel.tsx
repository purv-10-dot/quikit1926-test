"use client";

import { Field, Input, RightPanel, Textarea } from "@quikit/ui";
import { PanelFooter } from "@/components/test/panel-footer";
import { caseRef } from "./case-meta";
import { ApprovalControl } from "./approval-control";
import { CaseBodyFields } from "./case-body-fields";
import { CaseMetaFields } from "./case-meta-fields";
import { CoverageLinks } from "./coverage-links";
import { LabelPicker } from "./label-picker";
import { FormSection } from "./form-section";
import { useCaseForm } from "./use-case-form";

/**
 * Create / edit a test case (QUIKTR-333).
 *
 * Editing sends a PATCH, which ALWAYS produces a new version server-side — the
 * previous definition stays pinned to any run that already executed it, so the
 * submit button says "Save new version" rather than pretending to edit in place.
 *
 * The body layout follows the chosen TEMPLATE (see case-body-fields.tsx). Both
 * the text-style and step-style expectations are stored on every case, so
 * switching template changes the form, never the content.
 *
 * Form state lives in `use-case-form.ts`; this file is layout. Fields are grouped
 * into labelled sections rather than one flat column — the flat version made a
 * 14-field form read as an undifferentiated list.
 */

interface CaseEditorPanelProps {
  open: boolean;
  onClose: () => void;
  /** null = create mode. */
  caseId: string | null;
  sectionId: string | null;
  projectId: string;
  onSaved: () => void;
}

export function CaseEditorPanel({
  open,
  onClose,
  caseId,
  sectionId,
  projectId,
  onSaved,
}: CaseEditorPanelProps) {
  const f = useCaseForm({ open, caseId, sectionId, projectId });

  const submit = async () => {
    if (await f.save()) {
      onSaved();
      onClose();
    }
  };

  const subtitle = f.isEdit
    ? `${f.refId !== null ? caseRef(f.refId) : ""}${
        f.version !== null ? ` · saving creates version ${f.version + 1}` : ""
      }`
    : "New test case";

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      title={f.isEdit ? "Edit test case" : "New test case"}
      subtitle={subtitle}
      size="lg"
      footer={
        <PanelFooter>
          {/* Primary action FIRST (left): the panel's bottom-right corner is
              covered by the floating chat bubble. */}
          <button
            type="button"
            onClick={submit}
            disabled={f.saving || f.loading}
            className="rounded-lg bg-accent-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
          >
            {f.saving ? "Saving…" : f.isEdit ? "Save new version" : "Create case"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={f.saving}
            className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </PanelFooter>
      }
    >
      {f.loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          {f.error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {f.error}
            </p>
          )}

          <Field label="Title" required>
            <Input
              value={f.title}
              placeholder="Login with valid credentials redirects to dashboard"
              disabled={f.saving}
              onChange={(e) => f.setTitle(e.target.value)}
            />
          </Field>

          <FormSection title="Details">
            <CaseMetaFields
              values={f.meta}
              onChange={f.patchMeta}
              templates={f.templateList}
              estimateError={f.estimateError}
              projectId={projectId}
              disabled={f.saving}
            />
          </FormSection>

          <FormSection title="What to test">
            <Field label="Description">
              <Textarea
                rows={3}
                value={f.description}
                disabled={f.saving}
                onChange={(e) => f.setDescription(e.target.value)}
              />
            </Field>

            <CaseBodyFields
              kind={f.kind}
              preconditions={f.preconditions}
              onPreconditions={f.setPreconditions}
              expectedResult={f.expectedResult}
              onExpectedResult={f.setExpectedResult}
              steps={f.steps}
              onSteps={f.setSteps}
              disabled={f.saving}
            />
          </FormSection>

          <FormSection
            title="Approval"
            hint="Only approved cases are pulled into new test runs by default."
          >
            <ApprovalControl
              caseId={caseId}
              onChanged={onSaved}
              disabled={f.saving}
            />
          </FormSection>

          <FormSection
            title="Labels"
            hint="Free-form tags for filtering and reporting. Saved immediately, not with the case."
          >
            <LabelPicker
              caseId={caseId}
              projectId={projectId}
              disabled={f.saving}
              onChanged={onSaved}
            />
          </FormSection>

          <FormSection
            title="Coverage"
            hint="Work items this case verifies. Linking one makes this case's results appear on that item. Saved immediately."
          >
            <CoverageLinks
              caseId={caseId}
              projectId={projectId}
              disabled={f.saving}
            />
          </FormSection>
        </div>
      )}
    </RightPanel>
  );
}
