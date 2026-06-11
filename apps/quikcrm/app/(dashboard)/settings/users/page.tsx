"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Power, KeyRound, Trash2, Pencil, Check, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  permissionTemplates: { template: { id: string; name: string } }[];
  appRoles: { role: { id: string; name: string } }[];
}

const ROLES = ["Administrator", "SalesManager", "SalesUser", "MarketingUser", "FinanceUser"];

export default function UsersPage() {
  const toast = useToast();
  const [items, setItems] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [tempPasswordModal, setTempPasswordModal] = useState<{ user: UserRow; password: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/users", { credentials: "include" });
      const json = await res.json();
      setItems(Array.isArray(json?.items) ? json.items : []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function deleteUser(u: UserRow) {
    if (!confirm(`Delete ${u.firstName} ${u.lastName}? Their owned records must be reassigned first.`)) return;
    const res = await fetch(`/api/settings/users/${u.id}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || "Delete failed");
    } else {
      toast.success("User deleted");
      refresh();
    }
  }

  async function toggleStatus(u: UserRow) {
    const action = u.status === "Active" ? "disable" : "enable";
    const res = await fetch(`/api/settings/users/${u.id}/${action}`, { method: "POST", credentials: "include" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || "Failed");
    } else {
      toast.success(`User ${action}d`);
      refresh();
    }
  }

  async function resetPassword(u: UserRow) {
    if (!confirm(`Reset password for ${u.email}? They will need to use the new temporary password.`)) return;
    const res = await fetch(`/api/settings/users/${u.id}/reset-password`, { method: "POST", credentials: "include" });
    const j = await res.json();
    if (!res.ok) {
      toast.error(j.error || "Reset failed");
      return;
    }
    setTempPasswordModal({ user: u, password: j.tempPassword });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-crm-text">Users</h1>
          <p className="text-sm text-crm-muted">Manage user access, status, and credentials.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> New user
        </Button>
      </div>

      <div className="rounded-lg border border-crm-border bg-slate-50/70 px-3 py-2 text-sm text-crm-muted">
        {items.length} user(s)
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
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH>CRM role</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((u) => (
                  <TR key={u.id}>
                    <TD className="font-medium">
                      <Link href={`/settings/users/${u.id}`} className="crm-link">
                        {u.firstName} {u.lastName}
                      </Link>
                    </TD>
                    <TD>{u.email}</TD>
                    <TD>{u.role}</TD>
                    <TD>
                      <span className={
                        "rounded-full px-2 py-0.5 text-xs " +
                        (u.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700")
                      }>
                        {u.status}
                      </span>
                    </TD>
                    <TD>
                      {u.appRoles.map((p) => p.role.name).join(", ") ||
                        u.permissionTemplates.map((p) => p.template.name).join(", ") ||
                        "—"}
                    </TD>
                    <TD className="text-right">
                      <Link
                        href={`/settings/users/${u.id}`}
                        className="mr-1 inline-block rounded p-1.5 text-crm-muted hover:bg-crm-panel hover:text-crm-text"
                        aria-label="Edit"
                      >
                        <Pencil size={14} />
                      </Link>
                      <button
                        onClick={() => resetPassword(u)}
                        className="mr-1 rounded p-1.5 text-crm-muted hover:bg-crm-panel"
                        title="Reset password"
                      >
                        <KeyRound size={14} />
                      </button>
                      <button
                        onClick={() => toggleStatus(u)}
                        className="mr-1 rounded p-1.5 text-crm-muted hover:bg-crm-panel"
                        title={u.status === "Active" ? "Disable" : "Enable"}
                      >
                        <Power size={14} />
                      </button>
                      <button
                        onClick={() => deleteUser(u)}
                        className="rounded p-1.5 text-crm-muted hover:bg-red-50 hover:text-red-600"
                        title="Delete"
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

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(tempPassword, user) => {
          if (tempPassword) setTempPasswordModal({ user: user as UserRow, password: tempPassword });
          refresh();
        }}
      />

      {tempPasswordModal && (
        <Modal open={true} onClose={() => setTempPasswordModal(null)} title="Temporary password">
          <p className="text-sm text-crm-muted">
            Share this temporary password with <strong>{tempPasswordModal.user.email}</strong>. They&apos;ll need to
            change it on first login. This is shown only once.
          </p>
          <pre className="mt-3 select-all rounded-lg border border-crm-border bg-crm-panel px-4 py-3 font-mono text-sm">
            {tempPasswordModal.password}
          </pre>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setTempPasswordModal(null)}>Done</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

interface OrgMemberSuggestion {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  status: string;
  hasQuikCrmAccess: boolean;
}

// "new"       — email not in org; full form + sign-in method + "New User Will Be Invited"
// "grant"     — existing org member without CRM access; grant access flow
// "duplicate" — existing org member already has CRM access; blocked
type ModalMode = "new" | "grant" | "duplicate";

function CreateUserModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (tempPassword: string | null, user: unknown) => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<ModalMode>("new");
  const [selectedUser, setSelectedUser] = useState<OrgMemberSuggestion | null>(null);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("SalesUser");
  const [invitationMethod, setInvitationMethod] = useState<"native" | "sso">("native");
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<OrgMemberSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function resetForm() {
    setMode("new");
    setSelectedUser(null);
    setFirst("");
    setLast("");
    setEmail("");
    setRole("SalesUser");
    setInvitationMethod("native");
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function clearSelection() {
    setMode("new");
    setSelectedUser(null);
    setFirst("");
    setLast("");
    setEmail("");
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    // Any manual typing resets a previous selection
    setMode("new");
    setSelectedUser(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/settings/users/search?email=${encodeURIComponent(value.trim())}`,
          { credentials: "include" },
        );
        const j = await res.json();
        if (j.success && Array.isArray(j.data) && j.data.length > 0) {
          setSuggestions(j.data);
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 250);
  }

  function pickSuggestion(s: OrgMemberSuggestion) {
    setEmail(s.email);
    setFirst(s.firstName ?? "");
    setLast(s.lastName ?? "");
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedUser(s);
    setMode(s.hasQuikCrmAccess ? "duplicate" : "grant");
  }

  async function submit() {
    if (mode === "duplicate") return;
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (!first.trim() || !last.trim()) {
      toast.error("First name and last name are required");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        firstName: first.trim(),
        lastName: last.trim(),
        email: email.trim(),
        role,
      };
      if (mode === "new") {
        body.invitationMethod = invitationMethod;
      }
      if (mode === "grant" && selectedUser) {
        body.linkExistingUserId = selectedUser.userId;
      }
      const res = await fetch("/api/settings/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      toast.success(mode === "grant" ? "QuikCRM access granted" : "User invited");
      onCreated(j.tempPassword ?? null, j.user);
      resetForm();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const isSelectionLocked = mode === "grant" || mode === "duplicate";

  return (
    <Modal open={open} onClose={() => { resetForm(); onClose(); }} title="New user">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label="First name *">
          <Input
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            disabled={isSelectionLocked}
            autoFocus
          />
        </Field>
        <Field label="Last name *">
          <Input
            value={last}
            onChange={(e) => setLast(e.target.value)}
            disabled={isSelectionLocked}
          />
        </Field>

        <Field label="Email *" full>
          <div className="relative">
            {isSelectionLocked ? (
              <div className="flex items-center gap-2 rounded-md border border-crm-border bg-crm-panel px-3 py-2">
                <span className="flex-1 truncate text-sm text-crm-text">{email}</span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="shrink-0 rounded p-0.5 text-crm-muted hover:bg-crm-border hover:text-crm-text"
                  title="Change email"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  autoComplete="off"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-crm-border bg-white shadow-lg">
                    {suggestions.map((s) => (
                      <button
                        key={s.userId}
                        type="button"
                        onMouseDown={() => pickSuggestion(s)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-crm-panel"
                      >
                        <span>
                          <span className="font-medium text-crm-text">
                            {s.firstName} {s.lastName}
                          </span>
                          <span className="ml-2 text-crm-muted">{s.email}</span>
                        </span>
                        {s.hasQuikCrmAccess ? (
                          <span className="ml-2 flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                            <Check size={10} /> In CRM
                          </span>
                        ) : (
                          <span className="ml-2 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                            Grant access
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </Field>

        {/* CRM Role — shown in "new" and "grant"; hidden when already in CRM */}
        {mode !== "duplicate" && (
          <Field label="CRM Role" full>
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {/* Sign-in method — only for brand-new users */}
        {mode === "new" && (
          <Field label="Sign-in method" full>
            <Select
              value={invitationMethod}
              onChange={(e) => setInvitationMethod(e.target.value as "native" | "sso")}
            >
              <option value="native">Email & password (QuikIT login)</option>
              <option value="sso">Google / Microsoft SSO</option>
            </Select>
          </Field>
        )}
      </div>

      {/* Status banners */}
      {mode === "new" && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
          <UserPlus size={13} />
          New user will be invited — a QuikIT account will be created and CRM access granted.
        </div>
      )}
      {mode === "grant" && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Existing org member — QuikCRM access will be granted without re-creating the account.
        </div>
      )}
      {mode === "duplicate" && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          This user already has QuikCRM access and cannot be invited again.
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => { resetForm(); onClose(); }}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={saving || mode === "duplicate"}>
          {saving ? "Saving…" : mode === "grant" ? "Grant access" : "Create & Invite"}
        </Button>
      </div>
    </Modal>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={"block text-sm " + (full ? "col-span-2" : "")}>
      <span className="mb-1 block font-medium text-crm-text">{label}</span>
      {children}
    </label>
  );
}
