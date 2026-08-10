"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface Group {
  id: string;
  name: string;
  _count: { members: number; managers: number; accounts: number };
}

export default function SalesGroupsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/sales-groups", { credentials: "include" });
      const j = await res.json();
      setItems(Array.isArray(j?.items) ? j.items : []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function deleteGroup(g: Group) {
    if (!confirm(`Delete sales group "${g.name}"? Members and accounts will be detached.`)) return;
    const res = await fetch(`/api/settings/sales-groups/${g.id}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || "Delete failed");
    } else {
      toast.success("Group deleted");
      refresh();
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-crm-text">Sales Groups</h1>
          <p className="text-sm text-crm-muted">Account-level ACL grouping. Click a group to manage members and accounts.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> New group
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
                  <TH className="text-right">Members</TH>
                  <TH className="text-right">Managers</TH>
                  <TH className="text-right">Accounts</TH>
                  <TH className="w-12"></TH>
                </TR>
              </THead>
              <TBody>
                {items.length === 0 ? (
                  <TR>
                    <TD colSpan={5} className="py-8 text-center text-crm-muted">
                      No sales groups yet.
                    </TD>
                  </TR>
                ) : (
                  items.map((g) => (
                    <TR key={g.id}>
                      <TD className="font-medium">
                        <Link href={`/settings/sales-groups/${g.id}`} className="crm-link">
                          {g.name}
                        </Link>
                      </TD>
                      <TD className="text-right">{g._count.members}</TD>
                      <TD className="text-right">{g._count.managers}</TD>
                      <TD className="text-right">{g._count.accounts}</TD>
                      <TD>
                        <button
                          onClick={() => deleteGroup(g)}
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

      <CreateGroupModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={refresh} />
    </div>
  );
}

function CreateGroupModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return toast.error("Name required");
    setSaving(true);
    try {
      const res = await fetch("/api/settings/sales-groups", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      toast.success("Group created");
      onCreated();
      setName("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New sales group">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" autoFocus />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={saving || !name.trim()}>
          {saving ? "Creating…" : "Create"}
        </Button>
      </div>
    </Modal>
  );
}
