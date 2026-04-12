"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button, Input, Select } from "@quikit/ui";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Building2 } from "lucide-react";

interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  plan: string;
  billingEmail: string | null;
  status: string;
  fiscalYearStart: number;
  quarterStartMonth: number;
  weekStartDay: number;
  createdAt: string;
}

const PLAN_LABELS: Record<string, string> = {
  startup: "Startup",
  growth: "Growth",
  enterprise: "Enterprise",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SettingsPage() {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    brandColor: "#6366f1",
    billingEmail: "",
    fiscalYearStart: 1,
    weekStartDay: 1,
  });

  async function fetchSettings() {
    const res = await fetch("/api/settings");
    const json = await res.json();
    if (json.success) {
      setSettings(json.data);
      setForm({
        name: json.data.name,
        description: json.data.description || "",
        brandColor: json.data.brandColor || "#6366f1",
        billingEmail: json.data.billingEmail || "",
        fiscalYearStart: json.data.fiscalYearStart,
        weekStartDay: json.data.weekStartDay,
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchSettings();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description || null,
        brandColor: form.brandColor,
        billingEmail: form.billingEmail || null,
        fiscalYearStart: form.fiscalYearStart,
        weekStartDay: form.weekStartDay,
      }),
    });

    await fetchSettings();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Settings</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Organisation settings and preferences
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
        {/* General */}
        <Card>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4 flex items-center gap-2">
            <Building2 className="h-4 w-4" /> General
          </h3>
          <div className="space-y-4">
            <Input
              id="org-name"
              label="Organisation Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="What does your organisation do?"
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                Slug
              </label>
              <p className="text-sm text-[var(--color-text-tertiary)] bg-[var(--color-bg-secondary)] px-3 py-2 rounded-lg">
                {settings?.slug}
              </p>
            </div>
            <div className="flex items-center gap-4">
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
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                  Plan
                </label>
                <Badge variant="default">
                  {PLAN_LABELS[settings?.plan || ""] || settings?.plan}
                </Badge>
              </div>
            </div>
          </div>
        </Card>

        {/* Billing */}
        <Card>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
            Billing
          </h3>
          <Input
            id="billing-email"
            label="Billing Email"
            type="email"
            placeholder="billing@company.com"
            value={form.billingEmail}
            onChange={(e) => setForm({ ...form, billingEmail: e.target.value })}
          />
        </Card>

        {/* Calendar */}
        <Card>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
            Calendar Preferences
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Fiscal Year Starts"
              value={String(form.fiscalYearStart)}
              onChange={(e) => setForm({ ...form, fiscalYearStart: parseInt(e.target.value) })}
              options={MONTH_NAMES.map((name, i) => ({
                value: String(i + 1),
                label: name,
              }))}
            />
            <Select
              label="Week Starts On"
              value={String(form.weekStartDay)}
              onChange={(e) => setForm({ ...form, weekStartDay: parseInt(e.target.value) })}
              options={DAY_NAMES.map((name, i) => ({
                value: String(i),
                label: name,
              }))}
            />
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving}>
            <Save className="h-4 w-4" /> Save Changes
          </Button>
          {saved && (
            <span className="text-sm text-[var(--color-success)]">Changes saved!</span>
          )}
        </div>
      </form>
    </div>
  );
}
