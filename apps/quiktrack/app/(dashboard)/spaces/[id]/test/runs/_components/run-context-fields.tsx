"use client";

import { Field, Input } from "@quikit/ui";
import { FormSection } from "../../_components/form-section";
import { ReferencePicker } from "../../_components/reference-picker";

/**
 * Build / environment / planned window / references for a new run.
 *
 * Split from `new-run-panel.tsx`, which passed the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md once the owner picker landed. All optional — a CI or
 * ad-hoc run has none of it.
 */
export function RunContextFields({
  build,
  onBuild,
  environment,
  onEnvironment,
  startDate,
  onStartDate,
  endDate,
  onEndDate,
  dateError,
  refTickets,
  onRefTickets,
  projectId,
  disabled,
}: {
  build: string;
  onBuild: (v: string) => void;
  environment: string;
  onEnvironment: (v: string) => void;
  startDate: string;
  onStartDate: (v: string) => void;
  endDate: string;
  onEndDate: (v: string) => void;
  dateError?: string;
  refTickets: string;
  onRefTickets: (v: string) => void;
  projectId: string;
  disabled?: boolean;
}) {
  return (
    <FormSection title="Context">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Build" hint="Optional. Ties the run to a release build.">
          <Input
            value={build}
            placeholder="1.4.0"
            disabled={disabled}
            onChange={(e) => onBuild(e.target.value)}
          />
        </Field>
        <Field label="Environment">
          <Input
            value={environment}
            placeholder="staging"
            disabled={disabled}
            onChange={(e) => onEnvironment(e.target.value)}
          />
        </Field>
      </div>

      {/* QUIKTR-320 — the planned execution window. Both optional: an ad-hoc or
          CI run has no planned dates. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date">
          <Input
            type="date"
            value={startDate}
            // A native date input can't express "before the end date", so the max
            // is set from the other field — the schema and a DB CHECK both back
            // it up.
            max={endDate || undefined}
            disabled={disabled}
            onChange={(e) => onStartDate(e.target.value)}
          />
        </Field>
        <Field label="End date" error={dateError}>
          <Input
            type="date"
            value={endDate}
            min={startDate || undefined}
            disabled={disabled}
            onChange={(e) => onEndDate(e.target.value)}
          />
        </Field>
      </div>

      <Field
        label="References"
        hint="Work items this run relates to. Search by key or title."
      >
        <ReferencePicker
          value={refTickets}
          onChange={onRefTickets}
          projectId={projectId}
          disabled={disabled}
        />
      </Field>
    </FormSection>
  );
}
