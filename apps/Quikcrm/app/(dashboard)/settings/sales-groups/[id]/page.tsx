"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, X, UserPlus, Building2 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";
import { AccountPicker } from "@/components/settings/account-picker";

interface GroupDetail {
  id: string;
  name: string;
  members: { user: { id: string; firstName: string; lastName: string; email: string } }[];
  managers: { user: { id: string; firstName: string; lastName: string; email: string } }[];
  accounts: { account: { id: string; name: string } }[];
}

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export default function SalesGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [addAccountsOpen, setAddAccountsOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [g, u] = await Promise.all([
      fetch(`/api/settings/sales-groups/${id}`, { credentials: "include" }).then((r) => r.json()),
      fetch("/api/settings/users?pageSize=200", { credentials: "include" }).then((r) => r.json()),
    ]);
    setGroup(g);
    setUsers(Array.isArray(u?.items) ? u.items : []);
  }, [id]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function removeMember(userId: string, asManager: boolean) {
    const res = await fetch(
      `/api/settings/sales-groups/${id}/members?userId=${userId}&asManager=${asManager}`,
      { method: "DELETE", credentials: "include" },
    );
    if (!res.ok) {
      toast.error("Remove failed");
      return;
    }
    refresh();
  }
  async function removeAccount(accountId: string) {
    const res = await fetch(`/api/settings/sales-groups/${id}/accounts?accountId=${accountId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error("Remove failed");
      return;
    }
    refresh();
  }

  if (!group) return <p className="text-sm text-crm-muted">Loading…</p>;

  const memberIds = new Set(group.members.map((m) => m.user.id));
  const managerIds = new Set(group.managers.map((m) => m.user.id));

  return (
    <div>
      <Link
        href="/settings/sales-groups"
        className="mb-3 inline-flex items-center gap-1 text-sm text-crm-blue hover:underline"
      >
        <ChevronLeft size={14} /> All sales groups
      </Link>
      <h1 className="mb-4 text-xl font-semibold text-crm-text">{group.name}</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Members ({group.members.length})</CardTitle>
              <Button variant="secondary" onClick={() => setAddMembersOpen(true)}>
                <UserPlus size={14} /> Add
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            {group.members.length === 0 ? (
              <p className="text-sm text-crm-muted">No members.</p>
            ) : (
              <ul className="divide-y divide-crm-border">
                {group.members.map((m) => (
                  <li key={m.user.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span>{m.user.firstName} {m.user.lastName}</span>
                    <button onClick={() => removeMember(m.user.id, false)} className="rounded p-1 text-crm-muted hover:bg-red-50 hover:text-red-600">
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Managers ({group.managers.length})</CardTitle>
          </CardHeader>
          <CardBody>
            {group.managers.length === 0 ? (
              <p className="text-sm text-crm-muted">No managers.</p>
            ) : (
              <ul className="divide-y divide-crm-border">
                {group.managers.map((m) => (
                  <li key={m.user.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span>{m.user.firstName} {m.user.lastName}</span>
                    <button onClick={() => removeMember(m.user.id, true)} className="rounded p-1 text-crm-muted hover:bg-red-50 hover:text-red-600">
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Accounts ({group.accounts.length})</CardTitle>
              <Button variant="secondary" onClick={() => setAddAccountsOpen(true)}>
                <Building2 size={14} /> Add
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            {group.accounts.length === 0 ? (
              <p className="text-sm text-crm-muted">No accounts attached. ACL is open.</p>
            ) : (
              <ul className="divide-y divide-crm-border">
                {group.accounts.map((a) => (
                  <li key={a.account.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span>{a.account.name}</span>
                    <button onClick={() => removeAccount(a.account.id)} className="rounded p-1 text-crm-muted hover:bg-red-50 hover:text-red-600">
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {addMembersOpen && (
        <AddMembersModal
          groupId={group.id}
          users={users.filter((u) => !memberIds.has(u.id))}
          managerCandidates={users.filter((u) => !managerIds.has(u.id))}
          onClose={() => setAddMembersOpen(false)}
          onSaved={() => {
            refresh();
            setAddMembersOpen(false);
          }}
        />
      )}
      {addAccountsOpen && (
        <AddAccountsModal
          groupId={group.id}
          existing={group.accounts.map((a) => a.account.id)}
          onClose={() => setAddAccountsOpen(false)}
          onSaved={() => {
            refresh();
            setAddAccountsOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AddMembersModal({
  groupId,
  users,
  managerCandidates,
  onClose,
  onSaved,
}: {
  groupId: string;
  users: UserRow[];
  managerCandidates: UserRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (memberIds.length === 0 && managerIds.length === 0) {
      toast.error("Pick at least one user");
      return;
    }
    setSaving(true);
    try {
      if (memberIds.length > 0) {
        await fetch(`/api/settings/sales-groups/${groupId}/members`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: memberIds, asManager: false }),
        });
      }
      if (managerIds.length > 0) {
        await fetch(`/api/settings/sales-groups/${groupId}/members`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: managerIds, asManager: true }),
        });
      }
      toast.success("Added");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Add members" width="max-w-2xl">
      <div className="grid grid-cols-2 gap-3">
        <UserMultiSelect label="As members" users={users} value={memberIds} onChange={setMemberIds} />
        <UserMultiSelect label="As managers" users={managerCandidates} value={managerIds} onChange={setManagerIds} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Add"}
        </Button>
      </div>
    </Modal>
  );
}

function UserMultiSelect({
  label,
  users,
  value,
  onChange,
}: {
  label: string;
  users: UserRow[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-sm font-medium">{label}</div>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-crm-border">
        {users.length === 0 ? (
          <p className="px-3 py-3 text-sm text-crm-muted">No candidates.</p>
        ) : (
          <ul>
            {users.map((u) => (
              <li key={u.id} className="border-b border-crm-border last:border-0">
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-crm-panel">
                  <input
                    type="checkbox"
                    checked={value.includes(u.id)}
                    onChange={(e) =>
                      onChange(e.target.checked ? [...value, u.id] : value.filter((x) => x !== u.id))
                    }
                  />
                  {u.firstName} {u.lastName}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddAccountsModal({
  groupId,
  existing,
  onClose,
  onSaved,
}: {
  groupId: string;
  existing: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // Filter out already-attached accounts
  const candidates = picked.filter((id) => !existing.includes(id));

  async function save() {
    if (candidates.length === 0) return toast.error("Pick at least one new account");
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/sales-groups/${groupId}/accounts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: candidates }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Accounts added");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Add accounts to group" width="max-w-2xl">
      <AccountPicker value={picked} onChange={setPicked} />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving || candidates.length === 0}>
          {saving ? "Saving…" : `Add ${candidates.length}`}
        </Button>
      </div>
    </Modal>
  );
}
