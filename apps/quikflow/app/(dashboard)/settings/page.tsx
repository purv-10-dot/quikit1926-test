"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { RolesPanel } from "@/components/settings/roles/roles-panel";

const TABS = ["Usage", "Members", "Roles & Permissions", "API & webhooks", "Audit log"] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("Usage");

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage QuikFlow for your organisation.</p>
      </div>

      <div className="mb-6 flex gap-6 border-b border-[var(--color-border)]">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 pb-3 text-sm font-medium",
              tab === t
                ? "border-accent-600 text-accent-700"
                : "border-transparent text-gray-500 hover:text-gray-700",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Usage" ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5">
          <h2 className="text-base font-semibold">Usage this month</h2>
          <p className="mt-4 text-sm text-gray-600">
            Automation-run metering is billed through your QuikIT subscription. Detailed
            usage graphs land alongside the billing integration.
          </p>
        </div>
      ) : null}

      {tab === "Members" ? (
        <Panel text="Who has QuikFlow access is inherited from your QuikIT org — grant/revoke app access in the Admin Portal. What each member can do inside QuikFlow is configured in the Roles & Permissions tab." />
      ) : null}
      {tab === "Roles & Permissions" ? <RolesPanel /> : null}
      {tab === "API & webhooks" ? (
        <Panel text="API keys and inbound webhook endpoints arrive in Phase 2 (webhook trigger support)." />
      ) : null}
      {tab === "Audit log" ? (
        <Panel text="Every workflow create / edit / activate and every run is written to the platform audit log." />
      ) : null}
    </div>
  );
}

function Panel({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5">
      <p className="text-sm text-gray-600">{text}</p>
    </div>
  );
}
