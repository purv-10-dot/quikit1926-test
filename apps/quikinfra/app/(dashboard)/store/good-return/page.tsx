"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Eye, Send, Check, X as XIcon, Truck,
} from "lucide-react";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { WorkflowConfirmDialog } from "@/components/WorkflowConfirmDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useGoodReturns, useGoodReturnCounts } from "@/hooks/use-store";
import { QuickCreateDrawer, type QuickCreateConfig } from "@/components/QuickCreateDrawer";
import { GroupedMaterialSelect, type GroupedMaterialSelectItem } from "@/components/GroupedMaterialSelect";
import { useProjects, useLocations, useVendors, useItemGroups, useUOMs } from "@/hooks/use-masters";
import { usePermissions, useMenuActions } from "@/hooks/use-permissions";
import { useQueryClient } from "@tanstack/react-query";
import { type TabSpec } from "@/lib/tab-counts";
import { toast } from "@/lib/toast";

const MENU_KEY = "store.good_return";

const TABS: TabSpec[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "dispatched", label: "Dispatched" },
];

const RETURN_REASON_OPTIONS = [
  { value: "damaged", label: "Damaged" },
  { value: "rejected_qa", label: "Rejected by QA" },
  { value: "wrong_item", label: "Wrong Item Supplied" },
  { value: "expired", label: "Expired / Shelf-life" },
  { value: "surplus", label: "Surplus / Not Required" },
  { value: "warranty_replacement", label: "Warranty Replacement" },
  { value: "other", label: "Other" },
];

interface GoodReturnRow {
  id: string; returnNumber?: string; reason?: string; status?: string;
  [key: string]: unknown;
}

export default function GoodReturnPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { canAdd } = useMenuActions("/store/good-return");

  // Workflow action state — Submit / Approve / Reject open the
  // WorkflowConfirmDialog; Dispatch opens the simpler ConfirmDialog
  // below since it's a single-action transition.
  const [workflowAction, setWorkflowAction] = useState<
    { kind: "submit" | "approve" | "reject"; row: GoodReturnRow } | null
  >(null);
  const [rejectReason, setRejectReason] = useState("");
  const [workflowPending, setWorkflowPending] = useState(false);
  const [dispatchTarget, setDispatchTarget] = useState<GoodReturnRow | null>(null);
  const [dispatchPending, setDispatchPending] = useState(false);

  const { permissionMatrix, isSuper, hasRole } = usePermissions();
  const matrixRow = permissionMatrix?.[MENU_KEY];
  const canEdit = isSuper || !matrixRow || matrixRow.edit !== false;
  const canSubmit = canEdit;
  const canApprove =
    isSuper || hasRole(["admin", "site_admin"]);

  const openWorkflow = (
    kind: "submit" | "approve" | "reject",
    row: GoodReturnRow,
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
        const res = await fetch(`/api/store/good-returns/${row.id}/submit`, {
          method: "POST",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      } else {
        const action = kind === "approve" ? "approve" : "reject";
        const res = await fetch(`/api/store/good-returns/${row.id}/approve`, {
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
      qc.invalidateQueries({ queryKey: ["good-returns"] });
      toast.success(
        kind === "submit"
          ? "Submitted for approval"
          : kind === "approve"
            ? "Good return approved"
            : "Good return rejected",
      );
      setWorkflowAction(null);
      setRejectReason("");
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, "Action failed"));
    } finally {
      setWorkflowPending(false);
    }
  };

  const runDispatch = async () => {
    if (!dispatchTarget) return;
    setDispatchPending(true);
    try {
      const res = await fetch(`/api/store/good-returns/${dispatchTarget.id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: ["good-returns"] });
      setDispatchTarget(null);
      toast.success("Good return dispatched");
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, "Dispatch failed"));
    } finally {
      setDispatchPending(false);
    }
  };

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("returnDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setPage(1);
  }, [activeTab, search, sortBy, sortOrder, pageSize]);

  const { data: result, isLoading } = useGoodReturns({
    status: activeTab,
    search: search || undefined,
    page,
    pageSize,
    sortBy,
    sortOrder,
  });
  const data = result?.data ?? [];
  const total = result?.total ?? 0;

  // Tab badges from a separate per-status count query so they show full
  // totals even though the list itself is paged.
  const { data: counts } = useGoodReturnCounts();
  const tabs = useMemo(
    () =>
      TABS.map((t) => ({
        key: t.key,
        label: t.label,
        count:
          t.key === "all"
            ? counts?.total ?? 0
            : counts?.byStatus?.[t.key] ?? 0,
      })),
    [counts],
  );

  const { data: projectsData } = useProjects();
  const { data: locationsData } = useLocations();
  const { data: vendorsData } = useVendors();
  const { data: itemGroupsData } = useItemGroups();
  const { data: uomsData } = useUOMs();

  const projectOptions = (projectsData?.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  const locationOptions = (locationsData?.data ?? []).filter((l) => l?.status === "active").map((l) => ({ value: l.id, label: l.name }));
  // Only active vendors are selectable (inactive/deleted/blacklisted excluded).
  const vendorOptions = (vendorsData?.data ?? [])
    .filter((v) => v.status === "active" && !(v as { isBlacklisted?: boolean }).isBlacklisted)
    .map((v) => ({
      value: v.id,
      label: v.companyName || v.name || v.id,
    }));
  // Lazy picker fetches items per-group; onSelect supplies the picked item.
  const items: GroupedMaterialSelectItem[] = [];
  const itemGroups = itemGroupsData?.data ?? [];
  const uomOptions = (uomsData?.data ?? []).filter((u) => u?.status === "active").map((u) => ({
    value: u.code,
    label: u.code,
  }));

  const todayIso = new Date().toISOString().slice(0, 10);

  const config: QuickCreateConfig = {
    title: "New Good Return",
    subtitle: "Return rejected or damaged materials to vendor",
    apiEndpoint: "/api/store/good-returns",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["good-returns"] }),
    fields: [
      { key: "projectId", label: "Project", type: "select" as const, searchable: true, required: true, options: projectOptions, placeholder: "Select project" },
      { key: "locationId", label: "Location", type: "select" as const, searchable: true, options: locationOptions, placeholder: "Select location" },
      { key: "vendorId", label: "Vendor", type: "select" as const, searchable: true, required: true, options: vendorOptions, placeholder: "Select vendor" },
      { key: "returnDate", label: "Return Date", type: "date" as const, required: true, defaultValue: todayIso },
      { key: "grnNumber", label: "Source GRN No.", type: "text" as const, placeholder: "e.g. GRN-NH48-26-00001" },
      { key: "reason", label: "Reason", type: "select" as const, required: true, options: RETURN_REASON_OPTIONS, placeholder: "Select reason" },
      { key: "vehicleNo", label: "Vehicle No.", type: "text" as const, placeholder: "e.g. MH-12-AB-3456" },
      { key: "driverName", label: "Driver Name", type: "text" as const, placeholder: "Driver name" },
      {
        key: "driverMobileNo",
        label: "Driver Mobile No.",
        type: "text" as const,
        placeholder: "e.g. 9876543210",
        validator: (v: string) => {
          const s = String(v ?? "").trim();
          if (!s) return { valid: true };
          if (!/^[6-9]\d{9}$/.test(s)) {
            return { valid: false, error: "Mobile must be 10 digits starting with 6-9" };
          }
          return { valid: true };
        },
      },
      { key: "challanNo", label: "Challan No.", type: "text" as const, placeholder: "Challan number" },
      { key: "transactionAmount", label: "Transaction Amount (₹)", type: "number" as const, placeholder: "0" },
      {
        key: "intercityTransfer",
        label: "Intercity Transfer (E-Way Bill Exempt)",
        type: "checkbox" as const,
      },
      {
        key: "ewayBillNo",
        label: "E-Way Bill No.",
        type: "text" as const,
        placeholder: "Enter E-Way Bill No.",
        requiredIf: (fd: Record<string, string>) => {
          if (fd.intercityTransfer === "true") return false;
          const v = parseFloat(String(fd.transactionAmount ?? "0"));
          return Number.isFinite(v) && v >= 50000;
        },
        validator: (v: string) => {
          const s = String(v ?? "").trim();
          if (!s) return { valid: true };
          if (!/^\d{12}$/.test(s)) {
            return { valid: false, error: "E-Way Bill No must be 12 digits" };
          }
          return { valid: true };
        },
      },
      { key: "remarks", label: "Remarks", type: "textarea" as const, placeholder: "Additional notes", span: 2 as const },
      { key: "photoAttachment", label: "Photo Attachment", type: "file" as const, accept: "image/*,application/pdf", multiple: true, span: 2 as const },
    ],
    lineItems: {
      label: "Return Items",
      addLabel: "Add Item",
      validateBeforeSubmit: (gridLines) => {
        const rowHasContent = (l: Record<string, unknown>) =>
          Object.values(l).some(
            (v) => v !== undefined && v !== null && String(v).trim() !== "",
          );
        if (!gridLines.some(rowHasContent)) return "Add at least one return item";
        for (let i = 0; i < gridLines.length; i++) {
          const l = gridLines[i];
          if (!rowHasContent(l)) continue;
          if (!String(l.itemId ?? "").trim()) {
            return `Line ${i + 1}: Material is required`;
          }
          const qty = parseFloat(String(l.returnQty ?? "")) || 0;
          if (qty <= 0) {
            return `Line ${i + 1}: Return quantity must be greater than 0`;
          }
        }
        return null;
      },
      fields: [
        {
          key: "itemId",
          label: "Material",
          type: "custom" as const,
          width: "wide",
          render: (line, update: (patch: Record<string, unknown>) => void) => (
            <GroupedMaterialSelect
              lazy
              value={line.itemId ?? ""}
              onChange={(v) => {
                if (!v) {
                  update({ itemId: "", itemName: "", uomCode: "" });
                  return;
                }
                update({ itemId: v });
              }}
              onSelect={(item) => {
                if (!item) return;
                update({ itemName: item.name ?? "", uomCode: item.uomCode ?? "" });
              }}
              items={items}
              groups={itemGroups.map((g) => ({
                id: g.id,
                name: g.name,
                status: g.status,
                itemCount: g.itemCount,
              }))}
              placeholder="Select material..."
              size="sm"
            />
          ),
        },
        { key: "uomCode", label: "UOM", type: "select" as const, options: uomOptions, placeholder: "UOM" },
        { key: "returnQty", label: "Return Qty", type: "number" as const, required: true, placeholder: "0" },
        { key: "unitRate", label: "Unit Rate (₹)", type: "number" as const, placeholder: "0" },
        { key: "batchNo", label: "Batch / Heat No.", type: "text" as const, placeholder: "Batch" },
        { key: "remarks", label: "Remarks", type: "text" as const, placeholder: "Line notes" },
      ],
    },
  };

  const columns: ColDef<GoodReturnRow>[] = [
    { key: "returnNumber", label: "Return No", sortable: true, searchable: true },
    { key: "projectName", label: "Project", sortable: false, searchable: true },
    { key: "vendorName", label: "Vendor", sortable: true, searchable: true },
    { key: "returnDate", label: "Date", type: "date", sortable: true },
    { key: "reason", label: "Reason", sortable: false, searchable: true, render: (row) => row.reason ? row.reason.replace(/_/g, " ") : "—" },
    {
      key: "status", label: "Status", type: "select",
      options: ["draft", "pending_approval", "approved", "rejected", "dispatched"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
    {
      key: "_actions",
      label: "Actions",
      width: "140px",
      sortable: false,
      // Icon-only row matching the Gate Pass list — View eye plus a
      // status-driven action icon (Submit / Approve / Reject /
      // Dispatch). Matches the Material Issue / Gate Pass UX so the
      // store user works the same way across all three modules.
      render: (row) => {
        const status = String(row.status ?? "draft").toLowerCase();
        const isDraft = status === "draft";
        const isPending = status === "pending_approval";
        const isApproved = status === "approved";
        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/store/good-return/${row.id}`);
              }}
              className="p-1 rounded hover:bg-gray-100 text-gray-500"
              title="View"
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
                className="p-1 rounded hover:bg-orange-50 text-orange-600"
                title="Submit for approval"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
            {isPending && canApprove && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openWorkflow("approve", row);
                  }}
                  className="p-1 rounded hover:bg-emerald-50 text-emerald-600"
                  title="Approve"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openWorkflow("reject", row);
                  }}
                  className="p-1 rounded hover:bg-rose-50 text-rose-600"
                  title="Reject"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </>
            )}
            {isApproved && canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDispatchTarget(row);
                }}
                className="p-1 rounded hover:bg-orange-50 text-orange-600"
                title="Mark as dispatched"
              >
                <Truck className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Good Return (Vendor)"
        subtitle="Return rejected or damaged materials to vendors"
        breadcrumbs={[{ label: "Store", href: "/store" }, { label: "Good Return" }]}
      />
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer>
        <DataTable
          id="store-good-return"
          columns={columns}
          data={data as unknown as GoodReturnRow[]}
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
          onAdd={canAdd ? () => setDrawerOpen(true) : undefined}
          addLabel="New Return"
          historyEntityType="good_return"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />

      <WorkflowConfirmDialog
        action={workflowAction?.kind ?? null}
        pending={workflowPending}
        rejectReason={rejectReason}
        onRejectReasonChange={setRejectReason}
        onClose={closeWorkflow}
        onConfirm={runWorkflowAction}
        entityNoun="Good Return"
        entityLabel={workflowAction?.row?.returnNumber ?? ""}
        approveHint="Once approved, the return is ready for dispatch back to the vendor."
        rejectPlaceholder="e.g. damage report incomplete; reattach photos"
      />

      <ConfirmDialog
        open={!!dispatchTarget}
        onClose={() => (dispatchPending ? null : setDispatchTarget(null))}
        onConfirm={runDispatch}
        loading={dispatchPending}
        tone="primary"
        title="Mark as Dispatched"
        confirmLabel="Dispatch"
        message={
          dispatchTarget ? (
            <div>
              Mark return{" "}
              <span className="font-semibold text-gray-900">
                {dispatchTarget.returnNumber}
              </span>{" "}
              as dispatched? Use this once the material has physically
              left the store on its way back to the vendor.
            </div>
          ) : null
        }
      />
    </>
  );
}
