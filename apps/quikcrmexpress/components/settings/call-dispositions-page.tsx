"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { SettingsReturnBackButton } from "@/components/settings/settings-return-back";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { CallDisposition } from "@/lib/api-client";

type DispositionField = {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "datetime" | "select";
  required?: boolean;
  options?: string[];
};

type DispositionStatus = {
  name: string;
  leadStages: string[];
  subStages: string[];
  reasons: string[];
  needsDateTime?: boolean;
  nextStage?: string;
};

type DispositionStatusDraft = DispositionStatus & {
  _draftId: string;
};

type DispositionConfig = {
  fields?: DispositionField[];
  statuses?: DispositionStatus[];
};

function toConfig(value: unknown): DispositionConfig {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const fields = Array.isArray(raw.fields) ? (raw.fields as DispositionField[]) : [];
  const statuses = Array.isArray(raw.statuses) ? (raw.statuses as DispositionStatus[]) : [];
  return { fields, statuses };
}

function CollapsibleSection({
  title,
  children,
  actions,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-lg border border-crm-border bg-white">
      <div className="flex items-center gap-2 p-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
        >
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={
              "shrink-0 text-crm-muted transition-transform duration-200 " +
              (open ? "" : "-rotate-90")
            }
          />
          <h2 className="truncate text-sm font-semibold text-crm-text">{title}</h2>
        </button>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {open ? (
        <div className="border-t border-crm-border px-4 pb-4 pt-3">{children}</div>
      ) : null}
    </div>
  );
}

export function CallDispositionsPage() {
  const toast = useToast();
  const [items, setItems] = useState<CallDisposition[]>([]);
  const [leadStages, setLeadStages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const selectedConfig = useMemo(() => toConfig(selected?.config), [selected]);
  const [fieldDrafts, setFieldDrafts] = useState<DispositionField[]>([]);
  const [statusDrafts, setStatusDrafts] = useState<DispositionStatusDraft[]>([]);

  const [newLabel, setNewLabel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dispRes, cfgRes] = await Promise.all([
        fetch("/api/telephony/dispositions", { credentials: "include" }),
        fetch("/api/settings/workspace", { credentials: "include" }),
      ]);
      const [dispJson, cfgJson] = await Promise.all([dispRes.json(), cfgRes.json()]);
      if (!dispRes.ok) throw new Error(dispJson.error || "Failed to load dispositions");
      if (!cfgRes.ok) throw new Error(cfgJson.error || "Failed to load pipeline config");
      const rows = Array.isArray(dispJson?.items) ? dispJson.items : [];
      setItems(rows);
      setSelectedId((prev) => prev || rows[0]?.id || "");
      const stages = cfgJson?.leadPipelineConfig?.stages;
      setLeadStages(Array.isArray(stages) ? stages : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setFieldDrafts(selectedConfig.fields ?? []);
  }, [selectedConfig]);

  useEffect(() => {
    setStatusDrafts(
      (selectedConfig.statuses ?? []).map((status, idx) => ({
        ...status,
        _draftId: `${idx}-${status.name || "status"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      })),
    );
  }, [selectedConfig]);

  async function createDisposition() {
    const label = newLabel.trim();
    if (!label) return;
    const code = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const res = await fetch("/api/telephony/dispositions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code || `disp_${Date.now()}`, label }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to create disposition");
    setNewLabel("");
    await load();
    toast.success("Disposition added");
  }

  async function patchSelected(data: Record<string, unknown>, success = "Saved") {
    if (!selected) return;
    const res = await fetch(`/api/telephony/dispositions/${selected.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to save");
    const updated = json?.item;
    if (updated && typeof updated === "object") {
      setItems((prev) =>
        prev.map((row) =>
          row.id === selected.id
            ? {
                ...row,
                ...(updated as Partial<CallDisposition>),
              }
            : row,
        ),
      );
    }
    toast.success(success);
  }

  async function deleteSelected() {
    if (!selected) return;
    if (!confirm(`Delete disposition "${selected.label}"?`)) return;
    const res = await fetch(`/api/telephony/dispositions/${selected.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to delete");
    await load();
    toast.success("Disposition deleted");
  }

  async function updateConfig(next: DispositionConfig, success?: string) {
    await patchSelected({ config: next }, success ?? "Configuration saved");
  }

  async function addField() {
    setFieldDrafts((prev) => [
      ...prev,
      {
        id: `field_${Date.now()}`,
        key: "custom_field",
        label: "Custom Field",
        type: "text",
        required: false,
        options: [],
      },
    ]);
  }

  async function addStatus() {
    setStatusDrafts((prev) => [
      ...prev,
      {
        name: "New Status",
        leadStages: [],
        subStages: [],
        reasons: [],
        nextStage: "",
        needsDateTime: false,
        _draftId: `status_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      },
    ]);
  }

  function stripStatusDrafts(drafts: DispositionStatusDraft[]): DispositionStatus[] {
    return drafts.map(({ _draftId: _ignore, ...status }) => status);
  }

  if (loading) return <p className="text-sm text-crm-muted">Loading…</p>;

  return (
    <div className="space-y-4">
      <SettingsReturnBackButton />
      <div>
        <h1 className="text-lg font-semibold text-crm-text">Call Disposition</h1>
        <p className="mt-1 text-sm text-crm-muted">
          Add dispositions, add call-disposition fields, and manage status to stage/sub-stage/reason mapping.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <CollapsibleSection title="Add Disposition">
          <div className="mb-3 flex items-center gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Add disposition"
            />
            <Button onClick={() => void createDisposition()} disabled={!newLabel.trim()}>
              <Plus size={14} />
            </Button>
          </div>
          <ul className="space-y-1">
            {items.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(d.id)}
                  className={
                    "w-full rounded px-2 py-2 text-left text-sm " +
                    (selectedId === d.id ? "bg-crm-blue-soft text-crm-blue" : "hover:bg-crm-panel")
                  }
                >
                  {d.name ?? d.label}
                </button>
              </li>
            ))}
          </ul>
        </CollapsibleSection>

        {!selected ? (
          <div className="rounded-lg border border-dashed border-crm-border p-8 text-center text-sm text-crm-muted">
            Select or add a disposition.
          </div>
        ) : (
          <div className="space-y-4">
            <CollapsibleSection
              title="Disposition Details"
              actions={
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"
                  onClick={() => void deleteSelected()}
                >
                  <Trash2 size={13} /> Delete
                </button>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-crm-muted">Label</span>
                  <Input
                    defaultValue={selected.label}
                    onBlur={(e) => void patchSelected({ label: e.target.value, name: e.target.value })}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-crm-muted">Code</span>
                  <Input defaultValue={selected.code} onBlur={(e) => void patchSelected({ code: e.target.value })} />
                </label>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Call Disposition Fields"
              actions={
                <Button onClick={() => void addField()} size="sm">
                  <Plus size={13} /> Add field
                </Button>
              }
            >
              <div className="space-y-3">
                {fieldDrafts.map((field, idx) => (
                  <FieldEditor
                    key={field.id || `${idx}`}
                    field={field}
                    onChange={(nextField) => {
                      const nextFields = [...fieldDrafts];
                      nextFields[idx] = nextField;
                      setFieldDrafts(nextFields);
                    }}
                    onSave={() => void updateConfig({ ...selectedConfig, fields: fieldDrafts }, "Field saved")}
                    onRemove={() => {
                      const nextFields = fieldDrafts.filter((_, i) => i !== idx);
                      setFieldDrafts(nextFields);
                      void updateConfig({ ...selectedConfig, fields: nextFields }, "Field removed");
                    }}
                  />
                ))}
                {fieldDrafts.length === 0 ? (
                  <p className="text-sm text-crm-muted">No extra fields. Click “Add field”.</p>
                ) : null}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Disposition Status Mapping"
              actions={
                <Button onClick={() => void addStatus()} size="sm">
                  <Plus size={13} /> Add status
                </Button>
              }
            >
              <div className="space-y-4">
                {statusDrafts.map((status, idx) => (
                  <StatusEditor
                    key={status._draftId}
                    status={status}
                    leadStages={leadStages}
                    onChange={(nextStatus) => {
                      const next = [...statusDrafts];
                      next[idx] = nextStatus;
                      setStatusDrafts(next);
                    }}
                    onSave={() =>
                      void updateConfig(
                        { ...selectedConfig, statuses: stripStatusDrafts(statusDrafts) },
                        "Status saved",
                      )
                    }
                    onRemove={() => {
                      const next = statusDrafts.filter((_, i) => i !== idx);
                      setStatusDrafts(next);
                      void updateConfig(
                        { ...selectedConfig, statuses: stripStatusDrafts(next) },
                        "Status removed",
                      );
                    }}
                  />
                ))}
                {statusDrafts.length === 0 ? (
                  <p className="text-sm text-crm-muted">No statuses configured for this disposition.</p>
                ) : null}
              </div>
            </CollapsibleSection>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldEditor({
  field,
  onChange,
  onSave,
  onRemove,
}: {
  field: DispositionField;
  onChange: (field: DispositionField) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded border border-crm-border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} placeholder="Label" />
        <Input value={field.key} onChange={(e) => onChange({ ...field, key: e.target.value })} placeholder="Key" />
        <select
          className="crm-input"
          value={field.type}
          onChange={(e) => onChange({ ...field, type: e.target.value as DispositionField["type"] })}
        >
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="datetime">DateTime</option>
          <option value="select">Dropdown</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-crm-text">
          <input type="checkbox" checked={!!field.required} onChange={(e) => onChange({ ...field, required: e.target.checked })} />
          Required
        </label>
      </div>
      {field.type === "select" ? (
        <Input
          className="mt-2"
          value={(field.options ?? []).join(", ")}
          onChange={(e) => onChange({ ...field, options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          placeholder="Options (comma separated)"
        />
      ) : null}
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={onSave} className="mr-2">
          Save
        </Button>
        <button type="button" className="text-sm text-red-600 hover:underline" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function StatusEditor({
  status,
  leadStages,
  onChange,
  onSave,
  onRemove,
}: {
  status: DispositionStatusDraft;
  leadStages: string[];
  onChange: (status: DispositionStatusDraft) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded border border-crm-border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={status.name} onChange={(e) => onChange({ ...status, name: e.target.value })} placeholder="Status name" />
        <Input value={status.nextStage ?? ""} onChange={(e) => onChange({ ...status, nextStage: e.target.value })} placeholder="Lead Stage result" />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Input
          value={status.subStages.join(", ")}
          onChange={(e) => onChange({ ...status, subStages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          placeholder="Sub Stages (comma separated)"
        />
        <Input
          value={status.reasons.join(", ")}
          onChange={(e) => onChange({ ...status, reasons: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          placeholder="Reasons (comma separated)"
        />
      </div>
      <div className="mt-2">
        <label className="flex items-center gap-2 text-sm text-crm-text">
          <input
            type="checkbox"
            checked={!!status.needsDateTime}
            onChange={(e) => onChange({ ...status, needsDateTime: e.target.checked })}
          />
          Needs Follow Up Date/Time
        </label>
      </div>
      <div className="mt-2 rounded border border-crm-border p-2">
        <p className="mb-1 text-xs text-crm-muted">Applicable Lead Stages</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {leadStages.map((stage) => (
            <label key={stage} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={status.leadStages.includes(stage)}
                onChange={(e) => {
                  if (e.target.checked) onChange({ ...status, leadStages: [...status.leadStages, stage] });
                  else onChange({ ...status, leadStages: status.leadStages.filter((s) => s !== stage) });
                }}
              />
              {stage}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={onSave} className="mr-2">
          Save
        </Button>
        <button type="button" className="text-sm text-red-600 hover:underline" onClick={onRemove}>
          Remove status
        </button>
      </div>
    </div>
  );
}
