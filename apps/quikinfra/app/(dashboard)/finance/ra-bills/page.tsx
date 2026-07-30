"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useEffect, useState } from "react";
import { FileText, Send, CheckCircle2, XCircle } from "lucide-react";
import { PageFrame, PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { useRABs, useSubmitRAB, useApproveRAB } from "@/hooks/use-projects";
import { useTermsConditions } from "@/hooks/use-masters";
import { WorkflowConfirmDialog, type WorkflowKind } from "@/components/WorkflowConfirmDialog";
import { SelectTermsDialog } from "@/components/SelectTermsDialog";
import { GenerateRABillForm } from "./GenerateRABillForm";

const TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
];

const inr = (v: number | string | null | undefined) => (v ? `₹ ${Number(v).toLocaleString("en-IN")}` : "—");

interface RaBillRow {
  id: string; rabNumber?: string; status?: string; billPeriodFrom?: string; billPeriodTo?: string;
  currentBillAmount?: number | string; netPayable?: number | string;
  [key: string]: unknown;
}

export default function RABillsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [showForm, setShowForm] = useState(false);

  // Workflow action modal — mirrors Work Orders / Estimation / DPR.
  const [confirm, setConfirm] = useState<{ action: WorkflowKind; row: RaBillRow } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Terms & Conditions picker — asked when previewing a bill's PDF.
  const [termsForRab, setTermsForRab] = useState<string | null>(null);
  const { data: termsResult, isLoading: termsLoading } = useTermsConditions();
  const termsTemplates = termsResult?.data ?? [];

  function openPdf(rabId: string, termsId: string | undefined) {
    const qs = termsId ? `?termsId=${encodeURIComponent(termsId)}` : "";
    window.open(`/api/projects/rab/${rabId}/preview/pdf${qs}`, "_blank", "noopener");
    setTermsForRab(null);
  }

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setPage(1);
  }, [activeTab, search, sortBy, sortOrder, pageSize]);

  const { data: result, isLoading } = useRABs({
    status: activeTab,
    search: search || undefined,
    page,
    pageSize,
    sortBy,
    sortOrder,
  });
  const data = result?.data ?? [];
  const total = result?.total ?? 0;

  const submitRAB = useSubmitRAB();
  const approveRAB = useApproveRAB();
  const pending = submitRAB.isPending || approveRAB.isPending;

  function openAction(action: WorkflowKind, row: RaBillRow) {
    setDialogError(null);
    setRejectReason("");
    setConfirm({ action, row });
  }
  function closeDialog() {
    setConfirm(null);
    setRejectReason("");
    setDialogError(null);
  }
  async function handleConfirm() {
    if (!confirm) return;
    setDialogError(null);
    try {
      if (confirm.action === "submit") {
        await submitRAB.mutateAsync(confirm.row.id);
      } else {
        await approveRAB.mutateAsync({
          id: confirm.row.id,
          action: confirm.action,
          comments: confirm.action === "reject" ? rejectReason : undefined,
        });
      }
      closeDialog();
    } catch (e: unknown) {
      setDialogError(toErrorMessage(e, "Action failed"));
    }
  }

  const columns: ColDef<RaBillRow>[] = [
    { key: "rabNumber", label: "RAB No", sortable: true, searchable: true },
    { key: "projectName", label: "Project", sortable: false, searchable: true },
    { key: "contractorName", label: "Contractor", sortable: false, searchable: true },
    {
      key: "billPeriod",
      label: "Period",
      sortable: false,
      render: (row) => `${row.billPeriodFrom} — ${row.billPeriodTo}`,
    },
    { key: "currentBillAmount", label: "Current Bill", type: "number", sortable: true, render: (row) => inr(row.currentBillAmount) },
    { key: "netPayable", label: "Net Payable", type: "number", sortable: true, render: (row) => inr(row.netPayable) },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: ["draft", "submitted", "approved", "paid", "rejected"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTermsForRab(row.id)}
            title="Preview PDF"
            className="text-gray-400 hover:text-blue-500"
          >
            <FileText size={16} />
          </button>
          {row.status === "draft" && (
            <button
              onClick={() => openAction("submit", row)}
              title="Submit for approval"
              className="flex items-center gap-1 text-xs text-accent-700 hover:underline"
            >
              <Send size={14} /> Submit
            </button>
          )}
          {row.status === "submitted" && (
            <>
              <button
                onClick={() => openAction("approve", row)}
                title="Approve"
                className="flex items-center gap-1 text-xs text-green-700 hover:underline"
              >
                <CheckCircle2 size={14} /> Approve
              </button>
              <button
                onClick={() => openAction("reject", row)}
                title="Reject"
                className="flex items-center gap-1 text-xs text-rose-700 hover:underline"
              >
                <XCircle size={14} /> Reject
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageFrame>
      <PageHeader
        title="RA Bills (Sub-Contractor)"
        subtitle="Running Account Bills against work orders, from approved DPR progress"
        breadcrumbs={[{ label: "Finance", href: "/finance" }, { label: "RA Bills" }]}
      />
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer fill>
        <DataTable
          id="finance-ra-bills"
          columns={columns}
          data={data as unknown as RaBillRow[]}
          loading={isLoading}
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
          onAdd={() => setShowForm(true)}
          addLabel="Generate RA Bill"
        />
      </PageContainer>
      </PageFrame>

      <GenerateRABillForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreated={() => setShowForm(false)}
      />

      <SelectTermsDialog
        open={termsForRab !== null}
        onClose={() => setTermsForRab(null)}
        onSelect={(termsId) => termsForRab && openPdf(termsForRab, termsId)}
        templates={termsTemplates}
        loading={termsLoading}
      />

      <WorkflowConfirmDialog
        action={confirm?.action ?? null}
        pending={pending}
        rejectReason={rejectReason}
        onRejectReasonChange={setRejectReason}
        onClose={closeDialog}
        onConfirm={handleConfirm}
        entityNoun="RA Bill"
        entityLabel={confirm?.row?.rabNumber ?? ""}
        error={dialogError}
      />
    </>
  );
}
