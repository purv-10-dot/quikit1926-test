"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Play, Plus, LayoutGrid, X, Users, User } from "lucide-react";
import { apiGet, apiSend } from "@/lib/client/fetcher";
import { STEP_KINDS, findApp, findEvent, findAction } from "@/lib/catalog";
import { NodeCard } from "@/components/builder/node-card";
import { Connector } from "@/components/builder/connector";
import { StepPicker } from "@/components/builder/step-picker";
import { ConfigPanel } from "@/components/builder/config-panel";
import type { Step, RuleGroupValue, ScheduleValue } from "@/lib/builder/types";
import { serializeWorkflow, deserializeWorkflow, maxStepSeq, DEFAULT_SCHEDULE, DEFAULT_OFFSET_DAYS, type BuilderState } from "@/lib/builder/serialize";
import { deriveStepLabel, displayStepLabel } from "@/lib/builder/labels";
import { cn } from "@/lib/utils";

const EMPTY_FILTER: RuleGroupValue = { combine: "and", rules: [] };

const GRID_BG: React.CSSProperties = {
  backgroundImage: "radial-gradient(var(--color-border) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

/**
 * The workflow builder — shared by create (`/workflows/new`) and edit
 * (`/workflows/[id]/edit`). All builder state lives here; ConfigPanel and the
 * canvas are presentational. Serialization to/from the persisted graph is the
 * pure `lib/builder/serialize` module.
 */
export function WorkflowBuilder({
  mode,
  workflowId,
  initial,
}: {
  mode: "create" | "edit";
  workflowId?: string;
  initial?: BuilderState;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const fromTemplate = search.get("template");

  const [showCreate, setShowCreate] = useState(mode === "create" && !fromTemplate);
  const [name, setName] = useState(initial?.name ?? "Untitled workflow");
  const [app, setApp] = useState(initial?.app ?? "quikscale");
  const [module, setModule] = useState(initial?.module ?? "");
  const [event, setEvent] = useState(initial?.event ?? "");
  const [triggerFilter, setTriggerFilter] = useState<RuleGroupValue>(initial?.triggerFilter ?? EMPTY_FILTER);
  const [schedule, setSchedule] = useState<ScheduleValue>(initial?.schedule ?? DEFAULT_SCHEDULE);
  const [offsetDays, setOffsetDays] = useState<number>(initial?.offsetDays ?? DEFAULT_OFFSET_DAYS);
  const [steps, setSteps] = useState<Step[]>(initial?.steps ?? []);
  const [selected, setSelected] = useState<string | "trigger" | null>("trigger");
  const [configOpen, setConfigOpen] = useState(false);
  const [live, setLive] = useState(initial?.live ?? false);
  const [scope, setScope] = useState<"org" | "personal">(initial?.scope ?? "personal");
  const [isAdmin, setIsAdmin] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Resolve the caller's role so only admins get the "Org-wide" option.
  useEffect(() => {
    apiGet<{ isAdmin: boolean }>("/api/me")
      .then((d) => setIsAdmin(d.isAdmin))
      .catch(() => setIsAdmin(false));
  }, []);

  const seqRef = useRef(maxStepSeq(initial?.steps ?? []));
  const nextId = () => `step_${(seqRef.current += 1)}`;

  // Prefill from a gallery template (?template=id) on the create flow: fetch the
  // template's graph, deserialize it into builder state (same shape as edit).
  useEffect(() => {
    if (mode !== "create" || !fromTemplate) return;
    let cancelled = false;
    apiGet<{ name: string; trigger: unknown; graphNodes: unknown }>(`/api/templates/${fromTemplate}`)
      .then((tpl) => {
        if (cancelled) return;
        const s = deserializeWorkflow({ name: tpl.name, trigger: tpl.trigger, graphNodes: tpl.graphNodes });
        setName(s.name);
        setApp(s.app);
        setModule(s.module);
        setEvent(s.event);
        setTriggerFilter(s.triggerFilter);
        setSchedule(s.schedule);
        setOffsetDays(s.offsetDays);
        setSteps(s.steps);
        setScope(s.scope);
        seqRef.current = maxStepSeq(s.steps);
        setSelected("trigger");
      })
      .catch(() => {
        /* Template unavailable → leave a blank builder rather than erroring. */
      });
    return () => {
      cancelled = true;
    };
  }, [mode, fromTemplate]);

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
    step.label = deriveStepLabel(step);
    setSteps((s) => [...s, step]);
    openConfig(step.id);
  }
  function updateStep(id: string, patch: Partial<Step>) {
    setSteps((s) =>
      s.map((st) => {
        if (st.id !== id) return st;
        const next = { ...st, ...patch };
        if (patch.label !== undefined) {
          // User hand-edited the Label field → pin it, stop auto-sync.
          next.labelCustom = true;
        } else if (!next.labelCustom && ("actionId" in patch || "rules" in patch || "combine" in patch || "field" in patch)) {
          // Config changed and the label isn't pinned → keep it descriptive.
          next.label = deriveStepLabel(next);
        }
        return next;
      }),
    );
  }
  function resetFilter() {
    setTriggerFilter(EMPTY_FILTER);
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
      setConfigOpen(true);
      return;
    }
    setSaving(true);
    try {
      const { trigger, graphNodes, graphEdges } = serializeWorkflow({ app, module, event, triggerFilter, schedule, offsetDays, steps });
      if (mode === "edit" && workflowId) {
        await apiSend(`/api/workflows/${workflowId}`, "PATCH", { name, scope, trigger, graphNodes, graphEdges });
        await apiSend(`/api/workflows/${workflowId}/toggle`, "PATCH", { on: live });
        router.push(`/workflows/${workflowId}`);
      } else {
        const { id } = await apiSend<{ id: string }>("/api/workflows", "POST", {
          name,
          app,
          scope,
          trigger,
          graphNodes,
          graphEdges,
        });
        if (live) await apiSend(`/api/workflows/${id}/toggle`, "PATCH", { on: true });
        router.push("/workflows");
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  }

  const selectedStep = selected && selected !== "trigger" ? steps.find((s) => s.id === selected) : undefined;
  const backHref = mode === "edit" && workflowId ? `/workflows/${workflowId}` : "/workflows";

  return (
    <div className="relative">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(backHref)}
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
          <ScopeToggle scope={scope} onChange={setScope} canOrg={isAdmin} />
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
            {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Save draft"}
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
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{saveError}</div>
      ) : null}
      {testMsg ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          <span>{testMsg}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setTestMsg(null)} className="shrink-0 rounded p-0.5 text-green-600 hover:bg-green-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className="flex min-h-[calc(100vh-13rem)] items-center overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]" style={GRID_BG}>
        <div className="flex min-w-max items-center gap-1 px-10 py-16">
          <div className="w-64 shrink-0">
            <NodeCard kind="trigger" title={triggerLabelText} subtitle={triggerSubtitle} selected={selected === "trigger"} onClick={() => openConfig("trigger")} />
          </div>
          {steps.map((s) => (
            <div key={s.id} className="flex items-center gap-1">
              <Connector />
              <div className="w-64 shrink-0">
                <NodeCard
                  kind={s.kind}
                  title={displayStepLabel(s)}
                  subtitle={s.kind === "action" && s.labelCustom && s.actionId ? findAction(s.actionId)?.label ?? s.actionId : undefined}
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

      {configOpen ? <div className="fixed inset-0 z-20 bg-black/20" aria-hidden="true" onClick={() => setConfigOpen(false)} /> : null}
      <div
        role="dialog"
        aria-hidden={!configOpen}
        className={cn(
          "fixed inset-y-0 right-0 z-30 flex w-full max-w-sm flex-col bg-[var(--color-bg-primary)] shadow-2xl transition-transform duration-200",
          configOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <span className="font-semibold">{selected === "trigger" ? "Configure trigger" : "Configure step"}</span>
          <button type="button" aria-label="Close" onClick={() => setConfigOpen(false)} className="rounded-lg p-1.5 text-gray-500 hover:bg-[var(--color-bg-secondary)]">
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
              resetFilter();
            }}
            onModuleChange={(v) => {
              setModule(v);
              setEvent("");
              resetFilter();
            }}
            onEventChange={(v) => {
              setEvent(v);
              resetFilter();
            }}
            triggerFilter={triggerFilter}
            onTriggerFilterChange={(patch) => setTriggerFilter((f) => ({ ...f, ...patch }))}
            schedule={schedule}
            onScheduleChange={(patch) => setSchedule((s) => ({ ...s, ...patch }))}
            offsetDays={offsetDays}
            onOffsetDaysChange={setOffsetDays}
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
          <button type="button" onClick={() => setConfigOpen(false)} className="w-full rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-700">
            Done
          </button>
        </div>
      </div>

      {showCreate ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--color-bg-primary)] p-6">
            <h2 className="text-xl font-bold">Create a workflow</h2>
            <p className="mt-1 text-sm text-gray-500">How would you like to start?</p>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-[var(--color-border)] p-6 text-center hover:border-accent-400">
                <Plus className="mx-auto mb-2 h-8 w-8 text-accent-600" />
                <p className="font-semibold">From scratch</p>
                <p className="text-xs text-gray-500">Build step by step</p>
              </button>
              <button type="button" onClick={() => router.push("/templates")} className="rounded-xl border border-[var(--color-border)] p-6 text-center hover:border-accent-400">
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

/**
 * "Who can use this?" segmented control. Members can only create personal
 * ("Just me") workflows; the Org-wide option is disabled for them (server also
 * enforces this — this is just the UX gate).
 */
function ScopeToggle({
  scope,
  onChange,
  canOrg,
}: {
  scope: "org" | "personal";
  onChange: (s: "org" | "personal") => void;
  canOrg: boolean;
}) {
  const pill = (active: boolean) =>
    cn(
      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      active ? "bg-accent-600 text-white" : "text-gray-600 hover:bg-[var(--color-bg-secondary)]",
    );
  return (
    <div className="flex items-center rounded-lg border border-[var(--color-border)] p-0.5" title="Who can use this workflow?">
      <button type="button" onClick={() => onChange("personal")} className={pill(scope === "personal")}>
        <User className="h-3.5 w-3.5" />
        Just me
      </button>
      <button
        type="button"
        onClick={() => canOrg && onChange("org")}
        disabled={!canOrg}
        title={canOrg ? "Everyone in the org" : "Only App Admins can create org-wide workflows"}
        className={cn(pill(scope === "org"), !canOrg && "cursor-not-allowed opacity-40")}
      >
        <Users className="h-3.5 w-3.5" />
        Org-wide
      </button>
    </div>
  );
}
