"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";
import { PermissionMatrixEditor, type ModulePermRow } from "@/components/settings/permission-matrix-editor";

interface Template {
  id: string;
  name: string;
  matrix: ModulePermRow[];
  _count?: { users: number };
}

interface RoleVisibilityRow {
  role: string;
  restrictToOwnedLeads: boolean;
}

// Friendly labels for the configurable roles (keys match role-grants role names).
const ROLE_LABELS: Record<string, string> = {
  SalesManager: "Sales Manager",
  SalesUser: "Sales User",
  MarketingUser: "Marketing User",
  FinanceUser: "Finance User",
};

/**
 * Lead Visibility by Role — toggles the `restrictToOwnedLeads` flag per role
 * via /api/settings/role-config. When ON, users with that role see only leads
 * they own (across list, board, filter, search, dashboard, and by-id actions).
 * Administrator is intentionally absent (always sees everything).
 */
function LeadVisibilityByRole() {
  const toast = useToast();
  const [rows, setRows] = useState<RoleVisibilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/role-config", { credentials: "include" });
      const json = await res.json();
      setRows(Array.isArray(json?.roles) ? json.roles : []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function toggle(role: string, next: boolean) {
    setSavingRole(role);
    // Optimistic update; revert on failure.
    setRows((prev) => prev.map((r) => (r.role === role ? { ...r, restrictToOwnedLeads: next } : r)));
    try {
      const res = await fetch("/api/settings/role-config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, restrictToOwnedLeads: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Update failed");
      toast.success(
        `${ROLE_LABELS[role] ?? role}: ${next ? "restricted to owned leads" : "can see all leads"}`,
      );
    } catch (e) {
      // Revert the optimistic change.
      setRows((prev) => prev.map((r) => (r.role === role ? { ...r, restrictToOwnedLeads: !next } : r)));
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingRole(null);
    }
  }

  return (
    <Card className="mb-5">
      <CardHeader>
        <CardTitle>Lead Visibility by Role</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="mb-3 text-sm text-crm-muted">
          When ON, users with that role see only leads they own — across the list, board,
          search, and dashboard. Administrators always see all leads.
        </p>
        {loading ? (
          <p className="text-sm text-crm-muted">Loading…</p>
        ) : (
          <ul className="divide-y divide-crm-border">
            {rows.map((r) => (
              <li key={r.role} className="flex items-center justify-between py-2.5">
                <span className="text-sm font-medium text-crm-text">
                  {ROLE_LABELS[r.role] ?? r.role}
                </span>
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <span className="text-xs text-crm-muted">
                    {r.restrictToOwnedLeads ? "Owned leads only" : "All leads"}
                  </span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-crm-primary"
                    checked={r.restrictToOwnedLeads}
                    disabled={savingRole === r.role}
                    onChange={(e) => toggle(r.role, e.target.checked)}
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export default function PermissionTemplatesPage() {
  const toast = useToast();
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/permission-templates", { credentials: "include" });
      const json = await res.json();
      setItems(Array.isArray(json?.items) ? json.items : []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function deleteTemplate(t: Template) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    const res = await fetch(`/api/settings/permission-templates/${t.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || "Delete failed");
    } else {
      toast.success("Template deleted");
      refresh();
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-crm-text">Permission Templates</h1>
          <p className="text-sm text-crm-muted">Module-level access + field masking. Assign templates to users.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={14} /> New template
        </Button>
      </div>

      <LeadVisibilityByRole />

      {loading ? (
        <p className="text-center text-sm text-crm-muted">Loading…</p>
      ) : (
        <div className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-crm-muted">No templates yet.</p>
          ) : (
            items.map((t) => (
              <Card key={t.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>
                      {t.name}{" "}
                      <span className="ml-2 text-xs font-normal text-crm-muted">
                        ({t._count?.users ?? 0} user{(t._count?.users ?? 0) === 1 ? "" : "s"})
                      </span>
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditing(t)}
                        className="rounded p-1.5 text-crm-muted hover:bg-crm-panel hover:text-crm-text"
                        aria-label="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteTemplate(t)}
                        className="rounded p-1.5 text-crm-muted hover:bg-red-50 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardBody>
                  <p className="mb-2 text-xs uppercase tracking-wider text-crm-muted">
                    {t.matrix.length} module(s) configured
                  </p>
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-3">
                    {t.matrix.map((row) => (
                      <li key={row.module}>
                        <span className="font-medium">{row.module}:</span>{" "}
                        <span className="text-crm-muted">{row.actions.join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      )}

      <TemplateEditorModal
        open={creating || !!editing}
        initial={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          refresh();
        }}
      />
    </div>
  );
}

function TemplateEditorModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [matrix, setMatrix] = useState<ModulePermRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setMatrix(initial?.matrix ?? []);
  }, [open, initial]);

  async function save() {
    if (!name.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (matrix.length === 0) {
      toast.error("Add at least one module to the matrix");
      return;
    }
    setSaving(true);
    try {
      const url = initial
        ? `/api/settings/permission-templates/${initial.id}`
        : "/api/settings/permission-templates";
      const method = initial ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, matrix }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");
      toast.success(initial ? "Template updated" : "Template created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? `Edit: ${initial.name}` : "New permission template"}
      width="max-w-5xl"
    >
      <div className="mb-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-crm-text">Name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sales Manager, Junior Rep, Read-only Auditor"
            className="max-w-md"
          />
        </label>
      </div>
      <PermissionMatrixEditor value={matrix} onChange={setMatrix} />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : initial ? "Save changes" : "Create"}
        </Button>
      </div>
    </Modal>
  );
}
