"use client";

import { useState } from "react";
import { FileText, Send, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { useRABs, useSubmitRAB, useApproveRAB } from "@/hooks/use-projects";
import { WorkflowConfirmDialog, type WorkflowKind } from "@/components/WorkflowConfirmDialog";
import { GenerateRABillForm } from "./GenerateRABillForm";

const TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
];

const inr = (v: any) => (v ? `₹ ${Number(v).toLocaleString("en-IN")}` : "—");

export default function RABillsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [showForm, setShowForm] = useState(false);

  // Workflow action modal — mirrors Work Orders / Estimation / DPR.
  const [confirm, setConfirm] = useState<{ action: WorkflowKind; row: any } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);

  const { data: result, isLoading } = useRABs({ status: activeTab });
  const data = result?.data ?? [];

  const submitRAB = useSubmitRAB();
  const approveRAB = useApproveRAB();
  const pending = submitRAB.isPending || approveRAB.isPending;

  function openAction(action: WorkflowKind, row: any) {
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
    } catch (e: any) {
      setDialogError(e?.message ?? "Action failed");
    }
  }

  const columns: ColDef<any>[] = [
    { key: "rabNumber", label: "RAB No", sortable: true, searchable: true },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "contractorName", label: "Contractor", sortable: true, searchable: true },
    {
      key: "billPeriod",
      label: "Period",
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
      render: (row) => (
        <div className="flex items-center gap-2">
          <a
            href={`/api/projects/rab/${row.id}/preview/pdf`}
            target="_blank"
            rel="noreferrer"
            title="Preview PDF"
            className="text-gray-400 hover:text-blue-500"
          >
            <FileText size={16} />
          </a>
          {row.status === "draft" && (
            <button
              onClick={() => openAction("submit", row)}
              title="Submit for approval"
              className="flex items-center gap-1 text-xs text-orange-700 hover:underline"
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
      <PageHeader
        title="RA Bills (Sub-Contractor)"
        subtitle="Running Account Bills against work orders, from approved DPR progress"
        breadcrumbs={[{ label: "Finance", href: "/finance" }, { label: "RA Bills" }]}
      />
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer>
        <DataTable
          id="finance-ra-bills"
          columns={columns}
          data={data}
          loading={isLoading}
          onAdd={() => setShowForm(true)}
          addLabel="Generate RA Bill"
          defaultSort="rabNumber"
          defaultSortDir="desc"
        />
      </PageContainer>

      <GenerateRABillForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreated={() => setShowForm(false)}
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
