"use client";

import {
  TRIGGER_CATALOG,
  findEvent,
  conditionFieldsForEvent,
  operatorsForType,
  operatorArity,
  fieldType,
  DURATION_UNITS,
  actionsByCategory,
} from "@/lib/catalog";
import type { Step } from "@/lib/builder/types";
import { cn } from "@/lib/utils";

/**
 * Right-hand "Configure step" panel for the builder. Renders the trigger editor
 * (app → module → event) when the trigger node is selected, or a step editor
 * (label + action / condition config) for a selected step. Pure presentation —
 * all state lives in the builder page; this only reads props and calls back.
 */
export function ConfigPanel({
  selected,
  app,
  module,
  event,
  onAppChange,
  onModuleChange,
  onEventChange,
  step,
  onUpdateStep,
  onRemoveStep,
  className,
  hideHeading = false,
}: {
  selected: string | "trigger" | null;
  app: string;
  module: string;
  event: string;
  onAppChange: (v: string) => void;
  onModuleChange: (v: string) => void;
  onEventChange: (v: string) => void;
  step: Step | undefined;
  onUpdateStep: (patch: Partial<Step>) => void;
  onRemoveStep: () => void;
  className?: string;
  hideHeading?: boolean;
}) {
  const modules = (() => {
    const a = TRIGGER_CATALOG.find((x) => x.slug === app);
    if (!a) return [] as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const ev of a.events) if (!seen.has(ev.module)) (seen.add(ev.module), out.push(ev.module));
    return out;
  })();
  const moduleEvents = module
    ? TRIGGER_CATALOG.find((x) => x.slug === app)?.events.filter((e) => e.module === module) ?? []
    : [];
  const selectedEvent = findEvent(app, event);

  return (
    <aside className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4", className)}>
      {hideHeading ? null : (
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Configure step</p>
      )}

      {selected === "trigger" ? (
        <div className="mt-4 space-y-4">
          <Field label="App">
            <select
              value={app}
              onChange={(e) => onAppChange(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              {TRIGGER_CATALOG.map((a) => (
                <option key={a.slug} value={a.slug} disabled={a.comingSoon}>
                  {a.name}
                  {a.comingSoon ? " (coming soon)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Module">
            <select
              value={module}
              onChange={(e) => onModuleChange(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              <option value="">Choose a module…</option>
              {modules.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Trigger event">
            <select
              value={event}
              onChange={(e) => onEventChange(e.target.value)}
              disabled={!module}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="">{module ? "Choose an event…" : "Pick a module first"}</option>
              {moduleEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.label}
                  {ev.live ? "" : " · planned"}
                </option>
              ))}
            </select>
          </Field>
          {selectedEvent && !selectedEvent.live ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Planned event — authorable now, but QuikScale doesn&apos;t emit it yet, so this workflow
              won&apos;t fire until an emitter is added.
            </p>
          ) : null}
          {selectedEvent ? (
            <p className="text-xs text-gray-500">Fires when: {selectedEvent.firesWhen}.</p>
          ) : null}
        </div>
      ) : selected && step ? (
        <div className="mt-4 space-y-4">
          <Field label="Label">
            <input
              value={step.label}
              onChange={(e) => onUpdateStep({ label: e.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            />
          </Field>
          {step.kind === "action" ? (
            <Field label="Action">
              <select
                value={step.actionId ?? ""}
                onChange={(e) => onUpdateStep({ actionId: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              >
                <option value="">Choose an action…</option>
                {actionsByCategory().map((g) => (
                  <optgroup key={g.category} label={g.category}>
                    {g.actions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                        {a.real ? "" : " · simulated"}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
          ) : step.kind === "condition" || step.kind === "if_else" ? (
            <ConditionConfig app={app} event={event} step={step} onChange={onUpdateStep} />
          ) : (
            <p className="text-xs text-gray-500">
              Detailed configuration for {step.kind} steps arrives with the execution engine phase.
            </p>
          )}
          <button
            type="button"
            onClick={onRemoveStep}
            className="text-sm font-medium text-red-600 hover:underline"
          >
            Remove step
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-500">Select a step to configure it.</p>
      )}
    </aside>
  );
}

/** Type-aware condition editor: field → operator (filtered by the field's data
 *  type) → value input(s) sized to the operator's arity. */
function ConditionConfig({
  app,
  event,
  step,
  onChange,
}: {
  app: string;
  event: string;
  step: Step;
  onChange: (patch: Partial<Step>) => void;
}) {
  const fields = conditionFieldsForEvent(app, event);
  const type = step.field ? fieldType(step.field) : "string";
  const operators = operatorsForType(type);
  const arity = operatorArity(step.operator);

  return (
    <>
      <Field label="Field">
        <select
          value={step.field ?? ""}
          onChange={(e) => onChange({ field: e.target.value, operator: "", value: "", value2: "", unit: "" })}
          className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
        >
          <option value="">{event ? "Choose a field…" : "Pick a trigger event first"}</option>
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Operator">
        <select
          value={step.operator ?? ""}
          onChange={(e) => onChange({ operator: e.target.value })}
          disabled={!step.field}
          className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="">Choose an operator…</option>
          {operators.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      {arity === "one" ? (
        <Field label="Value">
          <input
            value={step.value ?? ""}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder={type === "date" ? "e.g. 2026-08-01" : "e.g. 50"}
            className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
          />
        </Field>
      ) : arity === "range" ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="From">
            <input
              value={step.value ?? ""}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder="min"
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="To">
            <input
              value={step.value2 ?? ""}
              onChange={(e) => onChange({ value2: e.target.value })}
              placeholder="max"
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            />
          </Field>
        </div>
      ) : arity === "duration" ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Amount">
            <input
              value={step.value ?? ""}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder="e.g. 7"
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Unit">
            <select
              value={step.unit ?? "days"}
              onChange={(e) => onChange({ unit: e.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              {DURATION_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}
      <p className="text-xs text-gray-500">
        {step.kind === "condition"
          ? "The run continues only if this is true; otherwise it stops."
          : "Chooses the true/false branch."}
      </p>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}
