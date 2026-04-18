"use client";

/**
 * Super Admin: Organization Detail — /organizations/:id
 *
 * View and manage a single tenant. Edit info, suspend, view members and stats.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Pencil, Users, Layers, AppWindow, Plus } from "lucide-react";
import { SlidePanel, EmptyState, Select, Skeleton, CardSkeleton, useConfirm } from "@quikit/ui";
import { HealthPanel } from "./components/HealthPanel";
import { AppAccessPanel } from "./components/AppAccessPanel";
import { BillingPanel } from "./components/BillingPanel";
import { AnalyticsPanel } from "./components/AnalyticsPanel";
import { ImpersonatePanel } from "./components/ImpersonatePanel";

interface MemberInfo {
  id: string;
  role: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  billingEmail: string | null;
  createdAt: string;
  _count: { users: number; teams: number; userAppAccess: number };
  users: MemberInfo[];
}

const PLANS = ["startup", "growth", "enterprise"];

const planBadge: Record<string, string> = {
  startup: "bg-indigo-50 text-indigo-700",
  growth: "bg-purple-50 text-purple-700",
  enterprise: "bg-amber-50 text-amber-700",
};

const roleBadge: Record<string, string> = {
  admin: "bg-purple-50 text-purple-700",
  team_head: "bg-indigo-50 text-indigo-700",
  member: "bg-gray-100 text-gray-600",
};

export default function OrgDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const confirm = useConfirm();

  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Inline edit
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", plan: "", billingEmail: "" });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Add member
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({ email: "", firstName: "", lastName: "", role: "admin", password: "" });
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState("");

  const fetchOrg = useCallback(() => {
    setLoading(true);
    fetch(`/api/super/orgs/${orgId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setOrg(j.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  function startEdit() {
    if (!org) return;
    setEditForm({ name: org.name, plan: org.plan, billingEmail: org.billingEmail || "" });
    setEditError("");
    setEditMode(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/super/orgs/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to update");
      setEditMode(false);
      fetchOrg();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSuspend() {
    if (!org) return;
    if (!(await confirm({ title: `Suspend "${org.name}"?`, description: "This will disable access for all members of the organization until it is restored.", confirmLabel: "Suspend", tone: "danger" }))) return;
    try {
      const res = await fetch(`/api/super/orgs/${orgId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to suspend");
      fetchOrg();
    } catch {
      // silent
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setAddingMember(true);
    setMemberError("");
    try {
      const res = await fetch(`/api/super/orgs/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(memberForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to add member");
      setAddMemberOpen(false);
      setMemberForm({ email: "", firstName: "", lastName: "", role: "admin", password: "" });
      fetchOrg();
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 md:p-10 space-y-6">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-8 w-72" />
        </div>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="p-6">
        <Link href="/organizations" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Organizations
        </Link>
        <EmptyState icon={Building2} message="Organization not found." />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-10">
      {/* Back link */}
      <Link href="/organizations" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" /> Organizations
      </Link>

      {/* Title area */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 md:mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">{org.name}</h1>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${planBadge[org.plan] || "bg-gray-100 text-gray-600"}`}>
            {org.plan}
          </span>
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${
            org.status === "active" ? "bg-green-50 text-green-700" : org.status === "suspended" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-600"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              org.status === "active" ? "bg-green-500" : org.status === "suspended" ? "bg-red-500" : "bg-gray-400"
            }`} />
            {org.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Info card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Organization Info</h2>
              {!editMode && (
                <button onClick={startEdit} className="px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                  Edit
                </button>
              )}
            </div>
            <div className="px-5 py-4">
              {editMode ? (
                <form onSubmit={handleSave} className="space-y-4">
                  {editError && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Name</label>
                    <input
                      type="text"
                      required
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <Select
                      label="Plan"
                      value={editForm.plan}
                      onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                      options={[
                        { value: "startup", label: "Startup" },
                        { value: "growth", label: "Growth" },
                        { value: "enterprise", label: "Enterprise" },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Billing Email</label>
                    <input
                      type="email"
                      value={editForm.billingEmail}
                      onChange={(e) => setEditForm({ ...editForm, billingEmail: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button type="button" onClick={() => setEditMode(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                      Cancel
                    </button>
                    <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors">
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-y-4">
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Name</p>
                      <p className="text-sm text-gray-900 mt-1">{org.name}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Slug</p>
                      <p className="text-sm text-gray-900 font-mono mt-1">{org.slug}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Plan</p>
                      <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium capitalize mt-1 ${planBadge[org.plan] || "bg-gray-100 text-gray-600"}`}>
                        {org.plan}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</p>
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize mt-1 ${
                        org.status === "active" ? "bg-green-50 text-green-700" : org.status === "suspended" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          org.status === "active" ? "bg-green-500" : org.status === "suspended" ? "bg-red-500" : "bg-gray-400"
                        }`} />
                        {org.status}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Billing Email</p>
                      <p className="text-sm text-gray-900 mt-1">{org.billingEmail || "Not set"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</p>
                      <p className="text-sm text-gray-900 mt-1">{new Date(org.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {org.status === "active" && (
                    <button
                      onClick={handleSuspend}
                      className="mt-5 w-full px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Suspend Organization
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Stats + Members */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Stats</h2>
            </div>
            <div className="px-5 py-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Users className="h-5 w-5 text-indigo-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{org._count.users}</p>
                  <p className="text-xs font-medium text-gray-500 mt-0.5">Members</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Layers className="h-5 w-5 text-purple-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{org._count.teams}</p>
                  <p className="text-xs font-medium text-gray-500 mt-0.5">Teams</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <AppWindow className="h-5 w-5 text-amber-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{org._count.userAppAccess}</p>
                  <p className="text-xs font-medium text-gray-500 mt-0.5">App Access</p>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Members */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-900">Recent Members</h2>
                <span className="text-xs text-gray-400">{org.users.length} total</span>
              </div>
              <button
                onClick={() => setAddMemberOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Member
              </button>
            </div>
            {org.users.length === 0 ? (
              <EmptyState icon={Users} message="No members yet." />
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {org.users.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-sm text-gray-900 font-medium">{m.user.firstName} {m.user.lastName}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">{m.user.email}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${roleBadge[m.role] || "bg-gray-100 text-gray-600"}`}>
                          {m.role.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SA Phase B/C/D panels */}
      <div className="mt-6 space-y-6">
        <HealthPanel tenantId={orgId} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AppAccessPanel tenantId={orgId} />
          <BillingPanel tenantId={orgId} />
        </div>
        <ImpersonatePanel tenantId={orgId} members={org.users} />
        <AnalyticsPanel tenantId={orgId} />
      </div>

      {/* Add Member slide-in panel */}
      <SlidePanel
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        title="Add Member"
        subtitle={`Invite a user to ${org.name}`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddMemberOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-member-form"
              disabled={addingMember}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {addingMember ? "Adding..." : "Add Member"}
            </button>
          </div>
        }
      >
        <form id="add-member-form" onSubmit={handleAddMember} className="space-y-5">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Email <span className="text-red-400">*</span></label>
            <input
              type="email"
              required
              placeholder="user@example.com"
              value={memberForm.email}
              onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">First Name <span className="text-red-400">*</span></label>
              <input
                required
                placeholder="John"
                value={memberForm.firstName}
                onChange={(e) => setMemberForm({ ...memberForm, firstName: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Last Name <span className="text-red-400">*</span></label>
              <input
                required
                placeholder="Doe"
                value={memberForm.lastName}
                onChange={(e) => setMemberForm({ ...memberForm, lastName: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
              />
            </div>
          </div>
          <div>
            <Select
              label="Role"
              value={memberForm.role}
              onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}
              options={[
                { value: "owner", label: "Owner" },
                { value: "admin", label: "Admin" },
                { value: "member", label: "Member" },
                { value: "viewer", label: "Viewer" },
              ]}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Password <span className="text-gray-400">(optional — auto-generated if empty)</span></label>
            <input
              type="password"
              placeholder="Leave empty to auto-generate"
              value={memberForm.password}
              onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
            />
          </div>
          {memberError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{memberError}</p>
          )}
        </form>
      </SlidePanel>
    </div>
  );
}
