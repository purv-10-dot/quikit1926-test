"use client";

import { Field, Input, Select } from "@quikit/ui";
import {
  AUTOMATION_CANDIDATE_OPTIONS,
  AUTOMATION_OPTIONS,
  AUTOMATION_TOOL_OPTIONS,
  PRIORITY_OPTIONS,
  TYPE_OPTIONS,
} from "./case-meta";
import type { TemplateKind } from "./case-body-fields";

/**
 * The case header/metadata group from the spec's Fig. 1 (QUIKTR-333).
 *
 * Split out of `case-editor-panel.tsx` to keep that file under the 300-line
 * ceiling in apps/quiktrack/CLAUDE.md — the editor is the file most at risk of
 * becoming another 114 KB `edit-issue-modal.tsx`.
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

export function CaseMetaFields({
  values,
  onChange,
  templates,
  estimateError,
}: {
  values: MetaValues;
  onChange: (patch: Partial<MetaValues>) => void;
  templates: TemplateOption[];
  estimateError?: string;
}) {
  const isAutomated = values.automationStatus === "AUTOMATED";

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Template"
          hint="Decides whether the case is written as one Expected Result or as per-step expectations."
        >
          <Select
            options={templates.map((t) => ({ value: t.id, label: t.name }))}
            value={values.templateId}
            placeholder={templates.length ? "Choose a template" : "No templates"}
            onChange={(e) => onChange({ templateId: e.target.value })}
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
            onChange={(e) => onChange({ estimate: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Priority">
          <Select
            options={PRIORITY_OPTIONS}
            value={values.priority}
            onChange={(e) => onChange({ priority: e.target.value })}
          />
        </Field>
        <Field label="Type">
          <Select
            options={TYPE_OPTIONS}
            value={values.type}
            onChange={(e) => onChange({ type: e.target.value })}
          />
        </Field>
        <Field label="Automation">
          <Select
            options={AUTOMATION_OPTIONS}
            value={values.automationStatus}
            onChange={(e) => onChange({ automationStatus: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Automation ID"
          hint="How CI matches its test to this case, e.g. login.spec.ts::valid_creds. Unique per project."
        >
          <Input
            value={values.automationId}
            placeholder="login.spec.ts::valid_creds"
            onChange={(e) => onChange({ automationId: e.target.value })}
          />
        </Field>
        {/* Tooling only matters once a case IS automated; asking otherwise adds a
            field nobody can answer. Candidate is the mirror question for manual
            cases, so the two swap places. */}
        {isAutomated ? (
          <Field label="Automation Type" hint="The harness that runs it.">
            <Select
              options={AUTOMATION_TOOL_OPTIONS}
              value={values.automationTool}
              placeholder="Choose a tool"
              onChange={(e) => onChange({ automationTool: e.target.value })}
            />
          </Field>
        ) : (
          <Field
            label="Automation Candidate"
            hint="Worth automating later?"
          >
            <Select
              options={AUTOMATION_CANDIDATE_OPTIONS}
              value={values.automationCandidate}
              placeholder="Not assessed"
              onChange={(e) => onChange({ automationCandidate: e.target.value })}
            />
          </Field>
        )}
      </div>

      <Field
        label="References"
        hint="Ticket ids in another tracker, e.g. JIRA-3, JIRA-4. For linking work items in QuikTrack, use Coverage below."
      >
        <Input
          value={values.refTickets}
          placeholder="JIRA-3, JIRA-4"
          onChange={(e) => onChange({ refTickets: e.target.value })}
        />
      </Field>
    </>
  );
}
