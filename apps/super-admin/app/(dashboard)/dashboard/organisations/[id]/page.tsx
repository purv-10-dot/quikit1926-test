"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import {
  ArrowLeft,
  Loader2,
  Users,
  FolderTree,
  AppWindow,
  UserPlus,
  Pencil,
  Save,
  Trash2,
  Ban,
  Power,
  UserMinus,
  Check,
  X,
} from "lucide-react";

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  plan: string;
  brandColor: string | null;
  logoUrl: string | null;
  billingEmail: string | null;
  createdAt: string;
  memberCount: number;
  teamCount: number;
  appCount: number;
  admins: {
    membershipId: string;
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar: string | null;
    role: string;
    status: string;
  }[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function OrgDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", status: "", plan: "", brandColor: "" });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteForm, setInviteForm] = useState({ email: "", firstName: "", lastName: "" });

  // App access state
  const [appAccessApps, setAppAccessApps] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [appAccessMatrix, setAppAccessMatrix] = useState<{
    userId: string; firstName: string; lastName: string; email: string;
    avatar: string | null; role: string; status: string;
    apps: { appId: string; appName: string; appSlug: string; hasAccess: boolean }[];
  }[]>([]);
  const [appAccessLoading, setAppAccessLoading] = useState(true);
  const [togglingAccess, setTogglingAccess] = useState<string | null>(null);

  async function fetchOrg() {
    const res = await fetch(`/api/organisations/${params.id}`);
    const json = await res.json();
    if (json.success) {
      setOrg(json.data);
      setEditForm({
        name: json.data.name,
        description: json.data.description || "",
        status: json.data.status,
        plan: json.data.plan,
        brandColor: json.data.brandColor || "#6366f1",
      });
    }
    setLoading(false);
  }

  async function fetchAppAccess() {
    setAppAccessLoading(true);
    const res = await fetch(`/api/organisations/${params.id}/apps`);
    const json = await res.json();
    if (json.success) {
      setAppAccessApps(json.data.apps);
      setAppAccessMatrix(json.data.matrix);
    }
    setAppAccessLoading(false);
  }

  async function toggleAppAccess(userId: string, appId: string, currentlyHasAccess: boolean) {
    const key = `${userId}:${appId}`;
    setTogglingAccess(key);

    await fetch(`/api/organisations/${params.id}/apps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        appId,
        action: currentlyHasAccess ? "revoke" : "grant",
      }),
    });

    setAppAccessMatrix((prev) =>
      prev.map((row) => {
        if (row.userId !== userId) return row;
        return {
          ...row,
          apps: row.apps.map((a) =>
            a.appId === appId ? { ...a, hasAccess: !currentlyHasAccess } : a
          ),
        };
      })
    );
    setTogglingAccess(null);
  }

  useEffect(() => {
    fetchOrg();
    fetchAppAccess();
  }, [params.id]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/organisations/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name,
        description: editForm.description || null,
        status: editForm.status,
        plan: editForm.plan,
        brandColor: editForm.brandColor,
      }),
    });
    await fetchOrg();
    setEditing(false);
    setSaving(false);
  }

  async function handleDeactivateOrg() {
    if (!confirm(`Deactivate "${org?.name}"? Members will lose access.`)) return;
    await fetch(`/api/organisations/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "inactive" }),
    });
    await fetchOrg();
  }

  async function handleActivateOrg() {
    await fetch(`/api/organisations/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    await fetchOrg();
  }

  async function handleDeleteOrg() {
    if (!confirm(`PERMANENTLY DELETE "${org?.name}"? This removes all members, teams, and data. This cannot be undone.`)) return;
    if (!confirm(`Are you absolutely sure? This action is irreversible.`)) return;
    const res = await fetch(`/api/organisations/${params.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) {
      router.push("/dashboard/organisations");
    } else {
      alert(json.error || "Failed to delete");
    }
  }

  async function handleDeactivateAdmin(membershipId: string) {
    if (!confirm("Deactivate this admin? They will lose access to this organisation.")) return;
    await fetch(`/api/organisations/${params.id}/admins/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "inactive" }),
    });
    await fetchOrg();
  }

  async function handleActivateAdmin(membershipId: string) {
    await fetch(`/api/organisations/${params.id}/admins/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    await fetchOrg();
  }

  async function handleRemoveAdmin(membershipId: string) {
    if (!confirm("Permanently remove this admin from the organisation? This cannot be undone.")) return;
    await fetch(`/api/organisations/${params.id}/admins/${membershipId}`, { method: "DELETE" });
    await fetchOrg();
  }

  async function handleInviteAdmin(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError("");

    const res = await fetch(`/api/organisations/${params.id}/invite-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inviteForm),
    });

    const json = await res.json();
    if (json.success) {
      setInviteOpen(false);
      setInviteForm({ email: "", firstName: "", lastName: "" });
      fetchOrg();
    } else {
      setInviteError(json.error || "Failed to send invitation");
    }
    setInviting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-text-tertiary)]" />
      </div>
    );
  }

  if (!org) {
    return <p className="text-[var(--color-text-secondary)]">Organisation not found</p>;
  }

  return (
    <div>
      <button
        onClick={() => router.push("/dashboard/organisations")}
        className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Organisations
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Org info card */}
        <Card className="lg:col-span-1">
          {editing ? (
            <div className="space-y-4">
              <Input
                id="edit-name"
                label="Name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--color-text-primary)]">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-[var(--color-text-primary)]">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-[var(--color-text-primary)]">Plan</label>
                  <select
                    value={editForm.plan}
                    onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                  >
                    <option value="startup">Startup</option>
                    <option value="growth">Growth</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--color-text-primary)]">Brand Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editForm.brandColor}
                    onChange={(e) => setEditForm({ ...editForm, brandColor: e.target.value })}
                    className="h-10 w-10 rounded-lg border border-[var(--color-border)] cursor-pointer"
                  />
                  <span className="text-sm text-[var(--color-text-secondary)]">{editForm.brandColor}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} loading={saving}>
                  <Save className="h-3.5 w-3.5" /> Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="h-12 w-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: org.brandColor || "#6366f1" }}
                >
                  {org.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                    {org.name}
                  </h2>
                  <p className="text-xs text-[var(--color-text-tertiary)]">{org.slug}</p>
                </div>
              </div>
              {org.description && (
                <p className="text-sm text-[var(--color-text-secondary)] mb-4">{org.description}</p>
              )}
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-tertiary)]">Status</span>
                  <Badge variant={org.status === "active" ? "active" : "inactive"}>{org.status}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-tertiary)]">Plan</span>
                  <span className="text-[var(--color-text-primary)] capitalize">{org.plan}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-tertiary)]">Created</span>
                  <span className="text-[var(--color-text-primary)]">{formatDate(org.createdAt)}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                {org.status === "active" ? (
                  <Button size="sm" variant="outline" onClick={handleDeactivateOrg}>
                    <Ban className="h-3.5 w-3.5" /> Deactivate Org
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={handleActivateOrg}>
                    <Power className="h-3.5 w-3.5" /> Activate Org
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={handleDeleteOrg}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete Org
                </Button>
              </div>
            </>
          )}
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="text-center py-4">
              <Users className="h-5 w-5 mx-auto text-[var(--color-secondary)] mb-1" />
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">{org.memberCount}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Members</p>
            </Card>
            <Card className="text-center py-4">
              <FolderTree className="h-5 w-5 mx-auto text-[var(--color-success)] mb-1" />
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">{org.teamCount}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Teams</p>
            </Card>
            <Card className="text-center py-4">
              <AppWindow className="h-5 w-5 mx-auto text-purple-500 mb-1" />
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">{org.appCount}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Apps</p>
            </Card>
          </div>

          {/* Admins */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Admins ({org.admins.length})
              </h3>
              <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" /> Invite Admin
              </Button>
            </div>
            {org.admins.length > 0 ? (
              <div className="space-y-2">
                {org.admins.map((admin) => (
                  <div
                    key={admin.membershipId}
                    className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar src={admin.avatar} firstName={admin.firstName} lastName={admin.lastName} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                          {admin.firstName} {admin.lastName}
                        </p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">{admin.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={admin.role as React.ComponentProps<typeof Badge>["variant"]}>{admin.role}</Badge>
                      <Badge variant={admin.status as React.ComponentProps<typeof Badge>["variant"]}>{admin.status}</Badge>
                      {admin.status === "active" ? (
                        <button
                          onClick={() => handleDeactivateAdmin(admin.membershipId)}
                          title="Deactivate"
                          className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-warning)] hover:bg-[var(--color-warning-light)] transition-colors"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActivateAdmin(admin.membershipId)}
                          title="Activate"
                          className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-success)] hover:bg-[var(--color-success-light)] transition-colors"
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveAdmin(admin.membershipId)}
                        title="Remove from org"
                        className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-tertiary)]">
                No admins yet. Invite one to get started.
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* App Access Grid */}
      <Card className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              App Access
            </h3>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              Manage which apps each member can access in {org.name}
            </p>
          </div>
        </div>
        {appAccessLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-text-tertiary)]" />
          </div>
        ) : appAccessApps.length === 0 ? (
          <p className="text-sm text-[var(--color-text-tertiary)] text-center py-6">
            No apps registered on the platform
          </p>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                  <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-6 py-2.5">
                    Member
                  </th>
                  {appAccessApps.map((app) => (
                    <th key={app.id} className="text-center text-xs font-medium text-[var(--color-text-secondary)] px-4 py-2.5 min-w-[110px]">
                      {app.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {appAccessMatrix.map((row) => (
                  <tr key={row.userId} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-colors">
                    <td className="px-6 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar src={row.avatar} firstName={row.firstName} lastName={row.lastName} size="sm" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-[var(--color-text-primary)]">
                              {row.firstName} {row.lastName}
                            </p>
                            {row.status === "invited" && <Badge variant="invited">invited</Badge>}
                          </div>
                          <p className="text-xs text-[var(--color-text-tertiary)]">{row.email}</p>
                        </div>
                      </div>
                    </td>
                    {row.apps.map((appAccess) => {
                      const key = `${row.userId}:${appAccess.appId}`;
                      const isToggling = togglingAccess === key;
                      return (
                        <td key={appAccess.appId} className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => toggleAppAccess(row.userId, appAccess.appId, appAccess.hasAccess)}
                            disabled={isToggling}
                            className={`inline-flex items-center justify-center h-7 w-7 rounded-lg transition-colors ${
                              appAccess.hasAccess
                                ? "bg-[var(--color-success-light)] text-[var(--color-success)] hover:bg-[var(--color-success)] hover:text-white"
                                : "bg-[var(--color-neutral-100)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-neutral-200)]"
                            }`}
                          >
                            {isToggling ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : appAccess.hasAccess ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {appAccessMatrix.length === 0 && (
                  <tr>
                    <td colSpan={appAccessApps.length + 1} className="px-6 py-8 text-center text-sm text-[var(--color-text-tertiary)]">
                      No members in this organisation
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Invite admin modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Admin">
        <form onSubmit={handleInviteAdmin} className="space-y-4">
          <Input
            id="admin-email"
            label="Email"
            type="email"
            placeholder="admin@company.com"
            value={inviteForm.email}
            onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="admin-first"
              label="First Name"
              placeholder="Jane"
              value={inviteForm.firstName}
              onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
              required
            />
            <Input
              id="admin-last"
              label="Last Name"
              placeholder="Smith"
              value={inviteForm.lastName}
              onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
              required
            />
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            This person will be invited as an <strong>Admin</strong> for {org?.name}.
          </p>
          {inviteError && (
            <p className="text-sm text-[var(--color-danger)]">{inviteError}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={inviting}>
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
