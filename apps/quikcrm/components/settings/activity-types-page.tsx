"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { FormActions } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { FieldEditorModal } from "@/components/settings/field-editor-modal";
import type { LeadFieldDefinition } from "@/types/field-definition";
import type { ActivityTypeDefinition } from "@/types/activity-type";

const TYPES_API = "/api/settings/activity-types";

// The shared FieldEditorModal reads { key, label, fieldType, requirement,
// visible, helpText, options } — our activity field rows are structurally
// compatible. We pass showListColumnToggle={false} so the lead-only
// "show in list" control is hidden (decision #8).
type ActivityFieldRow = LeadFieldDefinition;

export function ActivityTypesPageClient() {
  const toast = useToast();
  const [types, setTypes] = useState<ActivityTypeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [createTypeOpen, setCreateTypeOpen] = useState(false);

  const [fields, setFields] = useState<ActivityFieldRow[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [createFieldOpen, setCreateFieldOpen] = useState(false);
  const [editingField, setEditingField] = useState<ActivityFieldRow | undefined>();

  const refreshTypes = useCallback(async () => {
    try {
      const res = await fetch(TYPES_API, { credentials: "include" });
      const json = await res.json();
      setTypes(Array.isArray(json?.data) ? json.data : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load activity types");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refreshTypes();
  }, [refreshTypes]);

  const refreshFields = useCallback(
    async (typeId: string) => {
      setFieldsLoading(true);
      try {
        const res = await fetch(`${TYPES_API}/${typeId}/fields`, { credentials: "include" });
        const json = await res.json();
        setFields(Array.isArray(json?.data) ? json.data : []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load fields");
      } finally {
        setFieldsLoading(false);
      }
    },
    [toast],
  );

  function selectType(id: string) {
    setSelectedId(id);
    refreshFields(id);
  }

  async function deleteType(id: string, label: string) {
    if (!confirm(`Delete activity type "${label}"? Its custom fields will be removed too.`)) return;
    try {
      const res = await fetch(`${TYPES_API}/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Delete failed");
      }
      toast.success("Activity type deleted");
      if (selectedId === id) {
        setSelectedId(null);
        setFields([]);
      }
      refreshTypes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const selectedType = types.find((t) => t.id === selectedId) ?? null;
  const fieldsApiBase = selectedId ? `${TYPES_API}/${selectedId}/fields` : TYPES_API;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-crm-text">Activity Types</h1>
          <p className="text-sm text-crm-muted">
            Define the kinds of activity reps log (e.g. Upwork Connect, LinkedIn DM, Pitch Call) and the
            custom fields each one collects.
          </p>
        </div>
        <Button onClick={() => setCreateTypeOpen(true)}>
          <Plus size={14} /> New activity type
        </Button>
      </div>

      <Card className="mb-4">
        <CardBody className="p-0">
          {loading ? (
            <p className="px-5 py-8 text-center text-sm text-crm-muted">Loading…</p>
          ) : types.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium text-crm-text">No activity types yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-crm-muted">
                Create your first — e.g. Upwork Connect, LinkedIn DM, Pitch Call — and add the fields
                reps fill in when they log it.
              </p>
              <div className="mt-4">
                <Button onClick={() => setCreateTypeOpen(true)}>
                  <Plus size={14} /> New activity type
                </Button>
              </div>
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Label</TH>
                  <TH>Code</TH>
                  <TH>Active</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {types.map((t) => (
                  <TR key={t.id} className={selectedId === t.id ? "bg-blue-50/30" : undefined}>
                    <TD>
                      <button
                        onClick={() => selectType(t.id)}
                        className="font-medium text-crm-text hover:underline"
                      >
                        {t.label}
                      </button>
                    </TD>
                    <TD className="font-mono text-xs text-crm-muted">{t.code}</TD>
                    <TD>{t.isActive ? "Yes" : "—"}</TD>
                    <TD className="text-right">
                      <button
                        onClick={() => selectType(t.id)}
                        className="mr-1 rounded p-1.5 text-crm-muted hover:bg-crm-panel hover:text-crm-text"
                        aria-label="Edit fields"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteType(t.id, t.label)}
                        className="rounded p-1.5 text-crm-muted hover:bg-red-50 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {selectedType && (
        <Card>
          <CardBody className="p-0">
            <div className="flex items-center justify-between border-b border-crm-border px-5 py-3">
              <div>
                <div className="text-sm font-semibold text-crm-text">
                  Fields for “{selectedType.label}”
                </div>
                <div className="text-xs text-crm-muted">
                  Custom fields reps fill in when logging this activity type.
                </div>
              </div>
              <Button variant="secondary" onClick={() => setCreateFieldOpen(true)}>
                <Plus size={14} /> New field
              </Button>
            </div>
            {fieldsLoading ? (
              <p className="px-5 py-8 text-center text-sm text-crm-muted">Loading…</p>
            ) : fields.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-crm-muted">
                No fields yet. Click <strong>New field</strong> to add one.
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Label</TH>
                    <TH>Key</TH>
                    <TH>Type</TH>
                    <TH>Requirement</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {fields.map((f) => (
                    <TR key={f.key}>
                      <TD className="font-medium">{f.label}</TD>
                      <TD className="font-mono text-xs text-crm-muted">{f.key}</TD>
                      <TD>{f.fieldType}</TD>
                      <TD>{f.requirement}</TD>
                      <TD className="text-right">
                        <button
                          onClick={() => setEditingField(f)}
                          className="rounded p-1.5 text-crm-muted hover:bg-crm-panel hover:text-crm-text"
                          aria-label="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}

      <NewActivityTypeModal
        open={createTypeOpen}
        onClose={() => setCreateTypeOpen(false)}
        onSaved={() => {
          setCreateTypeOpen(false);
          refreshTypes();
        }}
      />

      <FieldEditorModal
        open={createFieldOpen}
        apiBase={fieldsApiBase}
        showListColumnToggle={false}
        keyHelpText="Stable identifier for this field on the activity type."
        onClose={() => setCreateFieldOpen(false)}
        onSaved={() => {
          setCreateFieldOpen(false);
          if (selectedId) refreshFields(selectedId);
        }}
      />
      <FieldEditorModal
        open={!!editingField}
        initial={editingField}
        apiBase={fieldsApiBase}
        showListColumnToggle={false}
        keyHelpText="Stable identifier for this field on the activity type."
        onClose={() => setEditingField(undefined)}
        onSaved={() => {
          setEditingField(undefined);
          if (selectedId) refreshFields(selectedId);
        }}
      />
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function NewActivityTypeModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel("");
    setCode("");
    setCodeTouched(false);
  }, [open]);

  useEffect(() => {
    if (!codeTouched) setCode(slugify(label));
  }, [label, codeTouched]);

  async function save() {
    if (!label.trim() || !code.trim()) {
      toast.error("Label and code are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(TYPES_API, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), code: code.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      toast.success("Activity type created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New activity type" width="max-w-md">
      <div className="grid grid-cols-1 gap-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-crm-text">Label *</span>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Upwork Connect, LinkedIn DM"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-crm-text">Code *</span>
          <Input
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeTouched(true);
            }}
            placeholder="lowercase_with_underscores"
          />
          <span className="mt-1 block text-[11px] text-crm-muted">
            Stable identifier. Auto-generated from label; edit if you need custom.
          </span>
        </label>
      </div>
      <FormActions className="mt-5">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Create type"}
        </Button>
      </FormActions>
    </Modal>
  );
}
