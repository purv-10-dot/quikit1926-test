"use client";

import { useState } from "react";
import { Building2, CreditCard, Calendar, Palette, LifeBuoy } from "lucide-react";
import { SupportStatusTab } from "@quikit/ui/support";

const TABS = [
  { id: "general",  label: "General",  icon: Building2 },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "billing",  label: "Billing",  icon: CreditCard },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "support",  label: "Support Status", icon: LifeBuoy },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  // The org-settings panels below are still the original static mock and all
  // render together, exactly as before. The tab rail was previously inert
  // (hardcoded `i === 0` active, no onClick); it is stateful now because
  // Support Status is a real panel that has to be reachable.
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const showOrgPanels = activeTab !== "support";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Settings</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            Manage your organisation preferences and configuration
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-secondary-dark)] transition-colors">
          Save Changes
        </button>
      </div>

      <div className="flex gap-6">
        {/* Tab sidebar */}
        <aside className="w-44 shrink-0">
          <nav className="flex flex-col gap-0.5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors ${
                  activeTab === id
                    ? "bg-[var(--color-secondary-light)] text-[var(--color-secondary)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Org settings panels (static mock, unchanged) */}
        <div className="flex-1 space-y-5">
          {showOrgPanels && (
          <>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-6 space-y-5">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">General</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--color-text-primary)]">
                  Organisation Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp"
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] focus:bg-[var(--color-bg-primary)] transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--color-text-primary)]">
                  Plan
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-neutral-100)] px-3 py-2">
                  <span className="text-sm text-[var(--color-text-secondary)]">Startup</span>
                  <span className="ml-auto rounded-full bg-[var(--color-secondary-light)] px-2 py-0.5 text-xs font-medium text-[var(--color-secondary)]">
                    Current
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">
                Description
              </label>
              <textarea
                rows={3}
                placeholder="Brief description of your organisation…"
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] focus:bg-[var(--color-bg-primary)] transition-colors resize-none"
              />
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-6 space-y-5">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Branding</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--color-text-primary)]">
                  Brand Colour
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    defaultValue="#6366f1"
                    className="h-10 w-16 cursor-pointer rounded-lg border border-[var(--color-border)] p-0.5"
                  />
                  <input
                    type="text"
                    placeholder="#6366f1"
                    className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm font-mono text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--color-text-primary)]">
                  Logo URL
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/logo.png"
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-6 space-y-5">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Calendar</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--color-text-primary)]">
                  Fiscal Year Start
                </label>
                <select className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]">
                  {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--color-text-primary)]">
                  Week Starts On
                </label>
                <select className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]">
                  <option value={0}>Sunday</option>
                  <option value={1}>Monday</option>
                </select>
              </div>
            </div>
          </div>
          </>
          )}

          {activeTab === "support" && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-6">
              <SupportStatusTab />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
