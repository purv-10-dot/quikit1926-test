"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { Select } from "@/components/ui/select";

export type OverviewFilterValues = {
  source: string;
  role: string;
  teamId: string;
  leadStage: string;
  oppStage: string;
  industry: string;
  dealStatus: string;
  // kept in URL shape for backward-compat but not shown in UI (no DB column)
  department: string;
  territory: string;
  revenueMin: string;
  revenueMax: string;
};

const EMPTY_FILTERS: OverviewFilterValues = {
  source: "",
  role: "",
  teamId: "",
  leadStage: "",
  oppStage: "",
  industry: "",
  dealStatus: "",
  department: "",
  territory: "",
  revenueMin: "",
  revenueMax: "",
};

async function fetchSources(): Promise<{ id: string; name: string }[]> {
  const res = await fetch("/api/leads/sources", { credentials: "include" });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: { id: string; name: string }[] };
  return json.items ?? [];
}

async function fetchTeams(): Promise<{ id: string; name: string }[]> {
  const res = await fetch("/api/settings/teams", { credentials: "include" });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: { id: string; name: string }[] };
  return json.items ?? [];
}

async function fetchLeadStages(): Promise<string[]> {
  const res = await fetch("/api/leads/stages", { credentials: "include" });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: { stages?: string[] } };
  return json.data?.stages ?? [];
}

const ROLES = ["Administrator", "SalesManager", "SalesUser", "MarketingUser", "FinanceUser"];
const OPP_STAGES = [
  "Prospecting",
  "Qualification",
  "Proposal",
  "Negotiation",
  "ClosedWon",
  "ClosedLost",
];

function FilterField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-crm-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <FilterField label={label}>
      <Select
        value={value || "all"}
        onChange={(e) => onChange(e.target.value === "all" ? "" : e.target.value)}
        className="h-9 w-full min-w-0 text-sm"
      >
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </FilterField>
  );
}

function FilterText({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <FilterField label={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="crm-input h-9 w-full min-w-0 text-sm"
      />
    </FilterField>
  );
}

const ACTIVE_FILTER_KEYS: (keyof OverviewFilterValues)[] = [
  "source", "role", "teamId", "leadStage", "oppStage", "industry", "dealStatus",
];

export function countActiveOverviewFilters(filters: OverviewFilterValues): number {
  return ACTIVE_FILTER_KEYS.filter((k) => filters[k].trim() !== "").length;
}

export function OverviewFilterBar({
  filters,
  onChange,
}: {
  filters: OverviewFilterValues;
  onChange: (patch: Partial<OverviewFilterValues>) => void;
}) {
  const { data: sources = [] } = useQuery({
    queryKey: ["lead-sources-filter"],
    queryFn: fetchSources,
    staleTime: 5 * 60_000,
  });
  const { data: teams = [] } = useQuery({
    queryKey: ["crm-teams-filter"],
    queryFn: fetchTeams,
    staleTime: 5 * 60_000,
  });
  const { data: leadStages = [] } = useQuery({
    queryKey: ["lead-stages-filter"],
    queryFn: fetchLeadStages,
    staleTime: 5 * 60_000,
  });

  const activeCount = useMemo(() => countActiveOverviewFilters(filters), [filters]);

  return (
    <section
      id="overview-global-filters"
      className="rounded-lg border border-crm-border bg-white px-4 py-4 shadow-sm"
      aria-label="Global filters"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-crm-text">Global filters</h3>
          <p className="mt-0.5 text-xs text-crm-muted">
            Narrow overview KPIs and charts across leads and pipeline.
          </p>
        </div>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1.5 rounded-md border border-crm-border bg-crm-panel/50 px-2.5 py-1.5 text-xs font-medium text-crm-text transition hover:bg-crm-panel"
          >
            <RotateCcw className="h-3.5 w-3.5 text-crm-muted" aria-hidden />
            Clear all ({activeCount})
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <FilterSelect
          label="Lead Source"
          value={filters.source}
          onChange={(source) => onChange({ source })}
          options={sources.map((s) => ({ value: s.name, label: s.name }))}
        />
        <FilterSelect
          label="Lead Stage"
          value={filters.leadStage}
          onChange={(leadStage) => onChange({ leadStage })}
          options={leadStages.map((s) => ({ value: s, label: s }))}
        />
        <FilterSelect
          label="Pipeline Stage"
          value={filters.oppStage}
          onChange={(oppStage) => onChange({ oppStage })}
          options={OPP_STAGES.map((s) => ({ value: s, label: s }))}
        />
        <FilterSelect
          label="Deal Status"
          value={filters.dealStatus}
          onChange={(dealStatus) => onChange({ dealStatus })}
          options={OPP_STAGES.map((s) => ({ value: s, label: s }))}
        />
        <FilterText
          label="Industry"
          value={filters.industry}
          onChange={(industry) => onChange({ industry })}
          placeholder="Any industry"
        />
        <FilterSelect
          label="Team"
          value={filters.teamId}
          onChange={(teamId) => onChange({ teamId })}
          options={teams.map((t) => ({ value: t.id, label: t.name }))}
        />
        <FilterSelect
          label="Role"
          value={filters.role}
          onChange={(role) => onChange({ role })}
          options={ROLES.map((r) => ({ value: r, label: r }))}
        />
      </div>
    </section>
  );
}
