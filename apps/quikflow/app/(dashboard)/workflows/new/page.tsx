"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Play, Plus, LayoutGrid } from "lucide-react";
import { apiSend } from "@/lib/client/fetcher";
import { TRIGGER_CATALOG, ACTION_CATALOG, STEP_KINDS } from "@/lib/catalog";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  kind: string;
  label: string;
  actionId?: string;
  // condition / if_else config
  field?: string;
  operator?: string;
  value?: string;
}

/** Trigger fields the condition can test (event payload for QuikScale events). */
const CONDITION_FIELDS = [
  { id: "trigger.gapPct", label: "Gap % below target" },
  { id: "trigger.value", label: "Entered value" },
  { id: "trigger.target", label: "Weekly target" },
  { id: "trigger.weekNumber", label: "Week number" },
  { id: "trigger.name", label: "KPI name" },
];

const CONDITION_OPERATORS = [
  { id: "gt", label: "greater than (>)" },
  { id: "gte", label: "greater or equal (≥)" },
  { id: "lt", label: "less than (<)" },
  { id: "lte", label: "less or equal (≤)" },
  { id: "eq", label: "equals (=)" },
  { id: "neq", label: "not equals (≠)" },
  { id: "contains", label: "contains" },
  { id: "exists", label: "exists" },
  { id: "absent", label: "is empty" },
];

let stepSeq = 0;
function nextId() {
  stepSeq += 1;
  return `step_${stepSeq}`;
}

/** Build the persisted config for a step by kind. Condition values are coerced
 *  to a number when numeric so comparisons like gapPct > 50 work. */
function nodeConfig(s: Step): Record<string, unknown> {
  if (s.kind === "condition" || s.kind === "if_else") {
    const raw = s.value ?? "";
    const num = Number(raw);
    const value = raw !== "" && !Number.isNaN(num) ? num : raw;
    return { field: s.field, operator: s.operator, value };
  }
  return { actionId: s.actionId };
}

export default function BuilderPage() {
  const router = useRouter();
  const search = useSearchParams();
  const fromTemplate = search.get("template");

  const [showCreate, setShowCreate] = useState(!fromTemplate);
  const [name, setName] = useState("Untitled workflow");
  const [app, setApp] = useState("quikscale");
  const [event, setEvent] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [selected, setSelected] = useState<string | "trigger" | null>("trigger");
  const [addOpen, setAddOpen] = useState(false);
  const [live, setLive] = useState(false);
  const [testResult, setTestResult] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const catalogApp = TRIGGER_CATALOG.find((a) => a.slug === app);
  const triggerLabelText = catalogApp?.events.find((e) => e.id === event)?.label ?? "choose event";

  function addStep(kind: string) {
    const step: Step = { id: nextId(), kind, label: STEP_KINDS.find((s) => s.kind === kind)?.label ?? kind };
    setSteps((s) => [...s, step]);
    setSelected(step.id);
    setAddOpen(false);
  }

  function updateStep(id: string, patch: Partial<Step>) {
    setSteps((s) => s.map((st) => (st.id === id ? { ...st, ...patch } : st)));
  }

  function runTest() {
    const path = [`Trigger · ${app} · ${triggerLabelText}`, ...steps.map((s) => `${s.label}${s.actionId ? ` · ${s.actionId}` : ""}`)];
    setTestResult(path);
  }

  async function save() {
    setSaveError(null);
    if (!event) {
      setSaveError("Pick a trigger event before saving.");
      setSelected("trigger");
      return;
    }
    setSaving(true);
    try {
      const trigger = { type: catalogApp && event.startsWith("time.") ? "cron" : "event", app, event, label: triggerLabelText };
      const graphNodes = [
        { id: "trigger", kind: "trigger", label: triggerLabelText, config: { app, event } },
        ...steps.map((s) => ({ id: s.id, kind: s.kind, label: s.label, config: nodeConfig(s) })),
      ];
      const graphEdges = graphNodes.slice(0, -1).map((n, i) => ({ from: n.id, to: graphNodes[i + 1].id }));

      const { id } = await apiSend<{ id: string }>("/api/workflows", "POST", {
        name,
        app,
        scope: "personal",
        trigger,
        graphNodes,
        graphEdges,
      });
      if (live) {
        await apiSend(`/api/workflows/${id}/toggle`, "PATCH", { on: true });
      }
      router.push("/workflows");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  }

  return (
    <div className="relative mx-auto max-w-5xl">
      {/* Top bar */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/workflows")}
            className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-bg-secondary)]"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-lg font-semibold outline-none focus:ring-2 focus:ring-accent-400"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={runTest}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-bg-secondary)]"
          >
            <Play className="h-4 w-4" />
            Test run
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-bg-secondary)]"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <button
              type="button"
              aria-label="Toggle live"
              onClick={() => setLive((v) => !v)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                live ? "bg-accent-600" : "bg-gray-300",
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
                  live ? "translate-x-5" : "translate-x-0.5",
                )}
              />
            </button>
            Live
          </label>
        </div>
      </div>

      {saveError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {saveError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Canvas */}
        <div className="flex flex-col items-center">
          {/* Trigger node */}
          <button
            type="button"
            onClick={() => setSelected("trigger")}
            className={cn(
              "w-full max-w-md rounded-xl border-2 bg-[var(--color-bg-primary)] p-4 text-left",
              selected === "trigger" ? "border-accent-500" : "border-[var(--color-border)]",
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-600">● When · Trigger</p>
            <p className="mt-1 font-medium">
              {catalogApp?.name ?? "Choose app"} · {triggerLabelText}
            </p>
          </button>

          {/* Steps */}
          {steps.map((s) => (
            <div key={s.id} className="flex w-full max-w-md flex-col items-center">
              <div className="my-2 h-6 w-px bg-[var(--color-border)]" />
              <button
                type="button"
                onClick={() => setSelected(s.id)}
                className={cn(
                  "w-full rounded-xl border-2 bg-[var(--color-bg-primary)] p-4 text-left",
                  selected === s.id ? "border-accent-500" : "border-[var(--color-border)]",
                )}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{s.kind}</p>
                <p className="mt-1 font-medium">
                  {s.label}
                  {s.actionId ? ` · ${ACTION_CATALOG.find((a) => a.id === s.actionId)?.label ?? s.actionId}` : ""}
                </p>
              </button>
            </div>
          ))}

          {/* Add step */}
          <div className="relative mt-2">
            <div className="mx-auto mb-2 h-6 w-px bg-[var(--color-border)]" />
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg border-2 border-dashed border-[var(--color-border)] px-4 py-3 text-sm font-medium text-gray-600 hover:border-accent-400"
            >
              <Plus className="h-4 w-4" />
              Add step
            </button>
            {addOpen ? (
              <div className="absolute left-1/2 z-10 mt-2 w-64 -translate-x-1/2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-2 shadow-lg">
                {STEP_KINDS.map((k) => (
                  <button
                    key={k.kind}
                    type="button"
                    onClick={() => addStep(k.kind)}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-[var(--color-bg-secondary)]"
                  >
                    <span className="mt-1 h-2 w-2 rounded-full bg-accent-500" />
                    <span>
                      <span className="block text-sm font-medium">{k.label}</span>
                      <span className="block text-xs text-gray-500">{k.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {testResult ? (
            <div className="mt-8 w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
              <p className="mb-2 text-sm font-semibold">Test run · path taken (no actions fired)</p>
              <ol className="space-y-1 text-sm text-gray-600">
                {testResult.map((line, i) => (
                  <li key={i}>
                    {i + 1}. {line}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>

        {/* Config panel */}
        <aside className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Configure step</p>
          {selected === "trigger" ? (
            <div className="mt-4 space-y-4">
              <Field label="App">
                <select
                  value={app}
                  onChange={(e) => {
                    setApp(e.target.value);
                    setEvent("");
                  }}
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
              <Field label="Trigger event">
                <select
                  value={event}
                  onChange={(e) => setEvent(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
                >
                  <option value="">Choose an event…</option>
                  {catalogApp?.events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : selected ? (
            (() => {
              const step = steps.find((s) => s.id === selected);
              if (!step) return <p className="mt-4 text-sm text-gray-500">Select a step to configure it.</p>;
              return (
                <div className="mt-4 space-y-4">
                  <Field label="Label">
                    <input
                      value={step.label}
                      onChange={(e) => updateStep(step.id, { label: e.target.value })}
                      className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
                    />
                  </Field>
                  {step.kind === "action" ? (
                    <Field label="Action">
                      <select
                        value={step.actionId ?? ""}
                        onChange={(e) => updateStep(step.id, { actionId: e.target.value })}
                        className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
                      >
                        <option value="">Choose an action…</option>
                        {ACTION_CATALOG.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : step.kind === "condition" || step.kind === "if_else" ? (
                    <>
                      <Field label="Field">
                        <select
                          value={step.field ?? ""}
                          onChange={(e) => updateStep(step.id, { field: e.target.value })}
                          className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
                        >
                          <option value="">Choose a field…</option>
                          {CONDITION_FIELDS.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Operator">
                        <select
                          value={step.operator ?? ""}
                          onChange={(e) => updateStep(step.id, { operator: e.target.value })}
                          className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
                        >
                          <option value="">Choose an operator…</option>
                          {CONDITION_OPERATORS.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {step.operator !== "exists" && step.operator !== "absent" ? (
                        <Field label="Value">
                          <input
                            value={step.value ?? ""}
                            onChange={(e) => updateStep(step.id, { value: e.target.value })}
                            placeholder="e.g. 50"
                            className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
                          />
                        </Field>
                      ) : null}
                      <p className="text-xs text-gray-500">
                        {step.kind === "condition"
                          ? "The run continues only if this is true; otherwise it stops."
                          : "Chooses the true/false branch."}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-500">
                      Detailed configuration for {step.kind} steps arrives with the execution
                      engine phase.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSteps((s) => s.filter((st) => st.id !== step.id));
                      setSelected("trigger");
                    }}
                    className="text-sm font-medium text-red-600 hover:underline"
                  >
                    Remove step
                  </button>
                </div>
              );
            })()
          ) : (
            <p className="mt-4 text-sm text-gray-500">Select a step to configure it.</p>
          )}
        </aside>
      </div>

      {/* Create modal */}
      {showCreate ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--color-bg-primary)] p-6">
            <h2 className="text-xl font-bold">Create a workflow</h2>
            <p className="mt-1 text-sm text-gray-500">How would you like to start?</p>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-[var(--color-border)] p-6 text-center hover:border-accent-400"
              >
                <Plus className="mx-auto mb-2 h-8 w-8 text-accent-600" />
                <p className="font-semibold">From scratch</p>
                <p className="text-xs text-gray-500">Build step by step</p>
              </button>
              <button
                type="button"
                onClick={() => router.push("/templates")}
                className="rounded-xl border border-[var(--color-border)] p-6 text-center hover:border-accent-400"
              >
                <LayoutGrid className="mx-auto mb-2 h-8 w-8 text-accent-600" />
                <p className="font-semibold">From a template</p>
                <p className="text-xs text-gray-500">Start with an example</p>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
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
