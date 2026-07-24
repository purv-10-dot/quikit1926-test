"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TRIGGER_CATALOG, findEvent, conditionFieldsForEvent, actionsByCategory } from "@/lib/catalog";
import type { Step, RuleGroupValue, ScheduleValue } from "@/lib/builder/types";
import { cn } from "@/lib/utils";
import { RuleGroupEditor } from "./rule-group-editor";
import { ActionParams } from "./action-params";

/**
 * Right-hand "Configure step" panel for the builder. Renders the trigger editor
 * (app → module → event + an optional "Only when…" data filter) when the trigger
 * node is selected, or a step editor (action params / condition rule group) for
 * a selected step. Pure presentation — all state lives in the builder page.
 */
export function ConfigPanel({
  selected,
  app,
  module,
  event,
  onAppChange,
  onModuleChange,
  onEventChange,
  triggerFilter,
  onTriggerFilterChange,
  schedule,
  onScheduleChange,
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
  triggerFilter: RuleGroupValue;
  onTriggerFilterChange: (patch: { combine?: "and" | "or"; rules?: RuleGroupValue["rules"] }) => void;
  schedule: ScheduleValue;
  onScheduleChange: (patch: Partial<ScheduleValue>) => void;
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
  const fields = conditionFieldsForEvent(app, event);

  return (
    <aside className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4", className)}>
      {hideHeading ? null : (
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Configure step</p>
      )}

      {selected === "trigger" ? (
        <div className="mt-4 space-y-4">
          <Field label="App">
            <select value={app} onChange={(e) => onAppChange(e.target.value)} className={SELECT_CLS}>
              {TRIGGER_CATALOG.map((a) => (
                <option key={a.slug} value={a.slug} disabled={a.comingSoon}>
                  {a.name}
                  {a.comingSoon ? " (coming soon)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Module">
            <select value={module} onChange={(e) => onModuleChange(e.target.value)} className={SELECT_CLS}>
              <option value="">Choose a module…</option>
              {modules.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Trigger event">
            <select value={event} onChange={(e) => onEventChange(e.target.value)} disabled={!module} className={cn(SELECT_CLS, "disabled:opacity-50")}>
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
          {selectedEvent ? <p className="text-xs text-gray-500">Fires when: {selectedEvent.firesWhen}.</p> : null}

          {event === "schedule.tick" ? (
            <div className="space-y-3 rounded-lg border border-[var(--color-border)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Schedule</p>
              <Field label="Repeat">
                <select
                  value={schedule.recurrence}
                  onChange={(e) => onScheduleChange({ recurrence: e.target.value as ScheduleValue["recurrence"] })}
                  className={SELECT_CLS}
                >
                  <option value="every_day">Every day</option>
                  <option value="every_weekday">Every weekday</option>
                  <option value="every_week">Every week</option>
                  <option value="every_month">Every month</option>
                  <option value="every_quarter">Every quarter</option>
                  <option value="every_year">Every year</option>
                </select>
              </Field>
              {schedule.recurrence === "every_week" ? (
                <Field label="Day of week">
                  <select value={schedule.dayOfWeek ?? "mon"} onChange={(e) => onScheduleChange({ dayOfWeek: e.target.value })} className={SELECT_CLS}>
                    {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => (
                      <option key={d} value={d}>
                        {d[0].toUpperCase() + d.slice(1)}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              {schedule.recurrence === "every_month" ? (
                <Field label="Day of month (1–28)">
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={schedule.dayOfMonth ?? 1}
                    onChange={(e) => onScheduleChange({ dayOfMonth: Number(e.target.value) })}
                    className={SELECT_CLS}
                  />
                </Field>
              ) : null}
              <Field label="Time">
                <input type="time" value={schedule.time} onChange={(e) => onScheduleChange({ time: e.target.value })} className={SELECT_CLS} />
              </Field>
              <p className="text-xs text-gray-500">Runs on QuikFlow&apos;s scheduler (UTC).</p>
            </div>
          ) : null}

          {event ? (
            <Collapsible title="Only when… (optional filter)" defaultOpen={triggerFilter.rules.length > 0}>
              <RuleGroupEditor
                fields={fields}
                combine={triggerFilter.combine}
                rules={triggerFilter.rules}
                onChange={onTriggerFilterChange}
                addLabel="Add filter"
                emptyHint="No filter — the trigger fires for every matching record. Add one to narrow it (e.g. team is Sales)."
              />
            </Collapsible>
          ) : null}
        </div>
      ) : selected && step ? (
        <div className="mt-4 space-y-4">
          <Field label="Label">
            <input value={step.label} onChange={(e) => onUpdateStep({ label: e.target.value })} className={SELECT_CLS} />
          </Field>
          {step.kind === "action" ? (
            <>
              <Field label="Action">
                <select value={step.actionId ?? ""} onChange={(e) => onUpdateStep({ actionId: e.target.value, params: {} })} className={SELECT_CLS}>
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
              {step.actionId ? (
                <ActionParams
                  actionId={step.actionId}
                  tokenFields={fields}
                  params={step.params ?? {}}
                  onChange={(params) => onUpdateStep({ params })}
                />
              ) : null}
            </>
          ) : step.kind === "condition" || step.kind === "if_else" ? (
            <>
              <RuleGroupEditor
                fields={fields}
                combine={step.combine ?? "and"}
                rules={step.rules ?? []}
                onChange={onUpdateStep}
                emptyHint={event ? "Add at least one condition." : "Pick a trigger event first."}
              />
              <p className="text-xs text-gray-500">
                {step.kind === "condition"
                  ? "The run continues only if the group is true; otherwise it stops."
                  : "Chooses the true/false branch."}
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-500">
              Detailed configuration for {step.kind} steps arrives with the execution engine phase.
            </p>
          )}
          <button type="button" onClick={onRemoveStep} className="text-sm font-medium text-red-600 hover:underline">
            Remove step
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-500">Select a step to configure it.</p>
      )}
    </aside>
  );
}

const SELECT_CLS = "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-[var(--color-border)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
      >
        {title}
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open ? <div className="border-t border-[var(--color-border)] p-3">{children}</div> : null}
    </div>
  );
}
