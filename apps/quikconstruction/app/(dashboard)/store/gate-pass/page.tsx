"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, ArrowLeft, Truck, Send, Check, X as XIcon,
  CheckCircle2, Eye,
} from "lucide-react";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { WorkflowConfirmDialog } from "@/components/WorkflowConfirmDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useGatePasses } from "@/hooks/use-store";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import {
  useProjects,
  useLocations,
  useItems,
  useUOMs,
} from "@/hooks/use-masters";
import { usePermissions } from "@/hooks/use-permissions";
import { useQueryClient } from "@tanstack/react-query";
import { buildTabCounts, filterByTab, type TabSpec } from "@/lib/tab-counts";

const MENU_KEY = "store.gate_pass";

const TABS: TabSpec[] = [
  { key: "all", label: "All" },
  { key: "issued", label: "Issued" },
  { key: "returned", label: "Returned" },
  { key: "closed", label: "Closed" },
];

// Reference Type drives which document the gate pass is tied to. Left
// as free-text Reference No for now — a future pass can upgrade it to
// a scoped dropdown (e.g. pick a GRN from the GRN list when type=grn).
const REFERENCE_TYPE_OPTIONS = [
  { value: "grn", label: "GRN" },
  { value: "material_issue", label: "Material Issue" },
  { value: "po", label: "Purchase Order" },
  { value: "indent", label: "Indent" },
  { value: "transfer", label: "Stock Transfer" },
  { value: "return", label: "Good Return" },
  { value: "other", label: "Other" },
];

// Human label for the reference document — shown as a sub-line under
// the reference number in the list view.
const REFERENCE_LABEL: Record<string, string> = {
  grn: "GRN",
  material_issue: "Material Issue",
  po: "Purchase Order",
  indent: "Indent",
  transfer: "Stock Transfer",
  return: "Good Return",
  other: "Other",
};

const MATERIAL_CONDITION_OPTIONS = [
  { value: "as_per_grn", label: "As per GRN" },
  { value: "ok", label: "OK" },
  { value: "damaged", label: "Damaged" },
  { value: "short_supply", label: "Short Supply" },
];

// Render the Type cell exactly like the second screenshot: a coloured
// directional pill plus an optional RETURNABLE chip when the GP is an
// outward returnable.
function TypePill({ type }: { type: string }) {
  const t = String(type ?? "").toLowerCase();
  if (t === "inward") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200">
        <ArrowRight className="w-3 h-3" /> Inward
      </span>
    );
  }
  if (t === "returnable") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200">
          <ArrowLeft className="w-3 h-3" /> Outward
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold text-gray-700 bg-gray-100 border border-gray-200 uppercase tracking-wide">
          Returnable
        </span>
      </span>
    );
  }
  if (t === "non_returnable") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200">
          <ArrowLeft className="w-3 h-3" /> Outward
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold text-gray-600 bg-gray-100 border border-gray-200 uppercase tracking-wide">
          Non-Ret.
        </span>
      </span>
    );
  }
  // outward
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200">
      <ArrowLeft className="w-3 h-3" /> Outward
    </span>
  );
}

export default function GatePassPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Workflow action state — shared across rows. Submit / Approve /
  // Reject open the WorkflowConfirmDialog; Quick Close opens the
  // simpler ConfirmDialog below.
  const [workflowAction, setWorkflowAction] = useState<
    { kind: "submit" | "approve" | "reject"; row: any } | null
  >(null);
  const [rejectReason, setRejectReason] = useState("");
  const [workflowPending, setWorkflowPending] = useState(false);
  const [closeTarget, setCloseTarget] = useState<any | null>(null);
  const [closePending, setClosePending] = useState(false);

  const { permissionMatrix, isSuper, hasRole } = usePermissions();
  const matrixRow = permissionMatrix?.[MENU_KEY];
  const canEdit = isSuper || !matrixRow || matrixRow.edit !== false;
  const canSubmit = canEdit;
  const canApprove =
    isSuper || hasRole(["tenant_admin", "project_manager"]);

  const openWorkflow = (
    kind: "submit" | "approve" | "reject",
    row: any,
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
        const res = await fetch(`/api/store/gate-passes/${row.id}/submit`, {
          method: "POST",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      } else {
        const action = kind === "approve" ? "approve" : "reject";
        const res = await fetch(`/api/store/gate-passes/${row.id}/approve`, {
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
      qc.invalidateQueries({ queryKey: ["gate-passes"] });
      setWorkflowAction(null);
      setRejectReason("");
    } catch (err: any) {
      alert(err?.message ?? "Action failed");
    } finally {
      setWorkflowPending(false);
    }
  };

  const runQuickClose = async () => {
    if (!closeTarget) return;
    setClosePending(true);
    try {
      const res = await fetch(`/api/store/gate-passes/${closeTarget.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: ["gate-passes"] });
      setCloseTarget(null);
    } catch (err: any) {
      alert(err?.message ?? "Close failed");
    } finally {
      setClosePending(false);
    }
  };

  const { data: result } = useGatePasses({ status: "all" });
  const allRows = result?.data ?? [];
  const tabs = useMemo(() => buildTabCounts(allRows, TABS), [allRows]);
  const data = useMemo(() => filterByTab(allRows, activeTab, TABS), [allRows, activeTab]);

  const { data: projectsData } = useProjects();
  const { data: locationsData } = useLocations();
  const { data: itemsData } = useItems();
  const { data: uomsData } = useUOMs();

  const projectOptions = (projectsData?.data ?? []).map((p: any) => ({ value: p.id, label: p.name }));
  const locationOptions = (locationsData?.data ?? []).map((l: any) => ({ value: l.id, label: l.name }));

  const items = (itemsData?.data ?? []) as any[];
  const itemOptions = items.map((i: any) => ({
    value: i.id,
    label: `${i.code} — ${i.name}`,
  }));
  const itemById = useMemo(() => {
    const m = new Map<string, any>();
    for (const i of items) m.set(i.id, i);
    return m;
  }, [items]);
  const uomOptions = (uomsData?.data ?? []).map((u: any) => ({
    value: u.code,
    label: u.code,
  }));

  const todayIso = new Date().toISOString().slice(0, 10);

  const config = {
    title: "New Gate Pass",
    subtitle: "Track inward and outward movement of materials",
    apiEndpoint: "/api/store/gate-passes",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gate-passes"] }),
    fields: [
      // Row 1 — Project / Location
      {
        key: "projectId",
        label: "Project",
        type: "select" as const,
        searchable: true,
        required: true,
        options: projectOptions,
        placeholder: "Select project",
      },
      {
        key: "locationId",
        label: "Location",
        type: "select" as const,
        searchable: true,
        options: locationOptions,
        placeholder: "Select location",
      },

      // Row 2 — Date + Type
      {
        key: "gatePassDate",
        label: "Date",
        type: "date" as const,
        required: true,
        defaultValue: todayIso,
      },
      {
        key: "type",
        label: "Type",
        type: "select" as const,
        required: true,
        options: [
          { value: "inward", label: "Inward" },
          { value: "outward", label: "Outward" },
          { value: "returnable", label: "Returnable" },
          { value: "non_returnable", label: "Non-Returnable" },
        ],
        placeholder: "Select type",
        defaultValue: "inward",
        // When the user flips Type to Returnable, auto-suggest an
        // Expected Return Date of gate-pass-date + 10 days. The user
        // can still override it. Flipping AWAY from returnable clears
        // the field so a stale value doesn't ride along on a type
        // that doesn't expect one. Matches the 10-day default the
        // reference project seeds for returnable gate passes.
        onChange: (
          value: string,
          formData: Record<string, string>,
        ) => {
          if (value !== "returnable") {
            return { expectedReturnDate: "" };
          }
          const base = formData.gatePassDate || todayIso;
          const d = new Date(base);
          if (Number.isNaN(d.getTime())) return;
          d.setDate(d.getDate() + 10);
          return { expectedReturnDate: d.toISOString().slice(0, 10) };
        },
      },

      // Row 3 — Source document reference
      {
        key: "referenceType",
        label: "Reference Type",
        type: "select" as const,
        required: true,
        options: REFERENCE_TYPE_OPTIONS,
        placeholder: "Select reference type",
        defaultValue: "grn",
      },
      {
        key: "referenceNo",
        label: "Reference No.",
        type: "text" as const,
        placeholder: "e.g. GRN-001",
      },

      // Row 4 — Vehicle / driver
      {
        key: "vehicleNo",
        label: "Vehicle No.",
        type: "text" as const,
        required: true,
        placeholder: "Vehicle number",
      },
      {
        key: "driverName",
        label: "Driver Name",
        type: "text" as const,
        placeholder: "Driver name",
      },
      {
        key: "driverMobileNo",
        label: "Driver Mobile No.",
        type: "text" as const,
        placeholder: "e.g. 9876543210",
        validator: (v: string) => {
          const s = String(v ?? "").trim();
          if (!s) return { valid: true };
          if (!/^[6-9]\d{9}$/.test(s)) {
            return {
              valid: false,
              error: "Mobile must be 10 digits starting with 6-9",
            };
          }
          return { valid: true };
        },
      },
      {
        key: "challanNo",
        label: "Challan No.",
        type: "text" as const,
        placeholder: "Challan number",
      },

      // Row 5 — Returnable-only Expected Return Date. Hidden for any
      // non-returnable type so the form doesn't clutter inward / outward
      // / non-returnable flows with a field that wouldn't apply.
      {
        key: "expectedReturnDate",
        label: "Expected Return Date",
        type: "date" as const,
        hiddenIf: (fd: Record<string, string>) => fd.type !== "returnable",
        requiredIf: (fd: Record<string, string>) => fd.type === "returnable",
      },
      {
        key: "transactionAmount",
        label: "Transaction Amount (₹)",
        type: "number" as const,
        placeholder: "0",
      },
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

      // Row 6 — Gate-house + condition
      {
        key: "securityGuard",
        label: "Security Guard",
        type: "text" as const,
        placeholder: "Guard Name",
      },
      {
        key: "materialCondition",
        label: "Material Condition",
        type: "select" as const,
        options: MATERIAL_CONDITION_OPTIONS,
        defaultValue: "as_per_grn",
      },
      {
        key: "weighbridgeReading",
        label: "Weighbridge Reading (MT)",
        type: "number" as const,
        placeholder: "e.g. 15.4",
      },
      {
        key: "vehiclePhoto",
        label: "Vehicle Photo",
        type: "file" as const,
        accept: "image/*",
      },

      // Row 7 — Free text fields
      {
        key: "purpose",
        label: "Purpose",
        type: "text" as const,
        placeholder: "Purpose of gate pass",
        span: 2 as const,
      },
      {
        key: "remarks",
        label: "Remarks",
        type: "textarea" as const,
        placeholder: "Any additional notes",
        span: 2 as const,
      },
    ],
    lineItems: {
      label: "Material Details",
      addLabel: "Add Item",
      fields: [
        {
          key: "itemId",
          label: "Material",
          type: "select" as const,
          searchable: true,
          required: true,
          options: itemOptions,
          placeholder:
            itemOptions.length === 0 ? "No items in master" : "Select material…",
          onChange: (value: string) => {
            const item = value ? itemById.get(value) : null;
            if (!item) {
              return {
                materialDescription: "",
                uomCode: "",
              };
            }
            return {
              materialDescription: `${item.code} — ${item.name}`,
              uomCode: item.uomCode ?? "",
            };
          },
        },
        {
          key: "uomCode",
          label: "UOM",
          type: "select" as const,
          options: uomOptions,
          placeholder: "UOM",
        },
        {
          key: "quantity",
          label: "Quantity",
          type: "number" as const,
          placeholder: "0",
        },
        {
          key: "remarks",
          label: "Remarks",
          type: "text" as const,
          placeholder: "Line notes",
        },
      ],
    },
  };

  const isOverdue = (row: any) => {
    if (!row?.expectedReturnDate) return false;
    const status = String(row.status ?? "").toLowerCase();
    if (status === "closed" || status === "returned") return false;
    return row.expectedReturnDate < todayIso;
  };

  const columns: ColDef<any>[] = [
    {
      key: "gatePassNumber",
      label: "Gate Pass No",
      sortable: true,
      searchable: true,
      render: (row) => {
        const isInward =
          String(row.type ?? "").toLowerCase() === "inward";
        return (
          <div className="flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-md flex items-center justify-center ${
                isInward
                  ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                  : "bg-rose-50 text-rose-600 border border-rose-200"
              }`}
              title={isInward ? "Inward" : "Outward"}
            >
              <Truck className="w-4 h-4" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">
                {row.gatePassNumber ?? "—"}
              </div>
              <div className="text-[11px] text-gray-500">
                Date: {row.gatePassDate ?? "—"}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "type",
      label: "Type",
      type: "select",
      options: ["inward", "outward", "returnable", "non_returnable"],
      sortable: true,
      render: (row) => <TypePill type={row.type} />,
    },
    {
      key: "referenceNo",
      label: "Reference",
      sortable: true,
      searchable: true,
      // Priority order:
      //   1. both type + number  → number (primary) + type (subline)
      //   2. only a type         → type label on its own line — users
      //                            often pick a type before they have
      //                            the doc number in hand, so hiding
      //                            the type here looked like the pick
      //                            was lost.
      //   3. only a number       → number on its own
      //   4. neither             → em dash
      render: (row) => {
        const ref = row.referenceNo;
        const refLabel = REFERENCE_LABEL[row.referenceType];
        if (ref && refLabel) {
          return (
            <div className="leading-tight">
              <div className="text-sm font-medium text-blue-600">{ref}</div>
              <div className="text-[11px] text-gray-500">{refLabel}</div>
            </div>
          );
        }
        if (refLabel) {
          return (
            <span className="text-sm text-gray-700">{refLabel}</span>
          );
        }
        if (ref) {
          return (
            <span className="text-sm font-medium text-blue-600">{ref}</span>
          );
        }
        return <span className="text-gray-400">—</span>;
      },
    },
    {
      key: "vehicleNo",
      label: "Vehicle Info",
      sortable: true,
      render: (row) => (
        <div className="leading-tight">
          <div className="text-sm font-medium text-gray-900">
            {row.vehicleNo || "—"}
          </div>
          {row.driverName && (
            <div className="text-[11px] text-amber-700">
              Driver: {row.driverName}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "expectedReturnDate",
      label: "Expected Return",
      type: "date",
      sortable: true,
      render: (row) => {
        if (!row.expectedReturnDate) {
          return <span className="text-gray-400">—</span>;
        }
        return (
          <div className="leading-tight">
            <div className="text-sm text-gray-800">{row.expectedReturnDate}</div>
            {isOverdue(row) && (
              <div className="mt-0.5">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-white bg-rose-600 uppercase">
                  Overdue
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        "draft",
        "pending_approval",
        "approved",
        "rejected",
        "issued",
        "returned",
        "closed",
      ],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
    {
      key: "_actions",
      label: "Actions",
      width: "140px",
      // Icon-only row to match the requested look (View eye + a single
      // status-driven action icon). The action icon is colour-coded by
      // intent (orange Submit / green Approve / red Reject / green
      // Quick Close); the View eye is always available.
      render: (row) => {
        const status = String(row.status ?? "draft").toLowerCase();
        const isDraft = status === "draft";
        const isPending = status === "pending_approval";
        const isApproved = status === "approved" || status === "issued";
        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/store/gate-pass/${row.id}`);
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
                  setCloseTarget(row);
                }}
                className="p-1 rounded hover:bg-emerald-50 text-emerald-600"
                title="Quick close gate pass"
              >
                <CheckCircle2 className="w-4 h-4" />
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
        title="Gate Pass Management"
        subtitle="Track inward and outward movement of materials"
        breadcrumbs={[{ label: "Store", href: "/store" }, { label: "Gate Pass" }]}
      />
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer>
        <DataTable
          id="store-gate-pass"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="New Gate Pass"
          defaultSort="gatePassDate"
          defaultSortDir="desc"
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
        entityNoun="Gate Pass"
        entityLabel={workflowAction?.row?.gatePassNumber ?? ""}
        approveHint="Once approved, the gate pass is live at the gate-house."
        rejectPlaceholder="e.g. vehicle/driver mismatch with challan"
      />

      <ConfirmDialog
        open={!!closeTarget}
        onClose={() => (closePending ? null : setCloseTarget(null))}
        onConfirm={runQuickClose}
        loading={closePending}
        tone="primary"
        title="Close Gate Pass"
        confirmLabel="Close"
        message={
          closeTarget ? (
            <div>
              Mark gate pass{" "}
              <span className="font-semibold text-gray-900">
                {closeTarget.gatePassNumber}
              </span>{" "}
              as closed? Use this once the material movement is complete (or
              the returnable item is back on site).
            </div>
          ) : null
        }
      />
    </>
  );
}
