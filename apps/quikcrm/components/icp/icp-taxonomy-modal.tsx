"use client";

/**
 * ICP taxonomy manager — CRUD for the Industry / Vertical / Technology master.
 *
 * Rendered as a Modal from the ICP list page rather than a separate route: it is
 * supporting config for one module, and the settings routes in this app are
 * admin-scoped while ICP taxonomy follows the `icp` permission key. Kept in one
 * place so "Manage taxonomy" never sends the user away from their list.
 *
 * Inline add-row + inline rename, matching the lead-sources settings pattern
 * (components/settings/lead-sources-page.tsx) rather than a modal-inside-a-modal.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useConfirm } from "@quikit/ui";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableScroll, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type Kind = "Industry" | "Vertical" | "Technology";

const KINDS: Kind[] = ["Industry", "Vertical", "Technology"];

const KIND_PLURAL: Record<Kind, string> = {
  Industry: "Industries",
  Vertical: "Verticals",
  Technology: "Technologies",
};

interface TaxonomyRow {
  id: string;
  kind: Kind;
  name: string;
  code: string | null;
  parentId: string | null;
  parent: { id: string; name: string } | null;
  sortOrder: number;
  isActive: boolean;
  usageCount: number;
}

export function IcpTaxonomyModal({
  open,
  canEdit,
  canDelete,
  onClose,
}: {
  open: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const [kind, setKind] = useState<Kind>("Industry");
  const [rows, setRows] = useState<TaxonomyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [adding, setAdding] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // pageSize 100 is the contract's max; the vocabularies are small by design
      // and the picker feed caps at 1000, so one page is the whole list here.
      const res = await fetch(`/api/icp/taxonomy?kind=${kind}&pageSize=100`, {
        credentials: "include",
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to load");
      setRows(body.data.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load taxonomy");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/icp/taxonomy", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, name: trimmed, code: newCode.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to add");
      toast.success(`${kind} added`);
      setNewName("");
      setNewCode("");
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to add";
      setError(msg);
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  }

  async function handleRename(row: TaxonomyRow) {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === row.name) {
      setEditId(null);
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/icp/taxonomy/${row.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to rename");
      toast.success("Renamed");
      setEditId(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to rename");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleActive(row: TaxonomyRow) {
    try {
      const res = await fetch(`/api/icp/taxonomy/${row.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to update");
      toast.success(row.isActive ? "Deactivated" : "Activated");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleDelete(row: TaxonomyRow) {
    const ok = await confirm({
      title: `Delete "${row.name}"?`,
      description:
        row.usageCount > 0
          ? `This entry is used by ${row.usageCount} ICP profile${row.usageCount === 1 ? "" : "s"}. Deleting is blocked — deactivate it instead.`
          : "This cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/icp/taxonomy/${row.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to delete");
      toast.success("Deleted");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  const showActions = canEdit || canDelete;

  return (
    <Modal open={open} onClose={onClose} title="Manage ICP taxonomy" width="max-w-3xl">
      <div className="space-y-3">
        <div className="inline-flex max-w-full overflow-x-auto rounded border border-crm-border bg-white p-0.5 text-sm">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setEditId(null);
              }}
              className={[
                "shrink-0 rounded px-3 py-1.5",
                kind === k ? "bg-crm-blue text-white" : "text-crm-text hover:bg-crm-panel",
              ].join(" ")}
            >
              {KIND_PLURAL[k]}
            </button>
          ))}
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-crm-border bg-crm-panel/40 p-3">
            <label className="block flex-1 min-w-[180px]">
              <span className="mb-1 block text-xs font-medium text-crm-text">
                New {kind.toLowerCase()}
              </span>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAdd();
                }}
                maxLength={160}
                placeholder={
                  kind === "Industry"
                    ? "Manufacturing"
                    : kind === "Vertical"
                      ? "Automotive OEM"
                      : "AWS"
                }
              />
            </label>
            <label className="block w-32">
              <span className="mb-1 block text-xs font-medium text-crm-text">Code</span>
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                maxLength={64}
                placeholder="optional"
              />
            </label>
            <Button onClick={handleAdd} disabled={adding || !newName.trim()}>
              <Plus size={16} /> {adding ? "Adding…" : "Add"}
            </Button>
          </div>
        )}

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-crm-border bg-white">
          <TableScroll minWidth={560}>
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH hideBelow="sm">Code</TH>
                  <TH className="text-right">Used by</TH>
                  <TH>Status</TH>
                  {showActions && <TH aria-label="Actions" className="w-28 text-center" />}
                </TR>
              </THead>
              <TBody>
                {loading && rows.length === 0 ? (
                  <TR>
                    <TD
                      colSpan={showActions ? 5 : 4}
                      className="py-6 text-center text-sm text-crm-muted"
                    >
                      Loading…
                    </TD>
                  </TR>
                ) : rows.length === 0 ? (
                  <TR>
                    <TD
                      colSpan={showActions ? 5 : 4}
                      className="py-10 text-center text-sm text-crm-muted"
                    >
                      <div className="mx-auto max-w-sm space-y-1">
                        <p className="font-medium text-crm-text">
                          No {KIND_PLURAL[kind].toLowerCase()} yet
                        </p>
                        <p>
                          {canEdit
                            ? "Add the first one above — it becomes selectable on every ICP profile."
                            : "Ask an administrator to add entries."}
                        </p>
                      </div>
                    </TD>
                  </TR>
                ) : (
                  rows.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        {editId === row.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void handleRename(row);
                                if (e.key === "Escape") setEditId(null);
                              }}
                              maxLength={160}
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => void handleRename(row)}
                              disabled={savingEdit}
                              className="rounded-md p-1.5 text-crm-muted hover:bg-green-50 hover:text-green-700"
                              aria-label="Save name"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditId(null)}
                              className="rounded-md p-1.5 text-crm-muted hover:bg-crm-panel"
                              aria-label="Cancel rename"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <span className="font-medium text-crm-text">{row.name}</span>
                        )}
                      </TD>
                      <TD hideBelow="sm" className="text-xs text-crm-muted">
                        {row.code ?? "—"}
                      </TD>
                      <TD className="text-right tabular-nums text-xs text-crm-muted">
                        {row.usageCount}
                      </TD>
                      <TD>
                        {row.isActive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                            Inactive
                          </span>
                        )}
                      </TD>
                      {showActions && (
                        <TD className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {canEdit && editId !== row.id && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditId(row.id);
                                    setEditName(row.name);
                                  }}
                                  className="rounded-md p-1.5 text-crm-muted opacity-60 transition hover:bg-crm-panel hover:text-crm-text hover:opacity-100"
                                  aria-label={`Rename ${row.name}`}
                                  title="Rename"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleToggleActive(row)}
                                  className="rounded-md px-1.5 py-1 text-xs text-crm-muted opacity-70 transition hover:bg-crm-panel hover:text-crm-text hover:opacity-100"
                                  title={row.isActive ? "Deactivate" : "Activate"}
                                >
                                  {row.isActive ? "Off" : "On"}
                                </button>
                              </>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => void handleDelete(row)}
                                className="rounded-md p-1.5 text-crm-muted opacity-60 transition hover:bg-red-50 hover:text-red-600 hover:opacity-100"
                                aria-label={`Delete ${row.name}`}
                                title={
                                  row.usageCount > 0
                                    ? "In use — deactivate instead"
                                    : "Delete"
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </TD>
                      )}
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </TableScroll>
        </div>
      </div>

      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
