"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { FieldEditorModal } from "@/components/settings/field-editor-modal";
import type { LeadFieldDefinition } from "@/types/field-definition";
import type { ProductFieldDefinition } from "@/types/product-field-definition";

export function ProductFieldsPageClient() {
  const toast = useToast();
  const [items, setItems] = useState<ProductFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LeadFieldDefinition | undefined>();
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/product-fields", { credentials: "include" });
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
    if (!confirm(`Delete field "${key}"?`)) return;
    try {
      const res = await fetch(`/api/settings/product-fields/${encodeURIComponent(key)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
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
          <h1 className="text-xl font-semibold text-crm-text">Product Fields</h1>
          <p className="text-sm text-crm-muted">
            Custom fields (GST %, HSN, warranty, etc.) stored in Product.dynamicFields.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> New custom field
        </Button>
      </div>

      <Card className="mb-4">
        <CardBody className="p-0">
          <SectionHeader title={`Custom fields (${custom.length})`} />
          {loading ? (
            <p className="px-5 py-8 text-center text-sm text-crm-muted">Loading…</p>
          ) : custom.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-crm-muted">No custom fields yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Label</TH>
                  <TH>Key</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {custom.map((f) => (
                  <TR key={f.key}>
                    <TD className="font-medium">{f.label}</TD>
                    <TD className="font-mono text-xs text-crm-muted">{f.key}</TD>
                    <TD>{f.fieldType}</TD>
                    <TD className="text-right">
                      <button
                        onClick={() => setEditing(f as unknown as LeadFieldDefinition)}
                        className="mr-1 rounded p-1.5 text-crm-muted hover:bg-crm-panel"
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

      <FieldEditorModal
        open={createOpen}
        apiBase="/api/settings/product-fields"
        onClose={() => setCreateOpen(false)}
        onSaved={refresh}
      />
      <FieldEditorModal
        open={!!editing}
        initial={editing}
        apiBase="/api/settings/product-fields"
        onClose={() => setEditing(undefined)}
        onSaved={refresh}
      />
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-crm-border px-5 py-3 text-sm font-semibold text-crm-text">{title}</div>
  );
}
