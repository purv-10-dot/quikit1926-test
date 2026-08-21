"use client";

/**
 * Sales Cost Management — Settings → Sales Cost.
 *
 * Admin-only. The server page (app/(dashboard)/settings/sales-cost/page.tsx)
 * has already redirected non-admins, and every fetch here hits an endpoint that
 * re-checks with requireSalesCostAdmin, so this component does no gating of its
 * own beyond rendering.
 *
 * Layout follows the spec: rep selector + period picker, cost summary, tools
 * table with Add Tool, other costs, and the cost-efficiency grid.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, IndianRupee, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Table, TableScroll, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  BILLING_FREQUENCIES,
  BILLING_FREQUENCY_LABEL,
  type BillingFrequency,
} from "@/lib/services/sales-cost/period";

const API = "/api/settings/sales-cost";

// --------------------------------------------------------------------------
// Wire types — mirror the service DTOs
// --------------------------------------------------------------------------

interface SalesRep {
  userId: string;
  name: string;
  email: string | null;
  role: string;
}

interface ToolCostLine {
  allocationId: string;
  toolId: string;
  toolName: string;
  vendor: string | null;
  toolCost: number;
  billingFrequency: string;
  toolMonthlyCost: number;
  percentage: number;
  allocatedMonthlyCost: number;
  currency: string;
}

interface OtherCostLine {
  id: string;
  label: string;
  monthlyAmount: number;
  currency: string;
  notes: string | null;
}

interface Counts {
  leads: number;
  prospects: number;
  opportunities: number;
  wonDeals: number;
}

interface Efficiency {
  costPerLead: number | null;
  costPerProspect: number | null;
  costPerOpportunity: number | null;
  costPerWonDeal: number | null;
}

interface Breakdown {
  userId: string;
  userName: string;
  period: string;
  currency: string;
  salary: number;
  toolsCost: number;
  otherCost: number;
  totalMonthlyCost: number;
  tools: ToolCostLine[];
  otherCosts: OtherCostLine[];
  counts: Counts;
  efficiency: Efficiency;
}

interface ToolAllocation {
  id: string;
  userId: string;
  userName: string | null;
  percentage: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** One effective-dated price version of a tool. */
interface ToolPrice {
  id: string;
  cost: number;
  billingFrequency: string;
  monthlyCost: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
}

interface ToolDto {
  id: string;
  name: string;
  vendor: string | null;
  category: string | null;
  startDate: string;
  endDate: string | null;
  active: boolean;
  notes: string | null;
  /** Full price history, newest first. */
  prices: ToolPrice[];
  /** The version in force for the selected period, or null if none. */
  currentPrice: ToolPrice | null;
  allocations: ToolAllocation[];
  allocatedPercentage: number;
}

interface OtherCostDto {
  id: string;
  userId: string;
  label: string;
  monthlyAmount: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
  notes: string | null;
}

interface SummaryRow {
  userId: string;
  userName: string;
  role: string;
  currency: string;
  salary: number;
  toolsCost: number;
  otherCost: number;
  totalMonthlyCost: number;
  counts: Counts;
  efficiency: Efficiency;
}

interface PeriodOption {
  key: string;
  label: string;
}

// --------------------------------------------------------------------------
// Formatting
// --------------------------------------------------------------------------

function formatMoney(value: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Unknown currency code — fall back to a plain grouped number rather than
    // throwing inside render.
    return `${currency} ${value.toLocaleString("en-IN")}`;
  }
}

/**
 * Render a cost-per-record figure. A null value means the count was zero, so
 * there is no defined cost per record — shown as an em dash rather than ₹0,
 * which would read as "this is free".
 */
function formatPerUnit(value: number | null, currency: string): string {
  if (value === null) return "—";
  return formatMoney(value, currency);
}

function periodLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** `YYYY-MM` from an ISO timestamp, for prefilling month inputs. */
function monthInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 7);
}

/**
 * One month back from an ISO timestamp.
 *
 * `effectiveTo` is EXCLUSIVE, so a version ending 2026-09-01 actually covers
 * through August — this converts the boundary into the last month a human would
 * say it covers.
 */
function previousMonthIso(iso: string): string {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString();
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export function SalesCostPageClient() {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(currentMonthKey());
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [selectedRep, setSelectedRep] = useState<string>("");

  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [summary, setSummary] = useState<SummaryRow[] | null>(null);
  const [tools, setTools] = useState<ToolDto[]>([]);
  const [otherCosts, setOtherCosts] = useState<OtherCostDto[]>([]);

  const [salaryModalOpen, setSalaryModalOpen] = useState(false);
  const [toolModalOpen, setToolModalOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolDto | null>(null);
  const [pricingTool, setPricingTool] = useState<ToolDto | null>(null);
  const [otherModalOpen, setOtherModalOpen] = useState(false);
  const [editingOther, setEditingOther] = useState<OtherCostDto | null>(null);

  const load = useCallback(
    async (periodKey: string, userId: string) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ period: periodKey });
        if (userId) qs.set("userId", userId);
        const res = await fetch(`${API}?${qs.toString()}`, { credentials: "include" });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          throw new Error(json?.error ?? "Failed to load sales cost data");
        }

        const d = json.data;
        setPeriods(Array.isArray(d.periods) ? d.periods : []);
        setReps(Array.isArray(d.reps) ? d.reps : []);
        setBreakdown(d.breakdown ?? null);
        setSummary(d.summary ?? null);
        setTools(Array.isArray(d.tools) ? d.tools : []);
        setOtherCosts(Array.isArray(d.otherCosts) ? d.otherCosts : []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load sales cost data");
      } finally {
        setLoading(false);
      }
    },
    // `toast` is stable from context; omitting it keeps `load` referentially
    // stable so the effect below does not re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    void load(period, selectedRep);
  }, [load, period, selectedRep]);

  const refresh = useCallback(() => load(period, selectedRep), [load, period, selectedRep]);

  const currency = breakdown?.currency ?? "INR";

  const repName = useMemo(
    () => reps.find((r) => r.userId === selectedRep)?.name ?? "",
    [reps, selectedRep],
  );

  return (
    <div className="space-y-5">
      <Header />

      <SelectorBar
        period={period}
        periods={periods}
        onPeriodChange={setPeriod}
        reps={reps}
        selectedRep={selectedRep}
        onRepChange={setSelectedRep}
        loading={loading}
      />

      {loading && !breakdown && !summary ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-crm-muted">
            Loading sales cost data…
          </CardBody>
        </Card>
      ) : selectedRep && breakdown ? (
        <>
          <CostSummary
            breakdown={breakdown}
            period={period}
            onEditSalary={() => setSalaryModalOpen(true)}
          />

          <ToolsSection
            tools={breakdown.tools}
            allTools={tools}
            onAdd={() => {
              setEditingTool(null);
              setToolModalOpen(true);
            }}
            onEdit={(t) => {
              setEditingTool(t);
              setToolModalOpen(true);
            }}
            onDeleted={refresh}
          />

          <OtherCostsSection
            lines={breakdown.otherCosts}
            all={otherCosts}
            onAdd={() => {
              setEditingOther(null);
              setOtherModalOpen(true);
            }}
            onEdit={(o) => {
              setEditingOther(o);
              setOtherModalOpen(true);
            }}
            onDeleted={refresh}
          />

          <CostEfficiency breakdown={breakdown} />
        </>
      ) : (
        <SummaryTable rows={summary ?? []} onSelect={setSelectedRep} />
      )}

      {salaryModalOpen && (
        <SalaryModal
          repId={selectedRep}
          repName={repName}
          period={period}
          current={breakdown?.salary ?? 0}
          currency={currency}
          onClose={() => setSalaryModalOpen(false)}
          onSaved={() => {
            setSalaryModalOpen(false);
            void refresh();
          }}
        />
      )}

      {toolModalOpen && (
        <ToolModal
          tool={editingTool}
          reps={reps}
          defaultRepId={selectedRep}
          period={period}
          onClose={() => {
            setToolModalOpen(false);
            setEditingTool(null);
          }}
          onSaved={() => {
            setToolModalOpen(false);
            setEditingTool(null);
            void refresh();
          }}
          onChangePrice={() => {
            // Hand off to the price modal; the tool form closes so the two are
            // never stacked on top of each other.
            setPricingTool(editingTool);
            setToolModalOpen(false);
            setEditingTool(null);
          }}
        />
      )}

      {pricingTool && (
        <ChangePriceModal
          tool={pricingTool}
          period={period}
          onClose={() => setPricingTool(null)}
          onSaved={() => {
            setPricingTool(null);
            void refresh();
          }}
        />
      )}

      {otherModalOpen && (
        <OtherCostModal
          cost={editingOther}
          repId={selectedRep}
          period={period}
          onClose={() => {
            setOtherModalOpen(false);
            setEditingOther(null);
          }}
          onSaved={() => {
            setOtherModalOpen(false);
            setEditingOther(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-crm-text">Sales Cost Management</h2>
      <p className="mt-1 text-sm text-crm-muted">
        Configure Sales Rep salaries, tools and other sales costs to calculate acquisition
        cost.
      </p>
    </div>
  );
}

function SelectorBar({
  period,
  periods,
  onPeriodChange,
  reps,
  selectedRep,
  onRepChange,
  loading,
}: {
  period: string;
  periods: PeriodOption[];
  onPeriodChange: (v: string) => void;
  reps: SalesRep[];
  selectedRep: string;
  onRepChange: (v: string) => void;
  loading: boolean;
}) {
  // The API always returns a rolling period list; before the first response
  // lands, fall back to the currently selected key so the select is never empty.
  const options = periods.length > 0 ? periods : [{ key: period, label: periodLabel(period) }];

  return (
    <Card>
      <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-crm-muted">Sales Rep</span>
          <Select
            value={selectedRep}
            onChange={(e) => onRepChange(e.target.value)}
            disabled={loading}
          >
            <option value="">All sales reps (summary)</option>
            {reps.map((r) => (
              <option key={r.userId} value={r.userId}>
                {r.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-crm-muted">Period</span>
          <Select
            value={period}
            onChange={(e) => onPeriodChange(e.target.value)}
            disabled={loading}
          >
            {options.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
        </label>
      </CardBody>
    </Card>
  );
}

function CostSummary({
  breakdown,
  period,
  onEditSalary,
}: {
  breakdown: Breakdown;
  period: string;
  onEditSalary: () => void;
}) {
  const c = breakdown.currency;
  return (
    <Card>
      <CardBody>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-crm-text">
              Cost Summary — {breakdown.userName}
            </h3>
            <p className="text-xs text-crm-muted">{periodLabel(period)}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onEditSalary}>
            <IndianRupee size={14} />
            Set Salary
          </Button>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile label="Monthly Salary" value={formatMoney(breakdown.salary, c)} />
          <SummaryTile label="Tools Cost" value={formatMoney(breakdown.toolsCost, c)} />
          <SummaryTile label="Other Cost" value={formatMoney(breakdown.otherCost, c)} />
          <SummaryTile
            label="Total Monthly Cost"
            value={formatMoney(breakdown.totalMonthlyCost, c)}
            emphasis
          />
        </dl>

        {breakdown.salary === 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            No salary is configured for {breakdown.userName} in {periodLabel(period)}. Cost
            per lead and the other efficiency figures will only reflect tools and other
            costs until a salary is set.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function SummaryTile({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border px-4 py-3 " +
        (emphasis
          ? "border-accent-200 bg-accent-50"
          : "border-crm-border bg-crm-panel")
      }
    >
      <dt className="text-xs font-medium text-crm-muted">{label}</dt>
      <dd
        className={
          "mt-1 text-lg font-semibold " + (emphasis ? "text-accent-700" : "text-crm-text")
        }
      >
        {value}
      </dd>
    </div>
  );
}

function ToolsSection({
  tools,
  allTools,
  onAdd,
  onEdit,
  onDeleted,
}: {
  tools: ToolCostLine[];
  // Each tool line carries its own currency (a tool can be billed in a
  // different currency from the salary), so no page-level currency is needed.
  allTools: ToolDto[];
  onAdd: () => void;
  onEdit: (t: ToolDto) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const remove = async (toolId: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This removes it for every sales rep it is allocated to.`)) {
      return;
    }
    setBusyId(toolId);
    try {
      const res = await fetch(`${API}/tools/${toolId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Failed to delete tool");
      toast.success("Tool deleted");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete tool");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-crm-text">Tools</h3>
          <Button size="sm" onClick={onAdd}>
            <Plus size={14} />
            Add Tool
          </Button>
        </div>

        {tools.length === 0 ? (
          <p className="rounded-lg bg-crm-panel px-3 py-6 text-center text-sm text-crm-muted">
            No tools are allocated to this sales rep for the selected period.
          </p>
        ) : (
          <TableScroll minWidth={760}>
            <Table>
              <THead>
                <TR>
                  <TH className="bg-accent-50">Tool Name</TH>
                  <TH className="bg-accent-50" hideBelow="sm">
                    Billing
                  </TH>
                  <TH className="bg-accent-50 text-right" hideBelow="md">
                    Tool Cost
                  </TH>
                  <TH className="bg-accent-50 text-right">Share</TH>
                  <TH className="bg-accent-50 text-right">Cost</TH>
                  <TH className="bg-accent-50">Status</TH>
                  <TH className="bg-accent-50 text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {tools.map((t) => {
                  const full = allTools.find((x) => x.id === t.toolId);
                  const shared = t.percentage < 100;
                  return (
                    <TR key={t.allocationId} className="hover:bg-blue-50">
                      <TD>
                        <span className="font-medium text-crm-text">{t.toolName}</span>
                        {t.vendor && (
                          <span className="block text-xs text-crm-muted">{t.vendor}</span>
                        )}
                      </TD>
                      <TD hideBelow="sm" className="text-crm-muted">
                        {BILLING_FREQUENCY_LABEL[
                          t.billingFrequency as BillingFrequency
                        ] ?? t.billingFrequency}
                      </TD>
                      <TD hideBelow="md" className="text-right text-crm-muted">
                        {formatMoney(t.toolCost, t.currency)}
                      </TD>
                      <TD className="text-right">
                        {t.percentage}%
                        {shared && (
                          <span
                            className="ml-1 inline-flex align-middle text-crm-muted"
                            title="Shared with other sales reps"
                          >
                            <Users size={12} />
                          </span>
                        )}
                      </TD>
                      <TD className="text-right font-medium text-crm-text">
                        {formatMoney(t.allocatedMonthlyCost, t.currency)}
                      </TD>
                      <TD>
                        <span className="inline-flex rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
                          Active
                        </span>
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {full && (
                            <button
                              type="button"
                              onClick={() => onEdit(full)}
                              className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-blue-500"
                              title="Edit tool"
                              aria-label={`Edit ${t.toolName}`}
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyId === t.toolId}
                            onClick={() => void remove(t.toolId, t.toolName)}
                            className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-red-500 disabled:opacity-50"
                            title="Delete tool"
                            aria-label={`Delete ${t.toolName}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableScroll>
        )}

        <p className="mt-2 text-xs text-crm-muted">
          Shared tools are charged by allocation share, so the same subscription is never
          counted twice across sales reps.
        </p>
      </CardBody>
    </Card>
  );
}

function OtherCostsSection({
  lines,
  all,
  onAdd,
  onEdit,
  onDeleted,
}: {
  lines: OtherCostLine[];
  // Each line carries its own currency — see the note in ToolsSection.
  all: OtherCostDto[];
  onAdd: () => void;
  onEdit: (o: OtherCostDto) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const remove = async (id: string, label: string) => {
    if (!window.confirm(`Delete "${label}"?`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`${API}/other-costs/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Failed to delete cost");
      toast.success("Cost deleted");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete cost");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-crm-text">Other Sales Costs</h3>
          <Button size="sm" variant="secondary" onClick={onAdd}>
            <Plus size={14} />
            Add Cost
          </Button>
        </div>

        {lines.length === 0 ? (
          <p className="rounded-lg bg-crm-panel px-3 py-5 text-center text-sm text-crm-muted">
            No other costs for this sales rep in the selected period.
          </p>
        ) : (
          <TableScroll minWidth={520}>
            <Table>
              <THead>
                <TR>
                  <TH className="bg-accent-50">Label</TH>
                  <TH className="bg-accent-50 text-right">Monthly Cost</TH>
                  <TH className="bg-accent-50 text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {lines.map((l) => {
                  const full = all.find((x) => x.id === l.id);
                  return (
                    <TR key={l.id} className="hover:bg-blue-50">
                      <TD>
                        <span className="font-medium text-crm-text">{l.label}</span>
                        {l.notes && (
                          <span className="block text-xs text-crm-muted">{l.notes}</span>
                        )}
                      </TD>
                      <TD className="text-right font-medium text-crm-text">
                        {formatMoney(l.monthlyAmount, l.currency)}
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {full && (
                            <button
                              type="button"
                              onClick={() => onEdit(full)}
                              className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-blue-500"
                              title="Edit cost"
                              aria-label={`Edit ${l.label}`}
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyId === l.id}
                            onClick={() => void remove(l.id, l.label)}
                            className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-red-500 disabled:opacity-50"
                            title="Delete cost"
                            aria-label={`Delete ${l.label}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableScroll>
        )}
      </CardBody>
    </Card>
  );
}

function CostEfficiency({ breakdown }: { breakdown: Breakdown }) {
  const c = breakdown.currency;
  const { counts, efficiency } = breakdown;

  const rows = [
    { label: "Leads", count: counts.leads, cost: efficiency.costPerLead, per: "Cost / Lead" },
    {
      label: "Prospects",
      count: counts.prospects,
      cost: efficiency.costPerProspect,
      per: "Cost / Prospect",
    },
    {
      label: "Opportunities",
      count: counts.opportunities,
      cost: efficiency.costPerOpportunity,
      per: "Cost / Opportunity",
    },
    {
      label: "Won Deals",
      count: counts.wonDeals,
      cost: efficiency.costPerWonDeal,
      per: "Cost / Won Deal",
    },
  ];

  return (
    <Card>
      <CardBody>
        <h3 className="mb-1 text-sm font-semibold text-crm-text">Cost Efficiency</h3>
        <p className="mb-4 text-xs text-crm-muted">
          Counts come from existing CRM records owned by {breakdown.userName} in{" "}
          {periodLabel(breakdown.period)}. Nothing is entered manually.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r) => (
            <div key={r.label} className="rounded-xl border border-crm-border bg-crm-panel px-4 py-3">
              <p className="text-xs font-medium text-crm-muted">{r.label}</p>
              <p className="mt-0.5 text-lg font-semibold text-crm-text">{r.count}</p>
              <p className="mt-2 text-xs font-medium text-crm-muted">{r.per}</p>
              <p className="mt-0.5 text-base font-semibold text-accent-700">
                {formatPerUnit(r.cost, c)}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-crm-muted">
          A dash means there were no records of that type in the period, so a cost per
          record is not defined.
        </p>
      </CardBody>
    </Card>
  );
}

function SummaryTable({
  rows,
  onSelect,
}: {
  rows: SummaryRow[];
  onSelect: (userId: string) => void;
}) {
  return (
    <Card>
      <CardBody>
        <h3 className="mb-1 text-sm font-semibold text-crm-text">All Sales Reps</h3>
        <p className="mb-3 text-xs text-crm-muted">
          Each rep&apos;s own cost divided by their own CRM records. Select a rep above to
          configure salary, tools and other costs.
        </p>

        {rows.length === 0 ? (
          <p className="rounded-lg bg-crm-panel px-3 py-6 text-center text-sm text-crm-muted">
            No QuikCRM users found in this organization.
          </p>
        ) : (
          <TableScroll minWidth={880}>
            <Table>
              <THead>
                <TR>
                  <TH className="bg-accent-50">Sales Rep</TH>
                  <TH className="bg-accent-50 text-right">Total Cost</TH>
                  <TH className="bg-accent-50 text-right" hideBelow="md">
                    Leads
                  </TH>
                  <TH className="bg-accent-50 text-right">Cost / Lead</TH>
                  <TH className="bg-accent-50 text-right" hideBelow="lg">
                    Cost / Prospect
                  </TH>
                  <TH className="bg-accent-50 text-right" hideBelow="lg">
                    Cost / Opportunity
                  </TH>
                  <TH className="bg-accent-50 text-right">Cost / Won Deal</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.userId} className="hover:bg-blue-50">
                    <TD>
                      <button
                        type="button"
                        onClick={() => onSelect(r.userId)}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {r.userName}
                      </button>
                      <span className="block text-xs text-crm-muted">{r.role}</span>
                    </TD>
                    <TD className="text-right font-medium text-crm-text">
                      {formatMoney(r.totalMonthlyCost, r.currency)}
                    </TD>
                    <TD hideBelow="md" className="text-right text-crm-muted">
                      {r.counts.leads}
                    </TD>
                    <TD className="text-right">
                      {formatPerUnit(r.efficiency.costPerLead, r.currency)}
                    </TD>
                    <TD hideBelow="lg" className="text-right">
                      {formatPerUnit(r.efficiency.costPerProspect, r.currency)}
                    </TD>
                    <TD hideBelow="lg" className="text-right">
                      {formatPerUnit(r.efficiency.costPerOpportunity, r.currency)}
                    </TD>
                    <TD className="text-right">
                      {formatPerUnit(r.efficiency.costPerWonDeal, r.currency)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        )}
      </CardBody>
    </Card>
  );
}

// --------------------------------------------------------------------------
// Modals
// --------------------------------------------------------------------------

function SalaryModal({
  repId,
  repName,
  period,
  current,
  currency,
  onClose,
  onSaved,
}: {
  repId: string;
  repName: string;
  period: string;
  current: number;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState(current > 0 ? String(current) : "");
  const [effectiveFrom, setEffectiveFrom] = useState(period);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Enter a valid monthly salary");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/salary`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: repId,
          monthlyAmount: value,
          currency,
          effectiveFrom,
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Failed to save salary");
      toast.success("Salary saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save salary");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Set Salary — ${repName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Save Salary"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-crm-muted">
            Monthly Salary ({currency})
          </span>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="40000"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-crm-muted">
            Effective From
          </span>
          <Input
            type="month"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-crm-muted">
            Notes (optional)
          </span>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Annual revision"
          />
        </label>

        <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Earlier months keep the salary that was in force then. Saving closes the current
          entry and starts a new one from the month above, so past cost reports do not
          change.
        </p>
      </div>
    </Modal>
  );
}

interface AllocationDraft {
  userId: string;
  percentage: string;
}

function ToolModal({
  tool,
  reps,
  defaultRepId,
  period,
  onClose,
  onSaved,
  onChangePrice,
}: {
  tool: ToolDto | null;
  reps: SalesRep[];
  defaultRepId: string;
  period: string;
  onClose: () => void;
  onSaved: () => void;
  /** Opens ChangePriceModal — only reachable when editing an existing tool. */
  onChangePrice: () => void;
}) {
  const toast = useToast();
  const editing = tool !== null;

  const [name, setName] = useState(tool?.name ?? "");
  const [vendor, setVendor] = useState(tool?.vendor ?? "");
  // Price fields are only part of THIS form when creating: they seed the tool's
  // opening price version. On edit, price is changed through ChangePriceModal so
  // that a new version is opened instead of history being rewritten.
  const [cost, setCost] = useState("");
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>("monthly");
  const [startDate, setStartDate] = useState(
    tool ? monthInputValue(tool.startDate) : period,
  );
  const [endDate, setEndDate] = useState(tool ? monthInputValue(tool.endDate) : "");
  const [active, setActive] = useState(tool?.active ?? true);
  const [allocations, setAllocations] = useState<AllocationDraft[]>(() => {
    if (tool && tool.allocations.length > 0) {
      return tool.allocations.map((a) => ({
        userId: a.userId,
        percentage: String(a.percentage),
      }));
    }
    return [{ userId: defaultRepId, percentage: "100" }];
  });
  const [saving, setSaving] = useState(false);

  const totalPct = allocations.reduce((acc, a) => acc + (Number(a.percentage) || 0), 0);

  const setAlloc = (i: number, patch: Partial<AllocationDraft>) => {
    setAllocations((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  };

  const submit = async () => {
    const costValue = Number(cost);
    if (!name.trim()) {
      toast.error("Tool name is required");
      return;
    }
    // Cost is only submitted on create. On edit it is not part of this form.
    if (!editing && (!Number.isFinite(costValue) || costValue < 0)) {
      toast.error("Enter a valid cost");
      return;
    }
    const cleaned = allocations
      .filter((a) => a.userId)
      .map((a) => ({ userId: a.userId, percentage: Number(a.percentage) }));
    if (cleaned.length === 0) {
      toast.error("Assign the tool to at least one sales rep");
      return;
    }
    if (cleaned.some((a) => !Number.isFinite(a.percentage) || a.percentage <= 0)) {
      toast.error("Each allocation must be greater than 0%");
      return;
    }
    // The server enforces this too (against overlapping periods); checking here
    // saves a round trip on the common single-window case.
    if (cleaned.reduce((acc, a) => acc + a.percentage, 0) > 100) {
      toast.error("Allocations cannot total more than 100%");
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        vendor: vendor.trim() || null,
        startDate,
        endDate: endDate || null,
        active,
        allocations: cleaned,
        // Only the create payload carries price — the PATCH schema rejects these
        // fields, because repricing must go through .../price to stay versioned.
        ...(editing ? {} : { cost: costValue, billingFrequency }),
      };
      const res = await fetch(editing ? `${API}/tools/${tool.id}` : `${API}/tools`, {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Failed to save tool");
      toast.success(editing ? "Tool updated" : "Tool added");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save tool");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit Tool — ${tool.name}` : "Add Tool"}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Tool"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-crm-muted">Tool Name</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="LinkedIn Sales Navigator"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-crm-muted">
              Vendor (optional)
            </span>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </label>
          {/* Price is only set here when creating the tool — it seeds the
            * opening price version. On edit, price is changed via "Change
            * Price", which opens a NEW version so past months keep theirs. */}
          {!editing && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-crm-muted">
                  Cost (total, per billing period)
                </span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="16000"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-crm-muted">
                  Billing Frequency
                </span>
                <Select
                  value={billingFrequency}
                  onChange={(e) => setBillingFrequency(e.target.value as BillingFrequency)}
                >
                  {BILLING_FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {BILLING_FREQUENCY_LABEL[f]}
                    </option>
                  ))}
                </Select>
              </label>
            </>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-crm-muted">Start Date</span>
            <Input
              type="month"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-crm-muted">
              End Date (optional)
            </span>
            <Input
              type="month"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-crm-text">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="rounded border-gray-300 text-blue-600"
          />
          Active
        </label>

        <div className="rounded-xl border border-crm-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-crm-text">Allocation</p>
              <p className="text-xs text-crm-muted">
                Split the total cost across sales reps. 100% charges one rep for the whole
                tool.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAllocations((p) => [...p, { userId: "", percentage: "" }])}
            >
              <Plus size={14} />
              Add Rep
            </Button>
          </div>

          <div className="space-y-2">
            {allocations.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={a.userId}
                  onChange={(e) => setAlloc(i, { userId: e.target.value })}
                  className="flex-1"
                >
                  <option value="">Select sales rep…</option>
                  {reps.map((r) => (
                    <option key={r.userId} value={r.userId}>
                      {r.name}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min={0.01}
                  max={100}
                  step="0.01"
                  value={a.percentage}
                  onChange={(e) => setAlloc(i, { percentage: e.target.value })}
                  placeholder="50"
                  className="w-24"
                  aria-label="Allocation percentage"
                />
                <span className="text-sm text-crm-muted">%</span>
                {allocations.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setAllocations((p) => p.filter((_, idx) => idx !== i))
                    }
                    className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-red-500"
                    aria-label="Remove allocation"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <p
            className={
              "mt-2 text-xs " + (totalPct > 100 ? "text-red-600" : "text-crm-muted")
            }
          >
            Allocated: {Math.round(totalPct * 100) / 100}%
            {totalPct > 100 && " — cannot exceed 100%"}
          </p>
        </div>

        {editing && (
          <div className="rounded-xl border border-crm-border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-crm-text">Price History</p>
                <p className="text-xs text-crm-muted">
                  Each month uses the price in force then. Changing the price adds a new
                  version and leaves past months untouched.
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={onChangePrice}>
                Change Price
              </Button>
            </div>

            {tool.prices.length === 0 ? (
              <p className="text-xs text-crm-muted">No price configured yet.</p>
            ) : (
              <ul className="space-y-1">
                {tool.prices.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs"
                  >
                    <span className="font-medium text-crm-text">
                      {formatMoney(p.cost, p.currency)}
                      <span className="ml-1 font-normal text-crm-muted">
                        {BILLING_FREQUENCY_LABEL[p.billingFrequency as BillingFrequency] ??
                          p.billingFrequency}
                      </span>
                    </span>
                    <span className="text-crm-muted">
                      {periodLabel(monthInputValue(p.effectiveFrom))}
                      {" – "}
                      {p.effectiveTo
                        ? // effectiveTo is EXCLUSIVE, so the last covered month is
                          // the one before it.
                          periodLabel(monthInputValue(previousMonthIso(p.effectiveTo)))
                        : "present"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * A new price version for a tool, effective from a chosen month.
 *
 * Posts to .../price, which closes the open version at that month and inserts a
 * new one — so August stays ₹8,000 after September becomes ₹10,000.
 */
function ChangePriceModal({
  tool,
  period,
  onClose,
  onSaved,
}: {
  tool: ToolDto;
  period: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const latest = tool.prices[0] ?? null;

  const [cost, setCost] = useState(latest ? String(latest.cost) : "");
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>(
    (latest?.billingFrequency as BillingFrequency) ?? "monthly",
  );
  const [effectiveFrom, setEffectiveFrom] = useState(period);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const value = Number(cost);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Enter a valid cost");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/tools/${tool.id}/price`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cost: value,
          billingFrequency,
          effectiveFrom,
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Failed to save price");
      toast.success("Price updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save price");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Change Price — ${tool.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Save Price"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-crm-muted">
              New Cost (total, per billing period)
            </span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="10000"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-crm-muted">
              Billing Frequency
            </span>
            <Select
              value={billingFrequency}
              onChange={(e) => setBillingFrequency(e.target.value as BillingFrequency)}
            >
              {BILLING_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {BILLING_FREQUENCY_LABEL[f]}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-crm-muted">
            Effective From
          </span>
          <Input
            type="month"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-crm-muted">
            Notes (optional)
          </span>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Vendor price increase"
          />
        </label>

        <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Months before {periodLabel(effectiveFrom)} keep the price in force then. This
          adds a new version rather than editing the existing one, so past cost reports do
          not change.
        </p>
      </div>
    </Modal>
  );
}

function OtherCostModal({
  cost,
  repId,
  period,
  onClose,
  onSaved,
}: {
  cost: OtherCostDto | null;
  repId: string;
  period: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editing = cost !== null;

  const [label, setLabel] = useState(cost?.label ?? "");
  const [amount, setAmount] = useState(cost ? String(cost.monthlyAmount) : "");
  const [effectiveFrom, setEffectiveFrom] = useState(
    cost ? monthInputValue(cost.effectiveFrom) : period,
  );
  const [effectiveTo, setEffectiveTo] = useState(
    cost ? monthInputValue(cost.effectiveTo) : "",
  );
  const [active, setActive] = useState(cost?.active ?? true);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const value = Number(amount);
    if (!label.trim()) {
      toast.error("Label is required");
      return;
    }
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Enter a valid monthly amount");
      return;
    }

    setSaving(true);
    try {
      const body = editing
        ? {
            label: label.trim(),
            monthlyAmount: value,
            effectiveFrom,
            effectiveTo: effectiveTo || null,
            active,
          }
        : {
            userId: repId,
            label: label.trim(),
            monthlyAmount: value,
            effectiveFrom,
            effectiveTo: effectiveTo || null,
            active,
          };
      const res = await fetch(
        editing ? `${API}/other-costs/${cost.id}` : `${API}/other-costs`,
        {
          method: editing ? "PATCH" : "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Failed to save cost");
      toast.success(editing ? "Cost updated" : "Cost added");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save cost");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit Cost — ${cost.label}` : "Add Other Cost"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Cost"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-crm-muted">Label</span>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Travel allowance"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-crm-muted">
            Monthly Amount
          </span>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="5000"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-crm-muted">From</span>
            <Input
              type="month"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-crm-muted">
              To (optional)
            </span>
            <Input
              type="month"
              value={effectiveTo}
              onChange={(e) => setEffectiveTo(e.target.value)}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-crm-text">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="rounded border-gray-300 text-blue-600"
          />
          Active
        </label>
      </div>
    </Modal>
  );
}
