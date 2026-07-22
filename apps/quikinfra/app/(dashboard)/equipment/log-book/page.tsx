"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Gauge,
  Clock,
  AlertTriangle,
  Fuel,
  AlertCircle,
  Send,
  Check,
  Eye,
  X as XIcon,
} from "lucide-react";
import {
  PageHeader,
  PageContainer,
  PrimaryButton,
  KPICard,
  StatusChip,
} from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { WorkflowConfirmDialog } from "@/components/WorkflowConfirmDialog";
import { EquipmentLogDrawer } from "./new/EquipmentLogDrawer";
import { useProjects, useMachinery } from "@/hooks/use-masters";
import {
  useEquipmentLogs,
  useEquipmentLogSummary,
} from "@/hooks/use-equipment";
import { useMenuActions, usePermissions } from "@/hooks/use-permissions";
import { useQueryClient } from "@tanstack/react-query";
import { toErrorMessage } from "@/lib/api/errors";
import { toast } from "@/lib/toast";
import type { EquipmentLogRecord } from "@/lib/equipment/equipment-types";

type LogRow = EquipmentLogRecord;

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending_approval", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "draft", label: "Draft" },
  { key: "rejected", label: "Rejected" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Pending Approval",
  submitted: "Pending Approval",
};

export default function EquipmentLogBookPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { canAdd, canEdit } = useMenuActions("/equipment/log-book");
  const { isSuper } = usePermissions();

  const [createOpen, setCreateOpen] = useState(false);

  const [workflowAction, setWorkflowAction] = useState<{
    kind: "submit" | "approve" | "reject";
    row: LogRow;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [workflowPending, setWorkflowPending] = useState(false);

  const canSubmit = canEdit;
  const canApproveRow = (row: LogRow): boolean =>
    isSuper || row.canActOnCurrentStep === true;

  const openWorkflow = (
    kind: "submit" | "approve" | "reject",
    row: LogRow,
  ) => {
    setRejectReason("");
    setWorkflowAction({ kind, row });
  };
  const closeWorkflow = () => {
    if (workflowPending) return;
    setWorkflowAction(null);
    setRejectReason("");
  };
  const runWorkflowAction = async () => {
    if (!workflowAction) return;
    const { kind, row } = workflowAction;
    setWorkflowPending(true);
    try {
      if (kind === "submit") {
        const res = await fetch(`/api/equipment/logs/${row.id}/submit`, {
          method: "POST",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      } else {
        const action = kind === "approve" ? "approve" : "reject";
        const res = await fetch(`/api/equipment/logs/${row.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            comments: kind === "reject" ? rejectReason.trim() : undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      await qc.invalidateQueries({ queryKey: ["equipment-logs"] });
      await qc.invalidateQueries({ queryKey: ["equipment-logs-summary"] });
      toast.success(
        kind === "submit"
          ? "Submitted for approval"
          : kind === "approve"
            ? "Log approved"
            : "Log rejected",
      );
      setWorkflowAction(null);
      setRejectReason("");
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, "Action failed"));
    } finally {
      setWorkflowPending(false);
    }
  };

  const [projectId, setProjectId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("logDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Reset to first page whenever a server-side filter/sort changes.
  useEffect(() => {
    setPage(1);
  }, [projectId, statusFilter, search, sortBy, sortOrder, pageSize]);

  const { data: projectsData } = useProjects();
  const projects = projectsData?.data ?? [];

  const summaryParams = useMemo(
    () => ({
      projectId: projectId || undefined,
      status: statusFilter,
    }),
    [projectId, statusFilter],
  );

  const logParams = useMemo(
    () => ({
      ...summaryParams,
      search: search || undefined,
      page,
      pageSize,
      sortBy,
      sortOrder,
    }),
    [summaryParams, search, page, pageSize, sortBy, sortOrder],
  );

  const { data: logsResult, isLoading: logsLoading } = useEquipmentLogs(logParams);
  const { data: summary } = useEquipmentLogSummary(summaryParams);

  const rows: LogRow[] = logsResult?.data ?? [];
  const total = logsResult?.total ?? 0;

  const columns: ColDef<LogRow>[] = [
    { key: "logDate", label: "Date", width: "110px" },
    {
      key: "equipment",
      label: "Equipment",
      sortable: false,
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.equipmentCode}</div>
          <div className="text-xs text-gray-500">{row.equipmentName}</div>
        </div>
      ),
    },
    { key: "shift", label: "Shift", width: "70px" },
    {
      key: "meter",
      label: "Open → Close",
      width: "110px",
      sortable: false,
      render: (row) => (
        <span className="tabular-nums text-sm">
          {row.openingMeter ?? "—"} → {row.closingMeter ?? "—"}
        </span>
      ),
    },
    {
      key: "run",
      label: "Run",
      width: "60px",
      render: (row) => <span className="tabular-nums">{row.run ?? "—"}</span>,
    },
    {
      key: "idleHours",
      label: "Idle",
      width: "60px",
      render: (row) => (
        <span className="tabular-nums">{row.idleHours ?? 0}</span>
      ),
    },
    {
      key: "breakdownHours",
      label: "B/down",
      width: "70px",
      render: (row) => (
        <span className="tabular-nums">{row.breakdownHours ?? 0}</span>
      ),
    },
    {
      key: "dieselIssued",
      label: "Diesel",
      width: "70px",
      render: (row) => (
        <span className="tabular-nums">{row.dieselIssued ?? 0}</span>
      ),
    },
    {
      key: "fuelRate",
      label: "L/unit",
      width: "80px",
      render: (row) =>
        row.fuelRate != null ? (
          <span
            className={`inline-flex items-center gap-1 tabular-nums ${
              row.fuelAnomaly ? "text-red-600 font-medium" : ""
            }`}
          >
            {row.fuelAnomaly && <AlertCircle className="w-3.5 h-3.5" />}
            {row.fuelRate}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "status",
      label: "Status",
      width: "120px",
      render: (row) => (
        <StatusChip
          status={row.status}
          label={STATUS_LABEL[row.status] ?? undefined}
        />
      ),
    },
    {
      key: "actions",
      label: "Action",
      width: "130px",
      render: (row) => {
        const status = String(row.status ?? "draft").toLowerCase();
        const isDraft = status === "draft";
        const isPending =
          status === "pending_approval" || status === "submitted";

        return (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/equipment/log-book/${row.id}`);
              }}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              title="View"
              aria-label="View"
            >
              <Eye className="w-4 h-4" />
            </button>
            {isDraft && canSubmit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openWorkflow("submit", row);
                }}
                className="p-1.5 rounded hover:bg-orange-50 text-orange-600"
                title="Submit for approval"
                aria-label="Submit for approval"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
            {isPending && canApproveRow(row) && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openWorkflow("approve", row);
                  }}
                  className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600"
                  title="Approve"
                  aria-label="Approve"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openWorkflow("reject", row);
                  }}
                  className="p-1.5 rounded hover:bg-rose-50 text-rose-600"
                  title="Reject"
                  aria-label="Reject"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </>
            )}
            {isPending && !canApproveRow(row) && (
              <span className="text-xs text-amber-600">Awaiting</span>
            )}
          </div>
        );
      },
    },
  ];

  const workflowLabel = workflowAction?.row
    ? `${workflowAction.row.equipmentCode} · ${workflowAction.row.logDate}`
    : "";

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Plant & Machinery", href: "/equipment/log-book" },
          { label: "Log Book" },
        ]}
        title="Equipment Log Book"
        subtitle="Daily machine hours/km · idle · breakdown · fuel · productivity"
        actions={
          canAdd ? (
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              New Log Entry
            </PrimaryButton>
          ) : undefined
        }
      />

      <PageContainer>
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm min-w-[180px]"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  statusFilter === f.key
                    ? "bg-accent-500 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <KPICard
            title="LOG ENTRIES"
            value={summary?.logEntries ?? rows.length}
            icon={<Gauge className="w-5 h-5" />}
            color="brand"
          />
          <KPICard
            title="PENDING APPROVAL"
            value={summary?.pendingApproval ?? 0}
            icon={<Clock className="w-5 h-5" />}
            color="amber"
          />
          <KPICard
            title="RUN HOURS/KM"
            value={summary?.runHoursKm ?? 0}
            icon={<Gauge className="w-5 h-5" />}
            color="brand"
          />
          <KPICard
            title="BREAKDOWN HRS"
            value={summary?.breakdownHrs ?? 0}
            icon={<AlertTriangle className="w-5 h-5" />}
            color="amber"
          />
          <KPICard
            title="DIESEL (L)"
            value={summary?.dieselLitres ?? 0}
            icon={<Fuel className="w-5 h-5" />}
            color="brand"
          />
        </div>

        <DataTable
          id="equipment-log-book"
          columns={columns}
          data={rows}
          loading={logsLoading}
          fitToContent
          serverMode
          serverTotal={total}
          serverPage={page}
          serverPageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onSearchChange={setSearch}
          onSortChange={(key, dir) => {
            setSortBy(key);
            setSortOrder(dir);
          }}
          historyEntityType="equipment_logs"
          getHistoryRowLabel={(row) => `${row.equipmentCode} · ${row.logDate}`}
          emptyTitle="No log entries yet"
          emptyHint="Create your first equipment log."
        />
      </PageContainer>

      <EquipmentLogDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={async () => {
          await qc.invalidateQueries({ queryKey: ["equipment-logs"] });
          await qc.invalidateQueries({ queryKey: ["equipment-logs-summary"] });
          setCreateOpen(false);
        }}
      />

      <WorkflowConfirmDialog
        action={workflowAction?.kind ?? null}
        pending={workflowPending}
        rejectReason={rejectReason}
        onRejectReasonChange={setRejectReason}
        onClose={closeWorkflow}
        onConfirm={runWorkflowAction}
        entityNoun="Equipment Log"
        entityLabel={workflowLabel}
        approveHint="Once approved, the machine meter reading will be updated."
        rejectPlaceholder="e.g. closing meter does not match diesel issued"
      />
    </>
  );
}
