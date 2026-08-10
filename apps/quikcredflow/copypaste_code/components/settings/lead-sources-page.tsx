"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsReturnBackButton } from "@/components/settings/settings-return-back";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  invalidatePipelineConfigCache,
  invalidateSourcesCache,
} from "@/lib/cache/lead-form-lookups";

interface Source {
  id: string;
  name: string;
  type: string | null;
  active: boolean;
}

interface PipelineConfig {
  stages: string[];
  dependentRules: {
    sourceToStages?: Record<string, string[]>;
  };
}

export function LeadSourcesPage() {
  const toast = useToast();
  const [items, setItems] = useState<Source[]>([]);
  const [pipeline, setPipeline] = useState<PipelineConfig>({ stages: [], dependentRules: {} });
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [configFor, setConfigFor] = useState<Source | null>(null);

  const bustLeadFormCaches = useCallback(() => {
    invalidateSourcesCache();
    invalidatePipelineConfigCache();
  }, []);

  const load = useCallback(async () => {
    const [s, w] = await Promise.all([
      fetch("/api/leads/sources?includeInactive=true", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/settings/workspace", { credentials: "include" }).then((r) => r.json()),
    ]);
    setItems(Array.isArray(s?.items) ? s.items : []);
    if (w?.leadPipelineConfig) {
      setPipeline({
        stages: w.leadPipelineConfig.stages ?? [],
        dependentRules: w.leadPipelineConfig.dependentRules ?? {},
      });
    }
  }, []);

  useEffect(() => {
    load().catch(() => toast.error("Failed to load sources"));
  }, [load, toast]);

  async function addSource() {
    const name = draft.trim();
    if (!name) return;
    setAdding(true);
    try {
      const res = await fetch("/api/leads/sources", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add");
      setDraft("");
      bustLeadFormCaches();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  async function toggleActive(s: Source) {
    try {
      const res = await fetch(`/api/leads/sources/${s.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !s.active }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to update");
      }
      bustLeadFormCaches();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function removeSource(id: string) {
    if (!confirm("Remove this source? Existing leads using it won't be affected.")) return;
    try {
      const res = await fetch(`/api/leads/sources/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to remove");
      }
      bustLeadFormCaches();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  async function saveSourceStages(sourceName: string, allowed: string[]) {
    const next = {
      ...(pipeline.dependentRules.sourceToStages ?? {}),
      [sourceName]: allowed,
    };
    // Drop the entry entirely if empty (means "no restriction")
    if (allowed.length === 0) delete next[sourceName];
    try {
      const res = await fetch("/api/settings/workspace", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependentRules: { ...pipeline.dependentRules, sourceToStages: next } }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Stages updated");
      bustLeadFormCaches();
      load();
      setConfigFor(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <div className="space-y-4">
      <SettingsReturnBackButton />
      <div>
        <h1 className="text-lg font-semibold text-crm-text">Lead Sources</h1>
        <p className="mt-1 text-sm text-crm-muted">Used in lead create/edit forms and list filters.</p>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addSource();
            }
          }}
          placeholder="Add source (e.g. Website, Referral, Webinar)"
          className="flex-1"
        />
        <Button onClick={addSource} disabled={adding || !draft.trim()}>
          Add
        </Button>
      </div>

      <div className="crm-card">
        <Table>
          <THead>
            <TR>
              <TH>Source</TH>
              <TH>Status</TH>
              <TH className="w-64">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {items.length === 0 ? (
              <TR>
                <TD colSpan={3} className="py-8 text-center text-crm-muted">
                  No sources yet. Add your first one above.
                </TD>
              </TR>
            ) : (
              items.map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium text-crm-blue">{s.name}</TD>
                  <TD>
                    <span className={s.active ? "text-emerald-600" : "text-crm-muted"}>
                      {s.active ? "Active" : "Inactive"}
                    </span>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setConfigFor(s)}
                        className="text-sm text-crm-blue hover:underline"
                      >
                        Configure stages
                      </button>
                      <button
                        onClick={() => toggleActive(s)}
                        className="text-sm text-crm-blue hover:underline"
                      >
                        {s.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => removeSource(s.id)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>

      {configFor && (
        <SourceStagesModal
          source={configFor}
          stages={pipeline.stages}
          allowed={pipeline.dependentRules.sourceToStages?.[configFor.name] ?? []}
          onClose={() => setConfigFor(null)}
          onSave={(allowed) => saveSourceStages(configFor.name, allowed)}
        />
      )}
    </div>
  );
}

function SourceStagesModal({
  source,
  stages,
  allowed,
  onClose,
  onSave,
}: {
  source: Source;
  stages: string[];
  allowed: string[];
  onClose: () => void;
  onSave: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(allowed);

  function toggle(stage: string) {
    setDraft((d) => (d.includes(stage) ? d.filter((s) => s !== stage) : [...d, stage]));
  }

  return (
    <Modal open onClose={onClose} title={`Configure stages for "${source.name}"`} width="max-w-md">
      <p className="mb-3 text-sm text-crm-muted">
        Pick which stages are allowed when this source is selected on a lead. Leave all unchecked to allow every stage.
      </p>
      <ul className="space-y-1">
        {stages.length === 0 && (
          <li className="rounded border border-dashed border-crm-border p-3 text-center text-sm text-crm-muted">
            No stages defined yet — go to Lead Stages first.
          </li>
        )}
        {stages.map((s) => (
          <li key={s}>
            <label className="flex items-center gap-2 rounded border border-crm-border bg-white px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={draft.includes(s)}
                onChange={() => toggle(s)}
              />
              <span>{s}</span>
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
