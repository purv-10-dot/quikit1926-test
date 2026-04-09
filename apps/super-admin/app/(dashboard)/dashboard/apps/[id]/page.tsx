"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  AppWindow,
  Pencil,
  Save,
  Trash2,
  Globe,
  Users,
} from "lucide-react";

interface AppDetail {
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

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [app, setApp] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    baseUrl: "",
    iconUrl: "",
    status: "",
  });

  async function fetchApp() {
    const res = await fetch(`/api/apps/${params.id}`);
    const json = await res.json();
    if (json.success) {
      setApp(json.data);
      setEditForm({
        name: json.data.name,
        description: json.data.description || "",
        baseUrl: json.data.baseUrl,
        iconUrl: json.data.iconUrl || "",
        status: json.data.status,
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchApp();
  }, [params.id]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/apps/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name,
        description: editForm.description || null,
        baseUrl: editForm.baseUrl,
        iconUrl: editForm.iconUrl || null,
        status: editForm.status,
      }),
    });
    await fetchApp();
    setEditing(false);
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm(`PERMANENTLY DELETE "${app?.name}"? This will revoke all user access. This cannot be undone.`)) return;
    const res = await fetch(`/api/apps/${params.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) {
      router.push("/dashboard/apps");
    } else {
      alert(json.error || "Failed to delete");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-text-tertiary)]" />
      </div>
    );
  }

  if (!app) {
    return <p className="text-[var(--color-text-secondary)]">App not found</p>;
  }

  return (
    <div>
      <button
        onClick={() => router.push("/dashboard/apps")}
        className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Apps
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          {editing ? (
            <div className="space-y-4">
              <Input
                id="edit-name"
                label="Name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
              <Input
                id="edit-url"
                label="Base URL"
                value={editForm.baseUrl}
                onChange={(e) => setEditForm({ ...editForm, baseUrl: e.target.value })}
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
              <Input
                id="edit-icon"
                label="Icon URL"
                value={editForm.iconUrl}
                onChange={(e) => setEditForm({ ...editForm, iconUrl: e.target.value })}
              />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--color-text-primary)]">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
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
                <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-[var(--color-secondary-light)]">
                  <AppWindow className="h-6 w-6 text-[var(--color-secondary)]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                    {app.name}
                  </h2>
                  <p className="text-xs text-[var(--color-text-tertiary)]">{app.slug}</p>
                </div>
              </div>
              {app.description && (
                <p className="text-sm text-[var(--color-text-secondary)] mb-4">{app.description}</p>
              )}
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-tertiary)]">Status</span>
                  <Badge variant={app.status === "active" ? "active" : "inactive"}>{app.status}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-text-tertiary)]">Base URL</span>
                  <span className="flex items-center gap-1 text-[var(--color-text-primary)]">
                    <Globe className="h-3.5 w-3.5" />
                    {app.baseUrl}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-tertiary)]">Users with Access</span>
                  <span className="flex items-center gap-1 text-[var(--color-text-primary)]">
                    <Users className="h-3.5 w-3.5" />
                    {app.accessCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-tertiary)]">Created</span>
                  <span className="text-[var(--color-text-primary)]">{formatDate(app.createdAt)}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="danger" onClick={handleDelete}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete App
                </Button>
              </div>
            </>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
            App Information
          </h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Slug</p>
              <p className="text-sm text-[var(--color-text-primary)] font-mono bg-[var(--color-bg-tertiary)] px-3 py-2 rounded-lg">
                {app.slug}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Base URL</p>
              <p className="text-sm text-[var(--color-text-primary)] font-mono bg-[var(--color-bg-tertiary)] px-3 py-2 rounded-lg">
                {app.baseUrl}
              </p>
            </div>
            {app.iconUrl && (
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Icon URL</p>
                <p className="text-sm text-[var(--color-text-primary)] font-mono bg-[var(--color-bg-tertiary)] px-3 py-2 rounded-lg break-all">
                  {app.iconUrl}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Total Access Grants</p>
              <p className="text-sm text-[var(--color-text-primary)]">
                {app.accessCount} user{app.accessCount !== 1 ? "s" : ""} across all organisations
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
