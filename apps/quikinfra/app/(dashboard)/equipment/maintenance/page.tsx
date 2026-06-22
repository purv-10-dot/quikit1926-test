"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  AlertTriangle,
  Clock,
  Wrench,
  IndianRupee,
  MoreHorizontal,
} from "lucide-react";
import {
  PageHeader,
  PageContainer,
  PrimaryButton,
  KPICard,
  StatusChip,
} from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import {
  useJobCards,
  useJobCardSummary,
  useMaintenanceDue,
  usePatchJobCard,
} from "@/hooks/use-equipment";
import { useMenuActions } from "@/hooks/use-permissions";
import { useQueryClient } from "@tanstack/react-query";

type TabKey = "due" | "job-cards";

interface JobCardRow {
  id: string;
  jobNumber: string;
  equipmentCode: string;
  equipmentName: string;
  jobType: string;
  serviceDate: string;
  reportedProblem: string | null;
  totalCost: number;
  status: string;
}

const CARD_STATUS: Record<string, "success" | "warning" | "neutral" | "danger"> = {
  closed: "success",
  open: "warning",
  cancelled: "danger",
};

function formatCurrency(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

export default function MaintenancePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { canAdd, canEdit } = useMenuActions("/equipment/maintenance");
  const patchMutation = usePatchJobCard();

  const [tab, setTab] = useState<TabKey>("job-cards");
  const [actionMenu, setActionMenu] = useState<string | null>(null);

  const { data: cardsResult, isLoading: cardsLoading } = useJobCards({});
  const { data: summary } = useJobCardSummary({});
  const { data: dueResult, isLoading: dueLoading } = useMaintenanceDue();

  const rows: JobCardRow[] = (cardsResult?.data ?? []) as JobCardRow[];
  const dueRows = dueResult?.data ?? [];

  const handleClose = async (id: string) => {
    await patchMutation.mutateAsync({ id, action: "close" });
    await qc.invalidateQueries({ queryKey: ["job-cards"] });
    setActionMenu(null);
  };

  const handleCancel = async (id: string) => {
    await patchMutation.mutateAsync({ id, action: "cancel" });
    await qc.invalidateQueries({ queryKey: ["job-cards"] });
    setActionMenu(null);
  };

  const jobColumns: ColDef<JobCardRow>[] = useMemo(
    () => [
      { key: "jobNumber", label: "Job #", width: "100px" },
      {
        key: "equipment",
        label: "Equipment",
        render: (row) => (
          <div>
            <div className="font-medium text-gray-900">{row.equipmentCode}</div>
            <div className="text-xs text-gray-500">{row.equipmentName}</div>
          </div>
        ),
      },
      {
        key: "jobType",
        label: "Type",
        width: "100px",
        render: (row) => (
          <span className="capitalize">{row.jobType}</span>
        ),
      },
      { key: "serviceDate", label: "Date", width: "110px" },
      {
        key: "reportedProblem",
        label: "Problem",
        render: (row) => row.reportedProblem ?? "—",
      },
      {
        key: "totalCost",
        label: "Total Cost",
        width: "110px",
        render: (row) => (
          <span className="tabular-nums font-medium">
            {formatCurrency(row.totalCost)}
          </span>
        ),
      },
      {
        key: "status",
        label: "Status",
        width: "90px",
        render: (row) => <StatusChip status={row.status} />,
      },
      {
        key: "actions",
        label: "Action",
        width: "80px",
        render: (row) =>
          row.status === "open" && canEdit ? (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActionMenu(actionMenu === row.id ? null : row.id);
                }}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {actionMenu === row.id && (
                <div className="absolute right-0 z-20 mt-1 w-36 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-sm">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-gray-50"
                    onClick={() => void handleClose(row.id)}
                  >
                    Close card
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-red-600"
                    onClick={() => void handleCancel(row.id)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ) : (
            <span className="text-gray-300">—</span>
          ),
      },
    ],
    [actionMenu, canEdit, patchMutation],
  );

  const dueColumns: ColDef<(typeof dueRows)[number]>[] = [
    {
      key: "equipment",
      label: "Equipment",
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.equipmentCode}</div>
          <div className="text-xs text-gray-500">{row.equipmentName}</div>
        </div>
      ),
    },
    {
      key: "interval",
      label: "Interval",
      render: (row) =>
        row.serviceIntervalValue != null
          ? `${row.serviceIntervalValue} ${row.serviceIntervalUnit ?? "hours"}`
          : "—",
    },
    {
      key: "since",
      label: "Since last service",
      render: (row) => <span className="tabular-nums">{row.since}</span>,
    },
    {
      key: "dueState",
      label: "Status",
      render: (row) => (
        <StatusChip
          status={row.dueState === "overdue" ? "overdue" : "due_soon"}
          label={row.dueState === "overdue" ? "Overdue" : "Due soon"}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Plant & Machinery", href: "/equipment/maintenance" },
          { label: "Maintenance" },
        ]}
        title="Maintenance Management"
        subtitle="Preventive schedule + breakdown job cards"
        actions={
          canAdd ? (
            <PrimaryButton onClick={() => router.push("/equipment/maintenance/new")}>
              <Plus className="w-4 h-4" />
              New Job Card
            </PrimaryButton>
          ) : undefined
        }
      />

      <PageContainer>
        <div className="flex gap-6 border-b border-gray-200 mb-6">
          {(
            [
              { key: "due", label: "Maintenance Due" },
              { key: "job-cards", label: "Job Cards" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KPICard
            title="OVERDUE"
            value={summary?.overdue ?? 0}
            icon={<AlertTriangle className="w-5 h-5" />}
            color="amber"
          />
          <KPICard
            title="DUE SOON"
            value={summary?.dueSoon ?? 0}
            icon={<Clock className="w-5 h-5" />}
            color="brand"
          />
          <KPICard
            title="OPEN JOB CARDS"
            value={summary?.openJobCards ?? 0}
            icon={<Wrench className="w-5 h-5" />}
            color="neutral"
          />
          <KPICard
            title="MAINTENANCE COST"
            value={formatCurrency(summary?.maintenanceCost ?? 0)}
            icon={<IndianRupee className="w-5 h-5" />}
            color="success"
          />
        </div>

        {tab === "job-cards" ? (
          <DataTable
            id="maintenance-job-cards"
            columns={jobColumns}
            data={rows}
            loading={cardsLoading}
            fitToContent
            emptyTitle="No job cards yet"
            emptyHint="Create a maintenance job card for a breakdown or preventive service."
          />
        ) : (
          <DataTable
            id="maintenance-due"
            columns={dueColumns}
            data={dueRows}
            loading={dueLoading}
            fitToContent
            emptyTitle="No maintenance due"
            emptyHint="Set service intervals on machinery master to track preventive maintenance."
          />
        )}
      </PageContainer>
    </>
  );
}
