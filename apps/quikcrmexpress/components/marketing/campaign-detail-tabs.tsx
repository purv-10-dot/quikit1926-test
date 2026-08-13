"use client";

import { useState } from "react";
import {
  BarChart3,
  FileText,
  History,
  LayoutTemplate,
  Users,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import type { CampaignDetailDto } from "@/lib/services/campaigns/serialize";
import {
  formatCampaignBudget,
  formatCampaignDate,
} from "@/lib/services/campaigns/serialize";

const TABS = [
  { key: "overview", label: "Overview", icon: FileText },
  { key: "audience", label: "Audience", icon: Users },
  { key: "templates", label: "Templates", icon: LayoutTemplate },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "activities", label: "Activities", icon: History },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(0,140px)_1fr] sm:gap-3">
      <dt className="text-sm text-crm-muted">{label}</dt>
      <dd className="text-sm font-medium text-crm-text">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls =
    s === "active"
      ? "bg-green-50 text-green-800"
      : s === "scheduled"
        ? "bg-accent-100 text-accent-800"
        : s === "completed"
          ? "bg-slate-100 text-slate-700"
          : s === "paused"
            ? "bg-amber-50 text-amber-900"
            : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function ComingSoonPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="border-dashed border-crm-border bg-crm-panel/40">
      <CardBody className="py-10 text-center">
        <p className="text-sm font-medium text-crm-text">{title}</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-crm-muted">{description}</p>
      </CardBody>
    </Card>
  );
}

function OverviewTab({ campaign }: { campaign: CampaignDetailDto }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Type", value: campaign.type ?? "—" },
          { label: "Budget", value: formatCampaignBudget(campaign.budget, campaign.budgetCurrency) },
          { label: "Start", value: formatCampaignDate(campaign.startDate) },
          { label: "End", value: formatCampaignDate(campaign.endDate) },
        ].map((item) => (
          <Card key={item.label}>
            <CardBody className="py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-crm-muted">
                {item.label}
              </p>
              <p className="mt-1 text-lg font-semibold text-crm-text">{item.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardBody className="space-y-4">
          <dl className="space-y-3">
            <DetailRow label="Status" value={campaign.status} />
            <DetailRow label="Created" value={formatCampaignDate(campaign.createdAt)} />
            <DetailRow label="Last updated" value={formatCampaignDate(campaign.updatedAt)} />
          </dl>
          {campaign.description ? (
            <div className="border-t border-crm-border pt-4">
              <p className="mb-2 text-sm font-medium text-crm-muted">Description</p>
              <p className="whitespace-pre-wrap text-sm text-crm-text">{campaign.description}</p>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

function AnalyticsTab() {
  const metrics = [
    { label: "Sent", value: "—" },
    { label: "Delivered", value: "—" },
    { label: "Opened", value: "—" },
    { label: "Clicked", value: "—" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardBody className="py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-crm-muted">
                {m.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-crm-text">{m.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>
      <ComingSoonPanel
        title="Campaign analytics"
        description="Track sends, opens, clicks, and conversions once email delivery is connected."
      />
    </div>
  );
}

export function CampaignDetailTabs({ campaign }: { campaign: CampaignDetailDto }) {
  const [active, setActive] = useState<TabKey>("overview");

  return (
    <section className="crm-card">
      <div className="crm-hscroll overflow-x-auto border-b border-crm-border">
        <div className="flex min-w-max gap-1 px-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActive(t.key)}
                className={
                  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm transition " +
                  (active === t.key
                    ? "border-crm-blue font-semibold text-crm-blue"
                    : "border-transparent text-crm-text hover:text-crm-blue")
                }
              >
                <Icon size={15} className="opacity-70" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {active === "overview" && <OverviewTab campaign={campaign} />}
        {active === "audience" && (
          <ComingSoonPanel
            title="Audience"
            description="Define lead lists, segments, and exclusion rules for this campaign. Audience targeting will connect to Leads and Contacts."
          />
        )}
        {active === "templates" && (
          <ComingSoonPanel
            title="Email templates"
            description="Attach and preview email or SMS templates before launch. Template library integration is planned for a future release."
          />
        )}
        {active === "analytics" && <AnalyticsTab />}
        {active === "activities" && (
          <ComingSoonPanel
            title="Campaign activities"
            description="Log calls, emails, and notes linked to this campaign. Activity logging for campaigns will use the shared Activities module."
          />
        )}
      </div>
    </section>
  );
}

export function CampaignDetailHeader({ campaign }: { campaign: CampaignDetailDto }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <StatusBadge status={campaign.status} />
      {campaign.type && (
        <span className="text-sm text-crm-muted">{campaign.type} campaign</span>
      )}
      <span className="text-sm text-crm-muted">
        {formatCampaignBudget(campaign.budget, campaign.budgetCurrency)} budget
      </span>
    </div>
  );
}
