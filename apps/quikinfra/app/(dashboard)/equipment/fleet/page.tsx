"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Gauge,
  Activity,
  Fuel,
  AlertTriangle,
  FileWarning,
  TrendingUp,
  IndianRupee,
} from "lucide-react";
import {
  PageHeader,
  PageContainer,
  KPICard,
  StatusChip,
} from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { useProjects, useMachinery } from "@/hooks/use-masters";
import { useFleetDashboard, useCostSheet } from "@/hooks/use-equipment";
import type { FleetMachineRow } from "@/lib/equipment/equipment-types";

type TabKey = "dashboard" | "cost-sheet";

function formatCurrency(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function meterLabel(row: FleetMachineRow) {
  const unit = row.meterType === "km" ? "km" : "hr";
  return row.currentMeter != null
    ? `${row.currentMeter.toLocaleString("en-IN")} ${unit}`
    : "—";
}

export default function FleetDashboardPage() {
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [projectId, setProjectId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");

  const { data: projectsData } = useProjects();
  const projects = projectsData?.data ?? [];

  const { data: machineryData } = useMachinery();
  const machinery = machineryData?.data ?? [];

  const fleetParams = useMemo(
    () => ({
      projectId: projectId || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      refresh: true,
    }),
    [projectId, fromDate, toDate],
  );

  const { data: fleet, isLoading: fleetLoading } = useFleetDashboard(fleetParams);

  const effectiveEquipmentId =
    selectedEquipmentId || fleet?.machines[0]?.id || machinery[0]?.id || "";

  const { data: costSheet, isLoading: costSheetLoading } = useCostSheet({
    equipmentId: tab === "cost-sheet" ? effectiveEquipmentId : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const kpis = fleet?.kpis;
  const rows = fleet?.machines ?? [];

  const columns: ColDef<FleetMachineRow>[] = [
    {
      key: "machine",
      label: "Machine",
      render: (row) => (
        <div>
          <Link
            href={`/equipment/machines/${row.id}`}
            className="font-medium text-orange-600 hover:text-orange-800"
            onClick={(e) => e.stopPropagation()}
          >
            {row.code}
          </Link>
          <div className="text-xs text-gray-500">{row.type}</div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: "140px",
      render: (row) => <StatusChip status={row.status} />,
    },
    {
      key: "meter",
      label: "Meter",
      width: "110px",
      render: (row) => <span className="tabular-nums text-sm">{meterLabel(row)}</span>,
    },
    {
      key: "run",
      label: "Run",
      width: "70px",
      render: (row) => <span className="tabular-nums">{row.run}</span>,
    },
    {
      key: "utilisationPct",
      label: "Util %",
      width: "80px",
      render: (row) => (
        <span className="tabular-nums">
          {row.utilisationPct != null ? `${row.utilisationPct}%` : "—"}
        </span>
      ),
    },
    {
      key: "fuelLPerUnit",
      label: "Fuel L/u",
      width: "90px",
      render: (row) =>
        row.fuelLPerUnit != null ? (
          <span
            className={`tabular-nums ${row.fuelFlag ? "text-red-600 font-medium" : ""}`}
          >
            {row.fuelLPerUnit}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "fuelCost",
      label: "Fuel ₹",
      width: "90px",
      render: (row) => (
        <span className="tabular-nums">{formatCurrency(row.fuelCost)}</span>
      ),
    },
    {
      key: "maintenanceCost",
      label: "Maint ₹",
      width: "90px",
      render: (row) => (
        <span className="tabular-nums">{formatCurrency(row.maintenanceCost)}</span>
      ),
    },
    {
      key: "costBurn",
      label: "Cost Burn",
      width: "100px",
      render: (row) => (
        <span className="tabular-nums font-medium">{formatCurrency(row.costBurn)}</span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Fleet Dashboard"
        subtitle="Utilisation · fuel efficiency · maintenance · cost burn"
        breadcrumbs={[
          { label: "Plant & Machinery", href: "/equipment/fleet" },
          { label: "Fleet" },
        ]}
        actions={
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        }
      />

      <PageContainer>
        <div className="mb-4 flex flex-wrap items-center gap-4 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setTab("dashboard")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === "dashboard"
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Fleet Dashboard
          </button>
          <button
            type="button"
            onClick={() => setTab("cost-sheet")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === "cost-sheet"
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Machine Cost Sheet
          </button>

          <div className="ml-auto flex items-center gap-2 pb-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              placeholder="From"
            />
            <span className="text-slate-400">–</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              placeholder="To"
            />
          </div>
        </div>

        {tab === "dashboard" ? (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
              <KPICard
                title="MACHINES"
                value={kpis?.machines ?? 0}
                icon={<Gauge className="h-5 w-5" />}
                color="brand"
              />
              <KPICard
                title="AVG UTILISATION"
                value={kpis ? `${kpis.avgUtilisation}%` : "0%"}
                icon={<Activity className="h-5 w-5" />}
                color="teal"
              />
              <KPICard
                title="FUEL COST"
                value={formatCurrency(kpis?.fuelCost ?? 0)}
                icon={<Fuel className="h-5 w-5" />}
                color="amber"
              />
              <KPICard
                title="MAINT. DUE"
                value={kpis?.maintDue ?? 0}
                icon={<AlertTriangle className="h-5 w-5" />}
                color="danger"
              />
              <KPICard
                title="DOC ALERTS"
                value={kpis?.docAlerts ?? 0}
                icon={<FileWarning className="h-5 w-5" />}
                color="warn"
              />
            </div>

            <DataTable
              id="fleet-machines"
              columns={columns}
              data={rows}
              loading={fleetLoading}
              fitToContent
              emptyTitle="No machinery registered"
              emptyHint="Add machines in Masters or adjust the project filter."
            />
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-slate-600">Machine</label>
              <select
                value={effectiveEquipmentId}
                onChange={(e) => setSelectedEquipmentId(e.target.value)}
                className="min-w-[280px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {machinery.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </div>

            {costSheetLoading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                Loading cost sheet…
              </div>
            ) : costSheet ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {costSheet.equipmentCode} · {costSheet.equipmentName}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {costSheet.ownershipType} · Run {costSheet.run} ·{" "}
                        {costSheet.operatorDays} Operator-Day(s)
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-orange-400" />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {costSheet.lines.map((line) => (
                    <div
                      key={line.key}
                      className="flex items-center justify-between px-5 py-4"
                    >
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
                  <div className="flex items-center justify-between bg-orange-50 px-5 py-4">
                    <div className="flex items-center gap-2 font-semibold text-slate-900">
                      <IndianRupee className="h-5 w-5 text-orange-600" />
                      Net Machine Cost
                    </div>
                    <div className="tabular-nums text-xl font-bold text-orange-600">
                      {formatCurrency(costSheet.netMachineCost)}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  Hire-in cost and rent-out revenue come from approved verification sheets
                  and rent-out bills on the Hire &amp; Rent screen. Depreciation shown on an
                  annual basis.
                </p>
              </>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                Select a machine to view its cost sheet.
              </div>
            )}
          </div>
        )}
      </PageContainer>
    </>
  );
}
