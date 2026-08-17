"use client";

import { Field, Input } from "@quikit/ui";
import { SelectMenu } from "@/components/test/select-menu";
import {
  AUTOMATION_CANDIDATE_OPTIONS,
  AUTOMATION_OPTIONS,
  AUTOMATION_TOOL_OPTIONS,
  PRIORITY_DOT,
  PRIORITY_OPTIONS,
  TYPE_OPTIONS,
} from "./case-meta";
import { ReferencePicker } from "./reference-picker";
import type { TemplateKind } from "@/lib/test/caseLayout";

/**
 * The case header/metadata group from the spec's Fig. 1 (QUIKTR-333).
 *
 * Split out of `case-editor-panel.tsx` to keep that file under the 300-line
 * ceiling in apps/quiktrack/CLAUDE.md — the editor is the file most at risk of
 * becoming another 114 KB `edit-issue-modal.tsx`.
 *
 * All dropdowns are `SelectMenu`, not native `<select>`: the OS widget can't be
 * styled to match the app and can't show colour swatches or per-option hints.
 */

export interface TemplateOption {
  id: string;
  name: string;
  kind: TemplateKind;
}

export interface MetaValues {
  templateId: string;
  priority: string;
  type: string;
  automationStatus: string;
  automationId: string;
  automationTool: string;
  automationCandidate: string;
  estimate: string;
  refTickets: string;
}

/** What each template changes about the form, shown under the option. */
const KIND_HINT: Record<TemplateKind, string> = {
  STEPS: "Numbered steps, each with its own expected result",
  TEXT: "One expected result for the whole case",
  BDD: "Given / When / Then prose",
  EXPLORATORY: "A charter to explore — no formal expectations",
};

export function CaseMetaFields({
  values,
  onChange,
  templates,
  estimateError,
  projectId,
  disabled,
}: {
  values: MetaValues;
  onChange: (patch: Partial<MetaValues>) => void;
  templates: TemplateOption[];
  estimateError?: string;
  projectId: string;
  disabled?: boolean;
}) {
  const isAutomated = values.automationStatus === "AUTOMATED";

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Template"
          hint="Decides whether the case is written as one Expected Result or as per-step expectations."
        >
          <SelectMenu
            value={values.templateId}
            options={templates.map((t) => ({
              value: t.id,
              label: t.name,
              hint: KIND_HINT[t.kind],
            }))}
            placeholder={templates.length ? "Choose a template" : "No templates"}
            disabled={disabled}
            ariaLabel="Template"
            onChange={(v) => onChange({ templateId: v })}
          />
        </Field>
        <Field
          label="Estimate"
          hint="How long one execution takes, e.g. 30m or 1h30m. Rolls up into run forecasts."
          error={estimateError}
        >
          <Input
            value={values.estimate}
            placeholder="30m"
            disabled={disabled}
            onChange={(e) => onChange({ estimate: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Priority">
          <SelectMenu
            value={values.priority}
            options={PRIORITY_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
              color: PRIORITY_DOT[o.value],
            }))}
            disabled={disabled}
            ariaLabel="Priority"
            onChange={(v) => onChange({ priority: v })}
          />
        </Field>
        <Field label="Type">
          <SelectMenu
            value={values.type}
            options={TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            disabled={disabled}
            ariaLabel="Type"
            onChange={(v) => onChange({ type: v })}
          />
        </Field>
        <Field label="Automation">
          <SelectMenu
            value={values.automationStatus}
            options={AUTOMATION_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            disabled={disabled}
            ariaLabel="Automation"
            onChange={(v) => onChange({ automationStatus: v })}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Automation ID"
          hint="How CI matches its test to this case, e.g. login.spec.ts::valid_creds. Unique per project."
        >
          <Input
            value={values.automationId}
            placeholder="login.spec.ts::valid_creds"
            disabled={disabled}
            className="font-mono text-xs"
            onChange={(e) => onChange({ automationId: e.target.value })}
          />
        </Field>
        {/* Tooling only matters once a case IS automated; asking otherwise adds a
            field nobody can answer. Candidate is the mirror question for manual
            cases, so the two swap places. */}
        {isAutomated ? (
          <Field label="Automation Type" hint="The harness that runs it.">
            <SelectMenu
              value={values.automationTool}
              options={AUTOMATION_TOOL_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              placeholder="Choose a tool"
              disabled={disabled}
              ariaLabel="Automation type"
              onChange={(v) => onChange({ automationTool: v })}
            />
          </Field>
        ) : (
          <Field label="Automation Candidate" hint="Worth automating later?">
            <SelectMenu
              value={values.automationCandidate}
              options={AUTOMATION_CANDIDATE_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              placeholder="Not assessed"
              disabled={disabled}
              ariaLabel="Automation candidate"
              onChange={(v) => onChange({ automationCandidate: v })}
            />
          </Field>
        )}
      </div>

      <Field
        label="References"
        hint="Work items this case mentions. Search by key or title. For results to appear on a work item, use Coverage below."
      >
        <ReferencePicker
          value={values.refTickets}
          onChange={(v) => onChange({ refTickets: v })}
          projectId={projectId}
          disabled={disabled}
        />
      </Field>
    </>
  );
}
