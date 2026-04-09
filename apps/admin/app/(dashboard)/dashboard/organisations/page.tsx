"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/utils";
import {
  Building2,
  Plus,
  Search,
  Users,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface Org {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  plan: string;
  brandColor: string | null;
  memberCount: number;
  createdAt: string;
}

const PLAN_OPTIONS = [
  { value: "startup", label: "Startup" },
  { value: "growth", label: "Growth" },
  { value: "enterprise", label: "Enterprise" },
];

export default function OrganisationsPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    plan: "startup",
    brandColor: "#6366f1",
  });

  async function fetchOrgs() {
    const url = search
      ? `/api/organisations?search=${encodeURIComponent(search)}`
      : "/api/organisations";
    const res = await fetch(url);
    const json = await res.json();
    if (json.success) setOrgs(json.data);
    setLoading(false);
  }

  useEffect(() => {
    fetchOrgs();
  }, [search]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");

    const res = await fetch("/api/organisations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const json = await res.json();
    if (json.success) {
      setCreateOpen(false);
      setForm({ name: "", description: "", plan: "startup", brandColor: "#6366f1" });
      fetchOrgs();
    } else {
      setCreateError(json.error || "Failed to create organisation");
    }
    setCreating(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-text-tertiary)]" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Organisations</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {orgs.length} organisation{orgs.length !== 1 ? "s" : ""} on the platform
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create Organisation
        </Button>
      </div>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            placeholder="Search organisations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
          />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Organisation
              </th>
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Status
              </th>
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Plan
              </th>
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Members
              </th>
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Created
              </th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr
                key={org.id}
                className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-colors cursor-pointer"
                onClick={() => router.push(`/dashboard/organisations/${org.id}`)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                      style={{ backgroundColor: org.brandColor || "#6366f1" }}
                    >
                      {org.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {org.name}
                      </p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">{org.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={org.status === "active" ? "active" : "inactive"}>
                    {org.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-[var(--color-text-secondary)] capitalize">
                    {org.plan}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)]">
                    <Users className="h-3.5 w-3.5" /> {org.memberCount}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-[var(--color-text-tertiary)]">
                    {formatDate(org.createdAt)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <ChevronRight className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                </td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <Building2 className="h-10 w-10 mx-auto text-[var(--color-text-tertiary)] mb-3" />
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    No organisations found
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Organisation">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            id="org-name"
            label="Organisation Name"
            placeholder="e.g. Acme Corp"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--color-text-primary)]">
              Description
            </label>
            <textarea
              placeholder="What does this organisation do?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                Plan
              </label>
              <select
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
              >
                {PLAN_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                Brand Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.brandColor}
                  onChange={(e) => setForm({ ...form, brandColor: e.target.value })}
                  className="h-10 w-10 rounded-lg border border-[var(--color-border)] cursor-pointer"
                />
                <span className="text-sm text-[var(--color-text-secondary)]">{form.brandColor}</span>
              </div>
            </div>
          </div>
          {createError && (
            <p className="text-sm text-[var(--color-danger)]">{createError}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create Organisation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
