"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Play, Plus, LayoutGrid, X } from "lucide-react";
import { apiSend } from "@/lib/client/fetcher";
import { STEP_KINDS, findApp, findEvent, findAction, operatorArity } from "@/lib/catalog";
import { NodeCard } from "@/components/builder/node-card";
import { Connector } from "@/components/builder/connector";
import { StepPicker } from "@/components/builder/step-picker";
import { ConfigPanel } from "@/components/builder/config-panel";
import type { Step } from "@/lib/builder/types";
import { cn } from "@/lib/utils";

let stepSeq = 0;
function nextId() {
  stepSeq += 1;
  return `step_${stepSeq}`;
}

/** Coerce a raw string to a number when it looks numeric (so gapPct > 50 works). */
function coerce(raw: string | undefined): string | number {
  const s = raw ?? "";
  const num = Number(s);
  return s !== "" && !Number.isNaN(num) ? num : s;
}

/** Build the persisted config for a step by kind. */
function nodeConfig(s: Step): Record<string, unknown> {
  if (s.kind === "condition" || s.kind === "if_else") {
    const arity = operatorArity(s.operator);
    const cfg: Record<string, unknown> = { field: s.field, operator: s.operator };
    if (arity === "one") cfg.value = coerce(s.value);
    else if (arity === "range") {
      cfg.value = coerce(s.value);
      cfg.value2 = coerce(s.value2);
    } else if (arity === "duration") {
      cfg.value = coerce(s.value);
      cfg.unit = s.unit || "days";
    }
    return cfg;
  }
  return { actionId: s.actionId };
}

/** Subtle dot-grid backdrop for the canvas (n8n-like). */
const GRID_BG: React.CSSProperties = {
  backgroundImage: "radial-gradient(var(--color-border) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

export default function BuilderPage() {
  const router = useRouter();
  const search = useSearchParams();
  const fromTemplate = search.get("template");

  const [showCreate, setShowCreate] = useState(!fromTemplate);
  const [name, setName] = useState("Untitled workflow");
  const [app, setApp] = useState("quikscale");
  const [module, setModule] = useState("");
  const [event, setEvent] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [selected, setSelected] = useState<string | "trigger" | null>("trigger");
  const [configOpen, setConfigOpen] = useState(false);
  const [live, setLive] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const catalogApp = findApp(app);
  const selectedEvent = findEvent(app, event);
  const triggerLabelText = selectedEvent?.label ?? "choose event";
  const triggerSubtitle = `${catalogApp?.name ?? "Choose app"}${module ? ` · ${module}` : ""}`;

  function openConfig(id: string | "trigger") {
    setSelected(id);
    setConfigOpen(true);
  }

  function addStep(kind: string) {
    const step: Step = { id: nextId(), kind, label: STEP_KINDS.find((s) => s.kind === kind)?.label ?? kind };
    setSteps((s) => [...s, step]);
    openConfig(step.id);
  }

  function updateStep(id: string, patch: Partial<Step>) {
    setSteps((s) => s.map((st) => (st.id === id ? { ...st, ...patch } : st)));
  }

  function runTest() {
    const path = [
      triggerLabelText,
      ...steps.map((s) => `${s.label}${s.actionId ? ` (${findAction(s.actionId)?.label ?? s.actionId})` : ""}`),
    ];
    setTestMsg(`Traced ${path.length} step${path.length === 1 ? "" : "s"} · ${path.join("  →  ")}`);
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
      const trigger = {
        type: event.startsWith("time.") ? "cron" : "event",
        app,
        module,
        event,
        label: triggerLabelText,
      };
      const graphNodes = [
        { id: "trigger", kind: "trigger", label: triggerLabelText, config: { app, module, event } },
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

  const selectedStep = selected && selected !== "trigger" ? steps.find((s) => s.id === selected) : undefined;

  return (
    <div className="relative">
      {/* Top bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
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

      {testMsg ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          <span>{testMsg}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setTestMsg(null)}
            className="shrink-0 rounded p-0.5 text-green-600 hover:bg-green-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* Full-bleed dotted canvas (horizontal flow). Click a node to configure it. */}
      <div
        className="flex min-h-[calc(100vh-13rem)] items-center overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]"
        style={GRID_BG}
      >
        <div className="flex min-w-max items-center gap-1 px-10 py-16">
          <div className="w-64 shrink-0">
            <NodeCard
              kind="trigger"
              title={triggerLabelText}
              subtitle={triggerSubtitle}
              selected={selected === "trigger"}
              onClick={() => openConfig("trigger")}
            />
          </div>

          {steps.map((s) => (
            <div key={s.id} className="flex items-center gap-1">
              <Connector />
              <div className="w-64 shrink-0">
                <NodeCard
                  kind={s.kind}
                  title={s.label}
                  subtitle={s.actionId ? findAction(s.actionId)?.label ?? s.actionId : undefined}
                  selected={selected === s.id}
                  onClick={() => openConfig(s.id)}
                />
              </div>
            </div>
          ))}

          <Connector />
          <StepPicker onAdd={addStep} />
        </div>
      </div>

      {/* Config drawer — opens on node click, "Done" minimizes it */}
      {configOpen ? (
        <div
          className="fixed inset-0 z-20 bg-black/20"
          aria-hidden="true"
          onClick={() => setConfigOpen(false)}
        />
      ) : null}
      <div
        role="dialog"
        aria-hidden={!configOpen}
        className={cn(
          "fixed inset-y-0 right-0 z-30 flex w-full max-w-sm flex-col bg-[var(--color-bg-primary)] shadow-2xl transition-transform duration-200",
          configOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <span className="font-semibold">
            {selected === "trigger" ? "Configure trigger" : "Configure step"}
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setConfigOpen(false)}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-[var(--color-bg-secondary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <ConfigPanel
            selected={selected}
            app={app}
            module={module}
            event={event}
            onAppChange={(v) => {
              setApp(v);
              setModule("");
              setEvent("");
            }}
            onModuleChange={(v) => {
              setModule(v);
              setEvent("");
            }}
            onEventChange={setEvent}
            step={selectedStep}
            onUpdateStep={(patch) => selectedStep && updateStep(selectedStep.id, patch)}
            onRemoveStep={() => {
              if (!selectedStep) return;
              setSteps((s) => s.filter((st) => st.id !== selectedStep.id));
              setSelected("trigger");
              setConfigOpen(false);
            }}
            className="border-0 bg-transparent p-0 shadow-none"
            hideHeading
          />
        </div>

        <div className="border-t border-[var(--color-border)] p-4">
          <button
            type="button"
            onClick={() => setConfigOpen(false)}
            className="w-full rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-700"
          >
            Done
          </button>
        </div>
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
