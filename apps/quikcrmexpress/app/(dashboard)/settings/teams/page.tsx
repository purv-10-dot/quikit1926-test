"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface Team {
  id: string;
  name: string;
  managerId: string | null;
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
}

export default function TeamsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Team[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Team | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [t, u] = await Promise.all([
        fetch("/api/settings/teams", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/settings/users?pageSize=200", { credentials: "include" }).then((r) => r.json()),
      ]);
      setItems(Array.isArray(t?.items) ? t.items : []);
      setUsers(Array.isArray(u?.items) ? u.items : []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const userById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  async function deleteTeam(t: Team) {
    if (!confirm(`Delete team "${t.name}"?`)) return;
    const res = await fetch(`/api/settings/teams/${t.id}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || "Delete failed");
    } else {
      toast.success("Team deleted");
      refresh();
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-crm-text">Teams</h1>
          <p className="text-sm text-crm-muted">{items.length} team(s)</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={14} /> New team
        </Button>
      </div>
      <Card>
        <CardBody className="p-0">
          {loading ? (
            <p className="p-8 text-center text-sm text-crm-muted">Loading…</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Manager</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {items.length === 0 ? (
                  <TR>
                    <TD colSpan={3} className="py-8 text-center text-crm-muted">
                      No teams yet.
                    </TD>
                  </TR>
                ) : (
                  items.map((t) => (
                    <TR key={t.id}>
                      <TD className="font-medium">{t.name}</TD>
                      <TD>{t.managerId ? userById.get(t.managerId) || t.managerId : "—"}</TD>
                      <TD className="text-right">
                        <button
                          onClick={() => setEditing(t)}
                          className="mr-1 rounded p-1.5 text-crm-muted hover:bg-crm-panel hover:text-crm-text"
                          aria-label="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => deleteTeam(t)}
                          className="rounded p-1.5 text-crm-muted hover:bg-red-50 hover:text-red-600"
                          aria-label="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <TeamEditorModal
        open={creating || !!editing}
        initial={editing}
        users={users}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={refresh}
      />
    </div>
  );
}

function TeamEditorModal({
  open,
  initial,
  users,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Team | null;
  users: UserOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setManagerId(initial?.managerId ?? "");
  }, [open, initial]);

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const url = initial ? `/api/settings/teams/${initial.id}` : "/api/settings/teams";
      const method = initial ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, managerId: managerId || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");
      toast.success(initial ? "Team updated" : "Team created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Edit: ${initial.name}` : "New team"}>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium">Name *</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Manager</span>
          <Select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="">— Unassigned —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
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
