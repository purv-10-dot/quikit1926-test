"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { ROLE_LABELS } from "@quikit/shared";
import {
  User, Building2, Settings, Mail, Pencil, Check, Loader2,
  LayoutDashboard, BarChart3, ListChecks, Users,
} from "lucide-react";
import { applyAccentColor } from "@quikit/ui/theme-applier";
import { invalidateFeatureFlagsCache } from "@/lib/hooks/useFeatureFlags";

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const ACCENT_PRESETS = [
  { color: "#0066cc", label: "Blue" },
  { color: "#7C3AED", label: "Purple" },
  { color: "#D97706", label: "Amber" },
  { color: "#059669", label: "Green" },
  { color: "#EA580C", label: "Orange" },
  { color: "#4F46E5", label: "Indigo" },
  { color: "#475569", label: "Slate" },
  { color: "#047857", label: "Emerald" },
  { color: "#0D9488", label: "Teal" },
  { color: "#0891B2", label: "Cyan" },
];

const COUNTRIES: { code: string; name: string; timezones: { value: string; label: string }[] }[] = [
  { code: "IN", name: "India", timezones: [{ value: "Asia/Kolkata", label: "India Standard Time (IST) UTC+05:30" }] },
  { code: "US", name: "United States", timezones: [
    { value: "America/New_York", label: "Eastern (ET) UTC-05:00" },
    { value: "America/Chicago", label: "Central (CT) UTC-06:00" },
    { value: "America/Denver", label: "Mountain (MT) UTC-07:00" },
    { value: "America/Los_Angeles", label: "Pacific (PT) UTC-08:00" },
  ]},
  { code: "GB", name: "United Kingdom", timezones: [{ value: "Europe/London", label: "Greenwich (GMT) UTC+00:00" }] },
  { code: "CA", name: "Canada", timezones: [
    { value: "America/Toronto", label: "Eastern (ET) UTC-05:00" },
    { value: "America/Vancouver", label: "Pacific (PT) UTC-08:00" },
  ]},
  { code: "AU", name: "Australia", timezones: [
    { value: "Australia/Sydney", label: "Eastern (AEST) UTC+10:00" },
    { value: "Australia/Perth", label: "Western (AWST) UTC+08:00" },
  ]},
  { code: "DE", name: "Germany", timezones: [{ value: "Europe/Berlin", label: "Central European (CET) UTC+01:00" }] },
  { code: "FR", name: "France", timezones: [{ value: "Europe/Paris", label: "Central European (CET) UTC+01:00" }] },
  { code: "JP", name: "Japan", timezones: [{ value: "Asia/Tokyo", label: "Japan Standard (JST) UTC+09:00" }] },
  { code: "SG", name: "Singapore", timezones: [{ value: "Asia/Singapore", label: "Singapore (SGT) UTC+08:00" }] },
  { code: "AE", name: "UAE", timezones: [{ value: "Asia/Dubai", label: "Gulf Standard (GST) UTC+04:00" }] },
  { code: "BR", name: "Brazil", timezones: [{ value: "America/Sao_Paulo", label: "Brasilia (BRT) UTC-03:00" }] },
  { code: "ZA", name: "South Africa", timezones: [{ value: "Africa/Johannesburg", label: "South Africa (SAST) UTC+02:00" }] },
  { code: "MX", name: "Mexico", timezones: [{ value: "America/Mexico_City", label: "Central (CST) UTC-06:00" }] },
  { code: "NL", name: "Netherlands", timezones: [{ value: "Europe/Amsterdam", label: "Central European (CET) UTC+01:00" }] },
  { code: "SE", name: "Sweden", timezones: [{ value: "Europe/Stockholm", label: "Central European (CET) UTC+01:00" }] },
];

const TABS = [
  { key: "profile", label: "Profile Details", icon: User },
  { key: "company", label: "Company Setting", icon: Building2 },
  { key: "configurations", label: "Configurations", icon: Settings },
] as const;

type TabKey = typeof TABS[number]["key"];

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface ProfileData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  country: string | null;
  timezone: string | null;
  bio: string | null;
  themeMode: string | null;
  accentColor: string | null;
  role: string;
}

interface CompanyData {
  accentColor: string | null;
  themeMode: string | null;
}

interface FlagData {
  id?: string;
  key: string;
  name?: string;
  enabled: boolean;
  value: string | null;
}

/* ─── Main Page ─────────────────────────────────────────────────────────────── */
export default function SettingsPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const isAdmin = session?.user?.membershipRole === "admin" || session?.user?.membershipRole === "super_admin";

  const visibleTabs = TABS.filter((t) => {
    if (t.key === "configurations") return isAdmin;
    return true;
  });

  return (
    <div className="flex h-full">
      {/* Left tab sidebar */}
      <div className="w-[200px] flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
        <nav className="space-y-1">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-[var(--color-neutral-100)] text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-neutral-50)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Right content area */}
      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "company" && <CompanyTab />}
        {activeTab === "configurations" && isAdmin && <ConfigurationsTab />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   TAB 1: PROFILE DETAILS
   ═══════════════════════════════════════════════════════════════════════════════ */
function ProfileTab() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", country: "", timezone: "", bio: "" });

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/profile");
      const json = await res.json();
      if (json.success) {
        setProfile(json.data);
        setForm({
          firstName: json.data.firstName || "",
          lastName: json.data.lastName || "",
          country: json.data.country || "",
          timezone: json.data.timezone || "",
          bio: json.data.bio || "",
        });
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const selectedCountry = COUNTRIES.find((c) => c.code === form.country);
  const timezones = selectedCountry?.timezones || [];

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) {
        setProfile((prev) => prev ? { ...prev, ...json.data } : prev);
        setEditMode(false);
      }
    } finally { setSaving(false); }
  }

  if (loading) return <LoadingSpinner />;
  if (!profile) return <p className="text-sm text-[var(--color-text-secondary)]">Failed to load profile.</p>;

  const initials = `${profile.firstName?.[0] || ""}${profile.lastName?.[0] || ""}`.toUpperCase();
  const roleLabel = ROLE_LABELS[profile.role] || profile.role;

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-[var(--color-neutral-200)] flex items-center justify-center text-lg font-bold text-[var(--color-text-secondary)]">
            {initials}
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">{profile.firstName} {profile.lastName}</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">{roleLabel}</p>
          </div>
        </div>
        <button
          onClick={() => editMode ? handleSave() : setEditMode(true)}
          disabled={saving}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-neutral-50)] transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editMode ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </button>
      </div>

      {/* Fields */}
      <div className="space-y-6">
        {/* Name */}
        <FieldRow label="Name">
          <div className="flex gap-3">
            <input
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              disabled={!editMode}
              className="flex-1 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] disabled:opacity-70"
              placeholder="First name"
            />
            <input
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              disabled={!editMode}
              className="flex-1 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] disabled:opacity-70"
              placeholder="Last name"
            />
          </div>
        </FieldRow>

        {/* Email */}
        <FieldRow label="Email Address">
          <div className="flex items-center gap-2 border border-[var(--color-border)] rounded-lg px-3 py-2 bg-[var(--color-neutral-50)]">
            <Mail className="h-4 w-4 text-[var(--color-text-tertiary)]" />
            <span className="text-sm text-[var(--color-text-secondary)]">{profile.email}</span>
          </div>
        </FieldRow>

        {/* Role */}
        <FieldRow label="Role">
          <select disabled className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] opacity-70 appearance-none">
            <option>{roleLabel}</option>
          </select>
        </FieldRow>

        {/* Country */}
        <FieldRow label="Country">
          <select
            value={form.country}
            onChange={(e) => {
              const c = COUNTRIES.find((ct) => ct.code === e.target.value);
              setForm({ ...form, country: e.target.value, timezone: c?.timezones[0]?.value || "" });
            }}
            disabled={!editMode}
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] disabled:opacity-70"
          >
            <option value="">Select country</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </FieldRow>

        {/* Timezone */}
        <FieldRow label="Timezone">
          <select
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            disabled={!editMode || timezones.length === 0}
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] disabled:opacity-70"
          >
            <option value="">Select timezone</option>
            {timezones.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </FieldRow>

        {/* Bio */}
        <FieldRow label="Bio">
          <textarea
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value.slice(0, 275) })}
            disabled={!editMode}
            rows={4}
            maxLength={275}
            placeholder="Write a short introduction"
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] disabled:opacity-70 resize-none"
          />
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{275 - (form.bio?.length || 0)} characters left</p>
        </FieldRow>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   TAB 2: COMPANY SETTING (per-user theme)
   ═══════════════════════════════════════════════════════════════════════════════ */
function CompanyTab() {
  const [data, setData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/company");
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleColorChange(color: string) {
    setSaving(true);
    setData((prev) => prev ? { ...prev, accentColor: color } : prev);
    applyAccentColor(color);
    try {
      await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accentColor: color }),
      });
    } finally { setSaving(false); }
  }

  if (loading) return <LoadingSpinner />;
  if (!data) return <p className="text-sm text-[var(--color-text-secondary)]">Failed to load settings.</p>;

  const selectedColor = data.accentColor || "#0066cc";

  return (
    <div className="max-w-3xl space-y-8">
      {/* Color Theme */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Color Theme</h3>
        <div className="flex items-center gap-3 flex-wrap">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.color}
              onClick={() => handleColorChange(preset.color)}
              disabled={saving}
              className={`h-9 w-9 rounded-full transition-all duration-200 ${
                selectedColor === preset.color
                  ? "ring-2 ring-offset-2 ring-[var(--color-text-primary)] scale-110"
                  : "hover:scale-105"
              }`}
              style={{ backgroundColor: preset.color }}
              title={preset.label}
            />
          ))}
        </div>
      </div>

      {/* Theme Preview */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Theme Selection</h3>
        <ThemePreview accentColor={selectedColor} />
      </div>
    </div>
  );
}

/* ─── Theme Preview Mock ─────────────────────────────────────────────────────── */
function ThemePreview({ accentColor }: { accentColor: string }) {
  const sidebarBg = "#1a1f2e";
  const contentBg = "#f8f9fb";

  return (
    <div className="border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm">
      {/* Browser chrome */}
      <div className="bg-[var(--color-neutral-100)] px-4 py-2.5 flex items-center gap-2">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-400" />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-green-400" />
        </div>
      </div>

      {/* App layout */}
      <div className="flex" style={{ height: 320 }}>
        {/* Sidebar */}
        <div className="w-48 flex-shrink-0 p-4 text-white/70 text-xs space-y-1" style={{ backgroundColor: sidebarBg }}>
          {/* Logo */}
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-white/10">
            <div className="h-7 w-7 rounded-lg flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: accentColor }}>
              G
            </div>
            <div>
              <p className="text-white font-semibold text-xs">GOAL</p>
              <p className="text-white/40 text-[10px]">GOAL</p>
            </div>
          </div>

          {/* Nav items */}
          {[
            { label: "Dashboard", icon: LayoutDashboard, active: false },
            { label: "Individual KPI", icon: BarChart3, active: true },
            { label: "Priority", icon: ListChecks, active: false },
            { label: "WWW", icon: Users, active: false },
          ].map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs ${
                item.active ? "text-white font-medium" : "text-white/50"
              }`}
              style={item.active ? { backgroundColor: accentColor + "30", color: "white" } : {}}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 p-5" style={{ backgroundColor: contentBg }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm font-semibold text-gray-800">Welcome, Ashwin!</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500">Ashwin Singone</span>
              <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-500">A</div>
            </div>
          </div>

          {/* Content area */}
          <div>
            <p className="text-xs font-semibold text-gray-800 mb-1">Individual KPI</p>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">0 items</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Quarter: Q1</span>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] px-3 py-1 rounded-md bg-white border border-gray-200 text-gray-600">Table</span>
              <span className="text-[10px] px-3 py-1 rounded-md bg-white border border-gray-200 text-gray-600">Cards</span>
              <div className="flex-1" />
              <span className="text-[10px] px-3 py-1 rounded-md bg-white border border-gray-200 text-gray-400">Search...</span>
              <div
                className="text-[10px] px-3 py-1.5 rounded-md text-white font-medium"
                style={{ backgroundColor: accentColor }}
              >
                + Add New
              </div>
            </div>

            {/* Empty state */}
            <div className="flex flex-col items-center justify-center py-8">
              <div className="h-8 w-8 rounded-full bg-gray-100 mb-2" />
              <p className="text-[10px] text-gray-400">No results found</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   TAB 3: CONFIGURATIONS (admin-only)
   ═══════════════════════════════════════════════════════════════════════════════ */
function ConfigurationsTab() {
  const [flags, setFlags] = useState<Record<string, FlagData>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [opspThreshold, setOpspThreshold] = useState("");
  const [opspReviewThreshold, setOpspReviewThreshold] = useState("");
  const [futureDaysLimit, setFutureDaysLimit] = useState("");
  const [quarterDaysLeft, setQuarterDaysLeft] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/configurations");
      const json = await res.json();
      if (json.success) {
        const map: Record<string, FlagData> = {};
        for (const f of json.data) map[f.key] = f;
        setFlags(map);
        setOpspThreshold(map["opsp_threshold_days"]?.value || "");
        setOpspReviewThreshold(map["opsp_review_threshold_days"]?.value || "");
        setFutureDaysLimit(map["future_days_limit"]?.value || "");
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFlags(); }, [fetchFlags]);

  // Calculate remaining days in current quarter
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/org/quarters");
        const json = await res.json();
        if (json.success) {
          const today = new Date();
          for (const q of json.data) {
            const start = new Date(q.startDate);
            const end = new Date(q.endDate);
            if (today >= start && today <= end) {
              const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              setQuarterDaysLeft(diff);
              break;
            }
          }
        }
      } catch {}
    })();
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function toggleFlag(key: string, currentEnabled: boolean) {
    setSavingKey(key);
    const newEnabled = !currentEnabled;
    setFlags((prev) => ({ ...prev, [key]: { ...prev[key], key, enabled: newEnabled, value: prev[key]?.value || null } }));
    try {
      const res = await fetch("/api/settings/configurations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flags: [{ key, enabled: newEnabled }] }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Setting updated successfully");
        invalidateFeatureFlagsCache();
      }
    } finally { setSavingKey(null); }
  }

  async function saveThreshold(key: string, value: string) {
    setSavingKey(key);
    try {
      const res = await fetch("/api/settings/configurations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flags: [{ key, enabled: true, value }] }),
      });
      const json = await res.json();
      if (json.success) {
        setFlags((prev) => ({ ...prev, [key]: json.data[0] }));
        showToast("Settings saved successfully");
        invalidateFeatureFlagsCache();
      }
    } finally { setSavingKey(null); }
  }

  if (loading) return <LoadingSpinner />;

  const addPastWeek = flags["add_past_week_data"]?.enabled ?? false;
  const editPastWeek = flags["edit_past_week_data"]?.enabled ?? false;
  const futureQuarters = flags["enable_future_quarters"]?.enabled ?? false;

  return (
    <div className="max-w-4xl space-y-6 relative">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-2 bg-[var(--color-text-primary)] text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium">
            <svg className="h-4 w-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {toast}
          </div>
        </div>
      )}

      {/* Toggle cards - top row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Add Past Week Data */}
        <div className="border border-[var(--color-border)] rounded-xl p-5 bg-[var(--color-bg-primary)]">
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">Add Past Week Data</h4>
          <p className="text-xs text-[var(--color-text-secondary)] mb-4">Enable to enter past week values when creating KPIs and priorities.</p>
          <div className="flex items-center justify-between">
            <Toggle
              enabled={addPastWeek}
              onChange={() => toggleFlag("add_past_week_data", addPastWeek)}
              loading={savingKey === "add_past_week_data"}
            />
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              {addPastWeek ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>

        {/* Edit Past Week Data */}
        <div className="border border-[var(--color-border)] rounded-xl p-5 bg-[var(--color-bg-primary)]">
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">Edit Past Week Data</h4>
          <p className="text-xs text-[var(--color-text-secondary)] mb-4">Enable to enter past week values when editing KPIs and priorities.</p>
          <div className="flex items-center justify-between">
            <Toggle
              enabled={editPastWeek}
              onChange={() => toggleFlag("edit_past_week_data", editPastWeek)}
              loading={savingKey === "edit_past_week_data"}
            />
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              {editPastWeek ? "Edit Enabled" : "Disabled"}
            </span>
          </div>
        </div>

        {/* Enable Future Quarters */}
        <div className="border border-[var(--color-border)] rounded-xl p-5 bg-[var(--color-bg-primary)]">
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">Enable Future Quarters</h4>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">Do you want to enable future quarters?</p>
          <div className="flex items-center justify-between mb-3">
            <Toggle
              enabled={futureQuarters}
              onChange={() => toggleFlag("enable_future_quarters", futureQuarters)}
              loading={savingKey === "enable_future_quarters"}
            />
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              {futureQuarters ? "Yes" : "No"}
            </span>
          </div>
          {futureQuarters && (
            <>
              <label className="text-xs text-[var(--color-text-secondary)] block mb-1">Days before quarter end (N)</label>
              <input
                type="number"
                min={0}
                max={90}
                value={futureDaysLimit}
                onChange={(e) => setFutureDaysLimit(e.target.value)}
                placeholder="e.g. 30"
                className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] mb-3"
              />
            </>
          )}
          <button
            onClick={() => saveThreshold("future_days_limit", futureDaysLimit)}
            disabled={savingKey === "future_days_limit"}
            className="w-full text-xs text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 hover:bg-[var(--color-neutral-50)] transition-colors"
          >
            {savingKey === "future_days_limit" ? "Saving..." : "Save Future Quarter Settings"}
          </button>
        </div>
      </div>

      {/* Threshold cards - bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* OPSP Threshold */}
        <div className="border-2 border-red-200 rounded-xl p-5 bg-[var(--color-bg-primary)]">
          <h4 className="text-sm font-semibold text-red-500 mb-3">Threshold days for OPSP</h4>
          {quarterDaysLeft !== null && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-4">
              <p className="text-xs text-amber-700">
                Your current quarter ends in {quarterDaysLeft} days. The finalize threshold cannot be higher than that.
              </p>
            </div>
          )}
          <label className="text-xs text-[var(--color-text-secondary)] block mb-1.5">Enter Finalize Value</label>
          <input
            type="number"
            value={opspThreshold}
            onChange={(e) => setOpspThreshold(e.target.value)}
            placeholder="Enter value (e.g. 20)"
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] mb-3"
          />
          <button
            onClick={() => saveThreshold("opsp_threshold_days", opspThreshold)}
            disabled={savingKey === "opsp_threshold_days"}
            className="w-full py-2.5 rounded-lg text-xs font-semibold text-white bg-red-400 hover:bg-red-500 disabled:opacity-50 transition-colors"
          >
            {savingKey === "opsp_threshold_days" ? "Saving..." : "Save threshold"}
          </button>
        </div>

        {/* OPSP Review Threshold */}
        <div className="border-2 border-accent-200 rounded-xl p-5 bg-[var(--color-bg-primary)]">
          <h4 className="text-sm font-semibold text-accent-600 mb-3">Threshold days for OPSP review</h4>
          <label className="text-xs text-[var(--color-text-secondary)] block mb-1.5">Enter Review Finalize Value</label>
          <input
            type="number"
            value={opspReviewThreshold}
            onChange={(e) => setOpspReviewThreshold(e.target.value)}
            placeholder="Enter value (e.g. 20)"
            className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] mb-3"
          />
          <button
            onClick={() => saveThreshold("opsp_review_threshold_days", opspReviewThreshold)}
            disabled={savingKey === "opsp_review_threshold_days"}
            className="w-full py-2.5 rounded-lg text-xs font-semibold text-white bg-accent-800 hover:bg-accent-900 disabled:opacity-50 transition-colors"
          >
            {savingKey === "opsp_review_threshold_days" ? "Saving..." : "Finalize Review OPSP"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════════ */

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-8">
      <label className="w-32 flex-shrink-0 text-sm font-medium text-[var(--color-text-primary)] pt-2">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Toggle({ enabled, onChange, loading }: { enabled: boolean; onChange: () => void; loading?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={loading}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? "bg-accent-600" : "bg-[var(--color-neutral-300)]"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--color-text-tertiary)]" />
    </div>
  );
}
