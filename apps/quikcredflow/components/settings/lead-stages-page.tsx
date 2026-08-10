"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { SettingsReturnBackButton } from "@/components/settings/settings-return-back";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";
import { invalidatePipelineConfigCache } from "@/lib/cache/lead-form-lookups";

interface PipelineConfig {
  stages: string[];
  statuses: string[];
  dependentRules: {
    stageToStatuses?: Record<string, string[]>;
  };
}

const EMPTY: PipelineConfig = { stages: [], statuses: [], dependentRules: {} };

export function LeadStagesPage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cfg, setCfg] = useState<PipelineConfig>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [statusesFor, setStatusesFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/workspace", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      const c = json.leadPipelineConfig ?? {};
      setCfg({
        stages: Array.isArray(c.stages) ? c.stages : [],
        statuses: Array.isArray(c.statuses) ? c.statuses : [],
        dependentRules: c.dependentRules ?? {},
      });
      setLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Deep-link from lead form: ?focus=statuses&stage=… opens the status picker;
  // ?focus=add-stage expands the inline add-stage form.
  const focus = searchParams.get("focus");
  const focusStage = searchParams.get("stage");
  useEffect(() => {
    if (!loaded || !focus) return;

    if (focus === "statuses") {
      const trimmed = focusStage?.trim();
      const target =
        trimmed && cfg.stages.includes(trimmed) ? trimmed : cfg.stages[0];
      if (target) {
        setStatusesFor(target);
      } else {
        toast.error("Add a stage first, then configure statuses.");
        setShowAddForm(true);
      }
    } else if (focus === "add-stage") {
      setShowAddForm(true);
    }

    const returnTo = searchParams.get("returnTo");
    const next = returnTo
      ? `/settings/stages?returnTo=${encodeURIComponent(returnTo)}`
      : "/settings/stages";
    router.replace(next, { scroll: false });
  }, [loaded, focus, focusStage, cfg.stages, router, toast, searchParams]);

  /** Persist the given config patch and update local state. */
  async function persist(next: PipelineConfig, successMessage?: string) {
    setCfg(next);
    try {
      const res = await fetch("/api/settings/workspace", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stages: next.stages,
          statuses: next.statuses,
          dependentRules: next.dependentRules,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to save");
      }
      invalidatePipelineConfigCache();
      if (successMessage) toast.success(successMessage);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
      // Best-effort rollback by reloading from server
      load();
    }
  }

  function addStage(name: string, statuses: string[]) {
    const trimmedName = name.trim();
    const cleanStatuses = statuses.map((s) => s.trim()).filter(Boolean);
    if (!trimmedName) {
      toast.error("Stage name is required");
      return false;
    }
    if (cfg.stages.includes(trimmedName)) {
      toast.error("That stage already exists");
      return false;
    }

    const nextStages = [...cfg.stages, trimmedName];
    const mergedStatuses = Array.from(new Set([...cfg.statuses, ...cleanStatuses]));
    const nextRule = { ...(cfg.dependentRules.stageToStatuses ?? {}) };
    if (cleanStatuses.length > 0) nextRule[trimmedName] = cleanStatuses;

    persist(
      {
        stages: nextStages,
        statuses: mergedStatuses,
        dependentRules: { ...cfg.dependentRules, stageToStatuses: nextRule },
      },
      `Stage "${trimmedName}" added`,
    );
    return true;
  }

  function deleteStage(name: string) {
    if (!confirm(`Remove stage "${name}"?`)) return;
    const nextRules = { ...(cfg.dependentRules.stageToStatuses ?? {}) };
    delete nextRules[name];
    persist(
      {
        ...cfg,
        stages: cfg.stages.filter((s) => s !== name),
        dependentRules: { ...cfg.dependentRules, stageToStatuses: nextRules },
      },
      "Stage removed",
    );
  }

  function startEdit(name: string) {
    setEditing(name);
    setEditValue(name);
  }

  function commitEdit() {
    if (!editing) return;
    const next = editValue.trim();
    if (!next || next === editing) {
      setEditing(null);
      return;
    }
    if (cfg.stages.includes(next)) {
      toast.error("That stage already exists.");
      return;
    }
    const stages = cfg.stages.map((s) => (s === editing ? next : s));
    const rules = { ...(cfg.dependentRules.stageToStatuses ?? {}) };
    if (rules[editing]) {
      rules[next] = rules[editing]!;
      delete rules[editing];
    }
    persist(
      { ...cfg, stages, dependentRules: { ...cfg.dependentRules, stageToStatuses: rules } },
      "Stage renamed",
    );
    setEditing(null);
  }

  function setStatusesForStage(stage: string, allowed: string[]) {
    const rule = { ...(cfg.dependentRules.stageToStatuses ?? {}) };
    if (allowed.length === 0) delete rule[stage];
    else rule[stage] = allowed;
    // Also merge any newly-introduced statuses into the global list
    const mergedStatuses = Array.from(new Set([...cfg.statuses, ...allowed]));
    persist(
      {
        ...cfg,
        statuses: mergedStatuses,
        dependentRules: { ...cfg.dependentRules, stageToStatuses: rule },
      },
      "Statuses updated",
    );
    setStatusesFor(null);
  }

  function statusLabelFor(stage: string): string {
    const rule = cfg.dependentRules.stageToStatuses?.[stage];
    if (!rule || rule.length === 0) return "All statuses";
    return rule.join(", ");
  }

  return (
    <div className="space-y-4">
      <SettingsReturnBackButton />
      <div>
        <h1 className="text-lg font-semibold text-crm-text">Lead Stages</h1>
        <p className="mt-1 text-sm text-crm-muted">
          Add, edit, and delete stages with their statuses. These values drive lead forms and stage/status dropdowns.
        </p>
      </div>

      {showAddForm ? (
        <AddStageForm
          onCancel={() => setShowAddForm(false)}
          onAdd={(name, statuses) => {
            const ok = addStage(name, statuses);
            if (ok) setShowAddForm(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-crm-border bg-white px-4 py-3 text-left text-sm text-crm-muted hover:border-crm-blue hover:text-crm-blue"
        >
          <Plus size={14} /> Add stage
        </button>
      )}

      {!loaded ? (
        <p className="text-sm text-crm-muted">Loading…</p>
      ) : cfg.stages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-crm-border p-8 text-center text-sm text-crm-muted">
          No stages yet. Add your first stage above.
        </div>
      ) : (
        <ul className="space-y-2">
          {cfg.stages.map((s) => (
            <li
              key={s}
              className="flex items-center justify-between rounded-lg border border-crm-border bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                {editing === s ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitEdit();
                        }
                        if (e.key === "Escape") setEditing(null);
                      }}
                      autoFocus
                    />
                    <Button onClick={commitEdit}>Save</Button>
                    <Button variant="secondary" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="font-medium text-crm-text">{s}</div>
                    <div className="mt-0.5 text-xs text-crm-muted">{statusLabelFor(s)}</div>
                  </>
                )}
              </div>
              {editing !== s && (
                <div className="ml-3 flex items-center gap-3">
                  <button
                    onClick={() => setStatusesFor(s)}
                    className="text-sm text-crm-blue hover:underline"
                  >
                    Statuses
                  </button>
                  <button
                    onClick={() => startEdit(s)}
                    className="inline-flex items-center gap-1 text-sm text-crm-blue hover:underline"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    onClick={() => deleteStage(s)}
                    className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {statusesFor && (
        <StatusesModal
          stage={statusesFor}
          existing={cfg.statuses}
          allowed={cfg.dependentRules.stageToStatuses?.[statusesFor] ?? []}
          onClose={() => setStatusesFor(null)}
          onSave={(allowed) => setStatusesForStage(statusesFor, allowed)}
        />
      )}
    </div>
  );
}

/** Inline expandable add-stage form matching the design: stage name + dynamic list of status inputs. */
function AddStageForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, statuses: string[]) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [statuses, setStatuses] = useState<string[]>([""]);

  function addStatusRow() {
    setStatuses((s) => [...s, ""]);
  }
  function removeStatusRow(i: number) {
    setStatuses((s) => {
      const next = s.filter((_, idx) => idx !== i);
      return next.length === 0 ? [""] : next;
    });
  }
  function updateStatus(i: number, value: string) {
    setStatuses((s) => s.map((v, idx) => (idx === i ? value : v)));
  }

  function submit() {
    onAdd(name, statuses);
  }

  return (
    <div className="rounded-lg border border-crm-border bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-crm-text">Add stage</h3>

      <label className="block">
        <span className="mb-1 block text-xs text-crm-blue">Stage name</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
      </label>

      <div className="mt-3">
        <span className="mb-1 block text-xs text-crm-blue">Statuses</span>
        <ul className="space-y-2">
          {statuses.map((s, i) => (
            <li key={i} className="flex items-center gap-2">
              <Input
                value={s}
                onChange={(e) => updateStatus(i, e.target.value)}
                placeholder="Status"
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeStatusRow(i)}
                className="text-sm text-red-600 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            addStatusRow();
          }}
          className="mt-2 text-xs text-crm-blue hover:underline"
        >
          + Add status
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!name.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

/** Modal to edit which statuses are allowed for an existing stage. Statuses can be picked from the
 *  global pool or typed in fresh — fresh ones get merged into the pool on save. */
function StatusesModal({
  stage,
  existing,
  allowed,
  onClose,
  onSave,
}: {
  stage: string;
  existing: string[];
  allowed: string[];
  onClose: () => void;
  onSave: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(allowed.length > 0 ? allowed : []);
  const [adding, setAdding] = useState("");

  function toggle(s: string) {
    setDraft((d) => (d.includes(s) ? d.filter((x) => x !== s) : [...d, s]));
  }
  function addNew() {
    const v = adding.trim();
    if (!v) return;
    if (!draft.includes(v)) setDraft((d) => [...d, v]);
    setAdding("");
  }

  // Combined visible list: every status from the global pool plus any new-typed values not yet in the pool
  const visible = Array.from(new Set([...existing, ...draft]));

  return (
    <Modal open onClose={onClose} title={`Statuses for "${stage}"`} width="max-w-md">
      <p className="mb-3 text-sm text-crm-muted">
        Pick which statuses are allowed for this stage. Leave all unchecked to allow every status.
      </p>

      <div className="mb-3 flex items-center gap-2">
        <Input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addNew();
            }
          }}
          placeholder="Type a new status…"
        />
        <Button onClick={addNew} disabled={!adding.trim()}>
          Add
        </Button>
      </div>

      <ul className="space-y-1">
        {visible.length === 0 && (
          <li className="rounded border border-dashed border-crm-border p-3 text-center text-sm text-crm-muted">
            No statuses defined yet — type one above.
          </li>
        )}
        {visible.map((s) => (
          <li key={s}>
            <label className="flex items-center justify-between rounded border border-crm-border bg-white px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={draft.includes(s)} onChange={() => toggle(s)} />
                <span>{s}</span>
              </span>
              {!existing.includes(s) && (
                <button
                  type="button"
                  onClick={() => setDraft((d) => d.filter((x) => x !== s))}
                  className="text-crm-muted hover:text-red-600"
                  aria-label="Remove"
                >
                  <X size={14} />
                </button>
              )}
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(draft)}>Save</Button>
      </div>
    </Modal>
  );
}
