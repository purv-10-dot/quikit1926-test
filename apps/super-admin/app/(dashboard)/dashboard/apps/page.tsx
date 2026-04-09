"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import {
  AppWindow,
  Plus,
  ChevronRight,
  Loader2,
  Users,
  Globe,
} from "lucide-react";

interface AppRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  baseUrl: string;
  iconUrl: string | null;
  status: string;
  accessCount: number;
  createdAt: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AppsPage() {
  const router = useRouter();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    baseUrl: "",
    iconUrl: "",
  });

  async function fetchApps() {
    const res = await fetch("/api/apps");
    const json = await res.json();
    if (json.success) setApps(json.data);
    setLoading(false);
  }

  useEffect(() => {
    fetchApps();
  }, []);

  function handleNameChange(name: string) {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-");
    setForm({ ...form, name, slug });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");

    const res = await fetch("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const json = await res.json();
    if (json.success) {
      setCreateOpen(false);
      setForm({ name: "", slug: "", description: "", baseUrl: "", iconUrl: "" });
      fetchApps();
    } else {
      setCreateError(json.error || "Failed to create app");
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
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Apps</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {apps.length} app{apps.length !== 1 ? "s" : ""} registered on the platform
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Register App
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                App
              </th>
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Base URL
              </th>
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Status
              </th>
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Access
              </th>
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Created
              </th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr
                key={app.id}
                className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-colors cursor-pointer"
                onClick={() => router.push(`/dashboard/apps/${app.id}`)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-[var(--color-secondary-light)] shrink-0">
                      <AppWindow className="h-4 w-4 text-[var(--color-secondary)]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {app.name}
                      </p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">{app.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)]">
                    <Globe className="h-3.5 w-3.5" />
                    {app.baseUrl}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={app.status === "active" ? "active" : "inactive"}>
                    {app.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)]">
                    <Users className="h-3.5 w-3.5" /> {app.accessCount}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-[var(--color-text-tertiary)]">
                    {formatDate(app.createdAt)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <ChevronRight className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                </td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <AppWindow className="h-10 w-10 mx-auto text-[var(--color-text-tertiary)] mb-3" />
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    No apps registered yet
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Register App">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            id="app-name"
            label="App Name"
            placeholder="e.g. Project Tracker"
            value={form.name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
          />
          <Input
            id="app-slug"
            label="Slug"
            placeholder="project-tracker"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            required
          />
          <Input
            id="app-url"
            label="Base URL"
            placeholder="https://tracker.quikit.app"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            required
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--color-text-primary)]">
              Description
            </label>
            <textarea
              placeholder="What does this app do?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] resize-none"
            />
          </div>
          <Input
            id="app-icon"
            label="Icon URL (optional)"
            placeholder="https://example.com/icon.png"
            value={form.iconUrl}
            onChange={(e) => setForm({ ...form, iconUrl: e.target.value })}
          />
          {createError && (
            <p className="text-sm text-[var(--color-danger)]">{createError}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Register App
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
