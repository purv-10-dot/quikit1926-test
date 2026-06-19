"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { FieldEditorModal } from "@/components/settings/field-editor-modal";
import type { LeadFieldDefinition } from "@/types/field-definition";

export function LeadFieldsPageClient() {
  const toast = useToast();
  const [items, setItems] = useState<LeadFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LeadFieldDefinition | undefined>();
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/fields", { credentials: "include" });
      const json = await res.json();
      setItems(Array.isArray(json?.items) ? json.items : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load fields");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function deleteField(key: string) {
    if (!confirm(`Delete field "${key}"? Existing lead values for this field will be hidden but not removed.`)) return;
    try {
      const res = await fetch(`/api/settings/fields/${encodeURIComponent(key)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Delete failed");
      }
      toast.success("Field deleted");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const standard = items.filter((f) => f.isStandard);
  const custom = items.filter((f) => !f.isStandard);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-crm-text">Lead Fields</h1>
          <p className="text-sm text-crm-muted">Standard + custom field configuration. Custom fields appear in the lead form, detail page, and (when toggled) the leads list.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> New custom field
        </Button>
      </div>

      <Card className="mb-4">
        <CardBody className="p-0">
          <SectionHeader title={`Custom fields (${custom.length})`} subtitle="Org-defined fields stored in Lead.dynamicFields" />
          {loading ? (
            <p className="px-5 py-8 text-center text-sm text-crm-muted">Loading…</p>
          ) : custom.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-crm-muted">
              No custom fields yet. Click <strong>New custom field</strong> to add one.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Label</TH>
                  <TH>Key</TH>
                  <TH>Type</TH>
                  <TH>Requirement</TH>
                  <TH>Visible</TH>
                  <TH>In list</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {custom.map((f) => (
                  <TR key={f.key}>
                    <TD className="font-medium">{f.label}</TD>
                    <TD className="font-mono text-xs text-crm-muted">{f.key}</TD>
                    <TD>{f.fieldType}</TD>
                    <TD>{f.requirement}</TD>
                    <TD>{f.visible ? "Yes" : "—"}</TD>
                    <TD>{f.showInList ? "Yes" : "—"}</TD>
                    <TD className="text-right">
                      <button
                        onClick={() => setEditing(f)}
                        className="mr-1 rounded p-1.5 text-crm-muted hover:bg-crm-panel hover:text-crm-text"
                        aria-label="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteField(f.key)}
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

      <Card>
        <CardBody className="p-0">
          <SectionHeader title={`Standard fields (${standard.length})`} subtitle="Built-in fields written directly to the Lead row. Cannot be deleted." />
          <Table>
            <THead>
              <TR>
                <TH>Label</TH>
                <TH>Key</TH>
                <TH>Type</TH>
                <TH>Requirement</TH>
              </TR>
            </THead>
            <TBody>
              {standard.map((f) => (
                <TR key={f.key}>
                  <TD className="font-medium">{f.label}</TD>
                  <TD className="font-mono text-xs text-crm-muted">{f.key}</TD>
                  <TD>{f.fieldType}</TD>
                  <TD>{f.requirement}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      <FieldEditorModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={refresh} />
      <FieldEditorModal open={!!editing} initial={editing} onClose={() => setEditing(undefined)} onSaved={refresh} />
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-crm-border px-5 py-3">
      <div className="text-sm font-semibold text-crm-text">{title}</div>
      <div className="text-xs text-crm-muted">{subtitle}</div>
    </div>
  );
}
