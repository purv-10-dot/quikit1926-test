"use client";

import {
  Field,
  Input,
  RightPanel,
  RightPanelCancelButton,
  RightPanelFooter,
  RightPanelSubmitButton,
  Textarea,
} from "@quikit/ui";
import { caseRef } from "./case-meta";
import { ApprovalControl } from "./approval-control";
import { CaseBodyFields } from "./case-body-fields";
import { CaseMetaFields } from "./case-meta-fields";
import { CoverageLinks } from "./coverage-links";
import { LabelPicker } from "./label-picker";
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
 * Form state lives in `use-case-form.ts`; this file is layout.
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
        <RightPanelFooter>
          <RightPanelCancelButton onClick={onClose} />
          <RightPanelSubmitButton
            onClick={submit}
            disabled={f.saving || f.loading}
            label={
              f.saving ? "Saving…" : f.isEdit ? "Save new version" : "Create case"
            }
          />
        </RightPanelFooter>
      }
    >
      {f.loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          {f.error && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {f.error}
            </p>
          )}

          <Field label="Title" required>
            <Input
              value={f.title}
              placeholder="Login with valid credentials redirects to dashboard"
              onChange={(e) => f.setTitle(e.target.value)}
            />
          </Field>

          <CaseMetaFields
            values={f.meta}
            onChange={f.patchMeta}
            templates={f.templateList}
            estimateError={f.estimateError}
          />

          <Field label="Description">
            <Textarea
              rows={3}
              value={f.description}
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

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Labels</p>
            <p className="mb-2 text-xs text-gray-500">
              Free-form tags for filtering and reporting, e.g. smoke, checkout,
              flaky. Saved immediately, not with the case.
            </p>
            <LabelPicker
              caseId={caseId}
              projectId={projectId}
              disabled={f.saving}
              onChanged={onSaved}
            />
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Approval</p>
            <p className="mb-2 text-xs text-gray-500">
              Only approved cases are pulled into new test runs by default.
            </p>
            <ApprovalControl
              caseId={caseId}
              onChanged={onSaved}
              disabled={f.saving}
            />
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
              disabled={f.saving}
            />
          </div>
        </div>
      )}
    </RightPanel>
  );
}
