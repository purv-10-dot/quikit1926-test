"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Gauge,
  AlertTriangle,
  Fuel,
  Wrench,
  IndianRupee,
  ShieldCheck,
} from "lucide-react";
import {
  PageHeader,
  PageContainer,
  KPICard,
  StatusChip,
} from "@/components/PageShell";
import { useMachine360 } from "@/hooks/use-equipment";

type TabKey =
  | "overview"
  | "timeline"
  | "logs"
  | "maintenance"
  | "movement"
  | "compliance"
  | "commercials"
  | "costs";

function formatCurrency(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function ChartPanel({
  title,
  hasData,
  children,
}: {
  title: string;
  hasData: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="mb-3 text-sm font-semibold text-slate-800">{title}</h4>
      {hasData ? (
        children
      ) : (
        <div className="flex h-40 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">
          No data in period
        </div>
      )}
    </div>
  );
}

function SimpleBarChart({
  data,
  keys,
  colors,
}: {
  data: Array<Record<string, string | number>>;
  keys: string[];
  colors: string[];
}) {
  const max = Math.max(
    ...data.flatMap((d) => keys.map((k) => Number(d[k]) || 0)),
    1,
  );
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={String(d.month ?? d.date)} className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>{d.month ?? d.date}</span>
          </div>
          <div className="flex h-6 gap-0.5 overflow-hidden rounded">
            {keys.map((k, i) => {
              const v = Number(d[k]) || 0;
              const pct = (v / max) * 100;
              return (
                <div
                  key={k}
                  className="h-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: colors[i], minWidth: v > 0 ? "2px" : 0 }}
                  title={`${k}: ${v}`}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Machine360Page() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [tab, setTab] = useState<TabKey>("overview");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const queryParams = useMemo(
    () => ({
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    }),
    [fromDate, toDate],
  );

  const { data, isLoading } = useMachine360(id, queryParams);

  const header = data?.header;
  const kpis = data?.kpis;
  const charts = data?.charts;
  const counts = data?.counts;
  const timeline = data?.timeline ?? [];
  const costSheet = data?.costSheet;

  const meterUnit = header?.meterType === "km" ? "km" : "hr";

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "timeline", label: "Timeline", count: timeline.length },
    { key: "logs", label: "Logs", count: counts?.logs },
    { key: "maintenance", label: "Maintenance", count: counts?.maintenance },
    { key: "movement", label: "Movement", count: counts?.movement },
    { key: "compliance", label: "Compliance", count: counts?.compliance },
    { key: "commercials", label: "Commercials", count: counts?.commercials },
    { key: "costs", label: "Costs" },
  ];

  const filteredTimeline = timeline.filter((e) => {
    if (tab === "timeline") return true;
    if (tab === "logs") return e.kind === "log";
    if (tab === "maintenance") return e.kind === "maintenance";
    if (tab === "movement") return e.kind === "movement";
    if (tab === "compliance") return e.kind === "compliance";
    return false;
  });

  if (isLoading) {
    return (
      <PageContainer>
        <div className="py-16 text-center text-slate-500">Loading machine 360…</div>
      </PageContainer>
    );
  }

  if (!header) {
    return (
      <PageContainer>
        <div className="py-16 text-center text-slate-500">Machine not found.</div>
      </PageContainer>
    );
  }

  return (
    <>
      <PageHeader
        title={`${header.code} — Machine 360`}
        subtitle={`${header.name} · ${header.type}`}
        breadcrumbs={[
          { label: "Equipment", href: "/equipment/fleet" },
          { label: "Fleet", href: "/equipment/fleet" },
          { label: header.code },
        ]}
        onBack={() => router.push("/equipment/fleet")}
      />

      <PageContainer>
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm shadow-sm">
          <div>
            <span className="text-slate-500">Ownership</span>
            <div className="font-medium">{header.ownershipType}</div>
          </div>
          <div>
            <span className="text-slate-500">Category/Type</span>
            <div className="font-medium">{header.type}</div>
          </div>
          <div>
            <span className="text-slate-500">Current Project</span>
            <div className="font-medium">{header.projectName ?? "—"}</div>
          </div>
          <div>
            <span className="text-slate-500">Current Meter ({meterUnit.toUpperCase()})</span>
            <div className="font-medium tabular-nums">
              {header.currentMeter != null
                ? `${header.currentMeter.toLocaleString("en-IN")} ${meterUnit}`
                : "—"}
            </div>
          </div>
          <div>
            <span className="text-slate-500">Fuel Norm</span>
            <div className="font-medium tabular-nums">
              {header.fuelNorm != null ? `${header.fuelNorm} L/${meterUnit}` : "—"}
            </div>
          </div>
          <StatusChip status={header.status} />
        </div>

        <div className="mb-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Period — From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <KPICard
            title={`RUN (${meterUnit.toUpperCase()})`}
            value={kpis?.run ?? 0}
            subtitle={kpis?.runSubtext}
            icon={<Gauge className="h-5 w-5" />}
            color="brand"
          />
          <KPICard
            title="BREAKDOWN HRS"
            value={kpis?.breakdownHours ?? 0}
            icon={<AlertTriangle className="h-5 w-5" />}
            color="danger"
          />
          <KPICard
            title="FUEL"
            value={`${kpis?.fuelLitres ?? 0}L`}
            subtitle={
              kpis?.fuelRate != null
                ? `${kpis.fuelRate} L/${meterUnit} · ${formatCurrency(kpis.fuelCost)}`
                : `— L/${meterUnit} · ${formatCurrency(kpis?.fuelCost ?? 0)}`
            }
            icon={<Fuel className="h-5 w-5" />}
            color="amber"
          />
          <KPICard
            title="MAINTENANCE"
            value={formatCurrency(kpis?.maintenanceCost ?? 0)}
            subtitle={`lifetime ${formatCurrency(kpis?.maintenanceLifetime ?? 0)} · ${kpis?.openJobCards ?? 0} open`}
            icon={<Wrench className="h-5 w-5" />}
            color="info"
          />
          <KPICard
            title="NET MACHINE COST"
            value={formatCurrency(kpis?.netMachineCost ?? 0)}
            subtitle={`rent-out ${formatCurrency(kpis?.rentOutRevenue ?? 0)}`}
            icon={<IndianRupee className="h-5 w-5" />}
            color="teal"
          />
          <KPICard
            title="COMPLIANCE"
            value={kpis?.complianceState === "valid" ? "VALID" : kpis?.complianceState?.toUpperCase() ?? "VALID"}
            subtitle={`${kpis?.openJobCardsCompliance ?? 0} open job card(s)`}
            icon={<ShieldCheck className="h-5 w-5" />}
            color="success"
          />
        </div>

        <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-accent-500 text-accent-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
              {t.count != null ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="grid gap-4 md:grid-cols-2">
            <ChartPanel title={`Meter over time (${meterUnit})`} hasData={(charts?.meterSeries.length ?? 0) > 0}>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {charts?.meterSeries.map((p) => (
                  <div key={p.date} className="flex justify-between text-sm tabular-nums">
                    <span className="text-slate-500">{p.date}</span>
                    <span className="font-medium">{p.value}</span>
                  </div>
                ))}
              </div>
            </ChartPanel>
            <ChartPanel title="Monthly run · idle · breakdown" hasData={(charts?.monthly.length ?? 0) > 0}>
              <SimpleBarChart
                data={charts?.monthly ?? []}
                keys={["run", "idle", "breakdown"]}
                colors={["#14b8a6", "#fbbf24", "#ef4444"]}
              />
            </ChartPanel>
            <ChartPanel title={`Fuel trend (L/${meterUnit}) — red = anomaly`} hasData={(charts?.fuelSeries.length ?? 0) > 0}>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {charts?.fuelSeries.map((p) => (
                  <div key={p.date} className="flex justify-between text-sm tabular-nums">
                    <span className="text-slate-500">{p.date}</span>
                    <span className={p.anomaly ? "font-medium text-red-600" : "font-medium"}>
                      {p.value}
                    </span>
                  </div>
                ))}
              </div>
            </ChartPanel>
            <ChartPanel title="Monthly cost burn" hasData={(charts?.costBurn.length ?? 0) > 0}>
              <SimpleBarChart
                data={(charts?.costBurn ?? []).map((c) => ({
                  month: c.month,
                  fuel: c.fuel,
                  maintenance: c.maintenance,
                }))}
                keys={["fuel", "maintenance"]}
                colors={["#f59e0b", "#64748b"]}
              />
            </ChartPanel>

            <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="mb-3 text-sm font-semibold text-slate-800">Recent events</h4>
              {timeline.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No events in this period.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {timeline.slice(0, 8).map((e, i) => (
                    <div key={`${e.date}-${e.kind}-${i}`} className="flex items-center justify-between py-3 text-sm">
                      <div>
                        <div className="font-medium text-slate-900">{e.title}</div>
                        <div className="text-xs text-slate-500">
                          {e.date} · {e.summary}
                        </div>
                      </div>
                      {e.amount != null && (
                        <span className="tabular-nums font-medium">{formatCurrency(e.amount)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "costs" && costSheet && (
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {costSheet.lines.map((line) => (
              <div key={line.key} className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="font-medium text-slate-900">{line.label}</div>
                  <div className="text-xs text-slate-500">{line.subtext}</div>
                </div>
                <div
                  className={`tabular-nums text-lg font-semibold ${
                    line.isCredit ? "text-emerald-600" : "text-slate-900"
                  }`}
                >
                  {line.isCredit ? `- ${formatCurrency(line.amount)}` : formatCurrency(line.amount)}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between bg-accent-50 px-5 py-4">
              <div className="font-semibold text-slate-900">Net Machine Cost</div>
              <div className="tabular-nums text-xl font-bold text-accent-600">
                {formatCurrency(costSheet.netMachineCost)}
              </div>
            </div>
          </div>
        )}

        {tab !== "overview" && tab !== "costs" && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            {tab === "commercials" ? (
              <p className="p-8 text-center text-sm text-slate-400">
                {counts?.commercials
                  ? `${counts.commercials} hire/rent record(s) — open Hire & Rent for details.`
                  : "No hire-in or rent-out records for this machine."}
              </p>
            ) : filteredTimeline.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-400">No events in this period.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredTimeline.map((e, i) => (
                  <div
                    key={`${e.date}-${e.kind}-${i}`}
                    className="flex items-center justify-between px-5 py-4 text-sm"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase text-slate-600">
                          {e.kind}
                        </span>
                        <span className="font-medium text-slate-900">{e.title}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {e.date}
                        {e.refNumber ? ` · ${e.refNumber}` : ""} · {e.summary}
                      </div>
                    </div>
                    <div className="text-right">
                      {e.amount != null && (
                        <div className="tabular-nums font-medium">{formatCurrency(e.amount)}</div>
                      )}
                      <div className="text-xs text-slate-400">{e.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </PageContainer>
    </>
  );
}
