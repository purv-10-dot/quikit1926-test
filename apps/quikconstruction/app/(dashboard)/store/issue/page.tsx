"use client";

/**
 * Material Issue — list + rich create drawer.
 *
 * The drawer mirrors the standard construction-ERP material-issue
 * slip: header metadata (Issue Date / Type / Project / refs /
 * vehicle / gate pass), a per-line Issue Items grid with source-
 * location stock lookups, plus the e-way bill gate and a photo
 * attachment.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Send, Check, X as XIcon } from "lucide-react";
import {
  PageHeader, PageContainer, StatusChip, TabBar,
} from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { WorkflowConfirmDialog } from "@/components/WorkflowConfirmDialog";
import { useMaterialIssues } from "@/hooks/use-store";
import { usePurchaseRequisitions } from "@/hooks/use-purchase";
import { useWorkOrders } from "@/hooks/use-projects";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { SelectInput } from "@/components/FormDrawer";
import {
  useProjects,
  useItems,
  useLocations,
  useContractors,
} from "@/hooks/use-masters";
import { usePermissions } from "@/hooks/use-permissions";
import { useQueryClient } from "@tanstack/react-query";
import { buildTabCounts, filterByTab, type TabSpec } from "@/lib/tab-counts";

const MENU_KEY = "store.issue";

const TABS: TabSpec[] = [
  { key: "all", label: "All" },
  { key: "requested", label: "Requested" },
  { key: "draft", label: "Draft" },
  { key: "issued", label: "Issued" },
  { key: "cancelled", label: "Cancelled" },
];

// Self Work = own site labour / departmental consumption, no external
// contractor. The WO Reference field auto-hides for this (and every
// non Sub-Contractor option) because the `woReference` field declares
// `hidden: fd.issueType !== "Sub-Contractor"`.
const ISSUE_TYPE_OPTIONS = [
  { value: "Sub-Contractor", label: "Sub-Contractor" },
  { value: "Self Work", label: "Self Work" },
  { value: "Direct Consumption", label: "Direct Consumption" },
  { value: "Equipment", label: "Equipment" },
  { value: "Internal Transfer", label: "Internal Transfer" },
  { value: "Returnable", label: "Returnable" },
];

export default function MaterialIssuePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Workflow action state — shared across rows. The Submit / Approve /
  // Reject buttons in the Actions column open a single ConfirmDialog;
  // the `kind` discriminant picks the endpoint, the `row` carries the
  // Material Issue id + display label for the dialog.
  const [workflowAction, setWorkflowAction] = useState<
    { kind: "submit" | "approve" | "reject"; row: any } | null
  >(null);
  const [rejectReason, setRejectReason] = useState("");
  const [workflowPending, setWorkflowPending] = useState(false);

  // RBAC — mirror the Material Estimation / Work Order gates. Submit
  // uses the Edit permission (the creator is the submitter); Approve
  // is restricted to tenant admins / project managers until there's a
  // dedicated `store.issue.approve` permission key.
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
        const res = await fetch(`/api/store/issues/${row.id}/submit`, {
          method: "POST",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      } else {
        const action = kind === "approve" ? "approve" : "reject";
        const res = await fetch(`/api/store/issues/${row.id}/approve`, {
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
      qc.invalidateQueries({ queryKey: ["material-issues"] });
      setWorkflowAction(null);
      setRejectReason("");
    } catch (err: any) {
      alert(err?.message ?? "Action failed");
    } finally {
      setWorkflowPending(false);
    }
  };

  const { data: result } = useMaterialIssues({ status: "all" });
  const allRows = result?.data ?? [];
  const tabs = useMemo(() => buildTabCounts(allRows, TABS), [allRows]);
  const data = useMemo(() => filterByTab(allRows, activeTab, TABS), [allRows, activeTab]);

  const { data: projectsData } = useProjects();
  const { data: itemsData } = useItems();
  const { data: contractorsData } = useContractors();
  const { data: locData } = useLocations();
  // PR eligibility for Material Issue: any PR that has cleared the
  // approval workflow. Covers both stock-available and
  // indent-required variants plus partial-issue follow-ups so the
  // store user can always find a PR they've signed off on. Stock
  // availability is enforced at issue-time per line, not at PR
  // selection — a PR can carry mixed items where some are in stock
  // and others aren't.
  const { data: prsData } = usePurchaseRequisitions({ status: "all" });
  const prOptions = (prsData?.data ?? [])
    .filter((p: any) =>
      [
        "approved",
        "approved_stock_available",
        "approved_indent_required",
        "partially_issued",
      ].includes(p.status),
    )
    .map((p: any) => ({
      value: p.prNumber,
      label: p.prNumber,
    }));

  // Work Order dropdown — scoped to WOs that have cleared their own
  // approval workflow. A draft/pending WO isn't a valid issue target:
  // the store can't hand materials to a sub-contractor whose scope
  // hasn't been signed off yet. List page columns show "DRAFT",
  // "APPROVED", "IN_PROGRESS", "COMPLETED", "CLOSED" — everything from
  // approved onward is live scope the contractor can draw against.
  const { data: wosData } = useWorkOrders({ status: "all" });
  const woOptions = (wosData?.data ?? [])
    .filter((w: any) =>
      ["approved", "in_progress", "completed"].includes(
        String(w.status ?? "").toLowerCase(),
      ),
    )
    .map((w: any) => ({
      value: w.woNumber ?? w.id,
      label: w.woNumber ?? w.id,
    }));

  const projectOptions = (projectsData?.data ?? []).map((p: any) => ({
    value: p.id,
    label: p.name,
  }));
  const items: any[] = itemsData?.data ?? [];
  const itemOptions = items.map((i: any) => ({
    value: i.id,
    label: `${i.code} — ${i.name}`,
  }));
  const itemById = useMemo(() => {
    const m = new Map<string, any>();
    for (const i of items) m.set(i.id, i);
    return m;
  }, [items]);
  const contractorOptions = (contractorsData?.data ?? [])
    .filter((c: any) => c.status !== "blacklisted")
    .map((c: any) => ({
      value: c.id,
      label: c.companyName || c.name || c.id,
    }));
  const locationOptions = (locData?.data ?? []).map((l: any) => ({
    value: l.id,
    label: l.name,
  }));
  const todayIso = new Date().toISOString().slice(0, 10);

  const config = {
    title: "Issue Material",
    subtitle: "Issue materials from store to site / project / contractor",
    apiEndpoint: "/api/store/issues",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["material-issues"] }),
    fields: [
      {
        key: "issueDate",
        label: "Issue Date",
        type: "date" as const,
        required: true,
        defaultValue: todayIso,
      },
      {
        key: "issueType",
        label: "Issue Type",
        type: "select" as const,
        required: true,
        options: ISSUE_TYPE_OPTIONS,
        placeholder: "Select type…",
        defaultValue: "Sub-Contractor",
      },
      {
        key: "projectId",
        label: "Project",
        type: "select" as const,
        required: true,
        options: projectOptions,
        placeholder: "Select Project…",
      },
      {
        key: "prReference",
        label: "PR Reference",
        type: "select" as const,
        required: true,
        options: prOptions,
        placeholder:
          prOptions.length === 0
            ? "No approved PRs available"
            : "Select an approved PR\u2026",
      },
      {
        key: "contractorId",
        label: "Contractor",
        type: "select" as const,
        // Contractor only makes sense when the material is handed to an
        // external sub-contractor. Self Work (own-site labour / own
        // team) explicitly has no contractor, so hide the field and
        // require it only for the Sub-Contractor path.
        hiddenIf: (fd: Record<string, string>) =>
          fd.issueType === "Self Work",
        requiredIf: (fd: Record<string, string>) =>
          fd.issueType === "Sub-Contractor",
        options: contractorOptions,
        placeholder: "Select Contractor…",
      },
      {
        // Self Work analogue of the Contractor field — captures the
        // own-site team that's drawing the material (e.g. "Civil Team
        // A", "MEP Crew", "Store keeper"). Visible + required only
        // when Issue Type == "Self Work" so the other paths don't see
        // a field that doesn't apply to them.
        key: "teamDepartment",
        label: "Team / Department",
        type: "text" as const,
        hiddenIf: (fd: Record<string, string>) =>
          fd.issueType !== "Self Work",
        requiredIf: (fd: Record<string, string>) =>
          fd.issueType === "Self Work",
        placeholder: "e.g. Civil Team A",
      },
      {
        // Only relevant when issuing to a sub-contractor — hidden for
        // Self-Work, Direct Consumption, Internal Transfer, Equipment,
        // Returnable. Required + visible only when Issue Type ==
        // "Sub-Contractor" so the store can't attach a WO Reference
        // to an issue where it doesn't apply.
        //
        // Populated from approved/in-progress/completed Work Orders
        // only (draft and pending-approval WOs are excluded above via
        // `useWorkOrders` — the store can't issue against scope that
        // hasn't been signed off yet).
        key: "woReference",
        label: "WO Reference",
        type: "select" as const,
        hiddenIf: (fd: Record<string, string>) =>
          fd.issueType !== "Sub-Contractor",
        requiredIf: (fd: Record<string, string>) =>
          fd.issueType === "Sub-Contractor",
        options: woOptions,
        placeholder:
          woOptions.length === 0
            ? "No approved work orders"
            : "Select Work Order\u2026",
      },
      {
        key: "issuedBy",
        label: "Issued By",
        type: "text" as const,
        placeholder: "Name of issuer",
      },
      {
        key: "receivedBy",
        label: "Received By",
        type: "text" as const,
        placeholder: "Name of receiver",
      },
      {
        key: "vehicleNo",
        label: "Vehicle No.",
        type: "text" as const,
        placeholder: "e.g. MP04-AB-1234",
      },
      {
        key: "gatePassNo",
        label: "Gate Pass No.",
        type: "text" as const,
        placeholder: "e.g. GP-2026-001",
      },
      {
        key: "transactionAmount",
        label: "Transaction Amount (₹)",
        type: "number" as const,
        placeholder: "0",
        hint: "E-Way Bill No becomes mandatory when this is ₹50,000 or more (exempt for intercity transfers).",
      },
      {
        // Intra-city transfers are exempt from the E-Way Bill
        // ≥ ₹50,000 rule under GSTN thresholds. Ticking this
        // removes the conditional requirement below.
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
      {
        key: "photoAttachment",
        label: "Photo Attachment",
        type: "file" as const,
        accept: "image/*,application/pdf",
        multiple: true,
        span: 2 as const,
      },
      {
        key: "remarks",
        label: "Remarks / Notes",
        type: "textarea" as const,
        span: 2 as const,
        placeholder: "Issue notes, instructions for the receiver, etc.",
      },
    ],
    lineItems: {
      label: "Issue Items",
      // Fields kept for payload serialisation; the card layout is
      // produced by `rowRender` below.
      fields: [
        { key: "itemId", label: "itemId", type: "text" as const },
        { key: "itemName", label: "itemName", type: "text" as const },
        { key: "uomCode", label: "uomCode", type: "text" as const },
        {
          key: "sourceLocationId",
          label: "sourceLocationId",
          type: "text" as const,
        },
        { key: "availableStock", label: "stock", type: "number" as const },
        { key: "reqQty", label: "reqQty", type: "number" as const },
        { key: "quantity", label: "issueQty", type: "number" as const },
        { key: "batchNo", label: "batchNo", type: "text" as const },
        { key: "equipmentNo", label: "equipmentNo", type: "text" as const },
        { key: "remarks", label: "remarks", type: "text" as const },
      ],
      rowRender: (
        line: Record<string, any>,
        update: (patch: Record<string, any>) => void,
        ctx: { formData?: Record<string, string> } = {},
      ) => {
        const formProjectId = ctx.formData?.projectId ?? "";

        // Pull live on-hand quantity from the stock ledger. Only the
        // item id is required; project and location narrow the scope
        // if supplied. This lets the row populate Available Stock as
        // soon as the material is picked — the endpoint widens to a
        // tenant-wide total until a location is chosen.
        const fetchStock = async (
          itemId: string,
          projectId: string,
          locationId: string,
        ) => {
          if (!itemId) return;
          const params = new URLSearchParams({ itemId });
          if (projectId) params.set("projectId", projectId);
          if (locationId) params.set("locationId", locationId);
          try {
            const res = await fetch(
              `/api/store/stock-balance?${params.toString()}`,
            );
            if (!res.ok) return;
            const json = await res.json();
            const qty = Number(json?.quantity ?? 0);
            // Only overwrite when the ledger actually has something to
            // say. A zero response means either the item has never
            // moved through a GRN/transfer/issue OR the stock ledger
            // isn't wired up yet — in both cases we'd rather keep the
            // Items-master seed (minStockLevel) visible than flip the
            // field back to "0".
            if (qty > 0) update({ availableStock: String(qty) });
          } catch {
            // Swallow — stock stays at whatever the UI last showed.
          }
        };

        return (
        <div className="space-y-3">
          {/* Row 1 — Material (wide) + Source Location + UOM */}
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Material <span className="text-red-500">*</span>
              </label>
              <div className="mt-1">
                <SelectInput
                  value={line.itemId ?? ""}
                  onChange={(v) => {
                    const item = v ? itemById.get(v) : null;
                    const patch: Record<string, any> = { itemId: v };
                    if (item) {
                      patch.itemName = item.name ?? "";
                      patch.uomCode = item.uomCode ?? "";
                      patch.availableStock = String(
                        item.minStockLevel ??
                          item.currentStock ??
                          item.stockOnHand ??
                          "0",
                      );
                    } else {
                      patch.itemName = "";
                      patch.uomCode = "";
                      patch.availableStock = "0";
                    }
                    update(patch);
                    fetchStock(v, formProjectId, line.sourceLocationId ?? "");
                  }}
                  placeholder="Select material…"
                  options={itemOptions}
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Source Location
              </label>
              <div className="mt-1">
                <SelectInput
                  value={line.sourceLocationId ?? ""}
                  onChange={(v) => {
                    update({ sourceLocationId: v });
                    fetchStock(line.itemId ?? "", formProjectId, v);
                  }}
                  placeholder="Select…"
                  options={locationOptions}
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                UOM
              </label>
              <div className="mt-1 h-[38px] px-3 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium uppercase text-gray-700">
                {line.uomCode || "—"}
              </div>
            </div>
          </div>

          {/* Row 2 — Stock / Req Qty / Issue Qty / Batch / Equipment */}
          <div className="grid grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Available Stock
              </label>
              <div className="mt-1 h-[38px] px-2 flex items-center justify-end rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-800 tabular-nums">
                {line.availableStock
                  ? Number(line.availableStock).toLocaleString("en-IN")
                  : "0"}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Req. Qty
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={line.reqQty ?? ""}
                onChange={(e) => update({ reqQty: e.target.value })}
                placeholder="0"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Issue Qty <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={line.quantity ?? ""}
                onChange={(e) => update({ quantity: e.target.value })}
                placeholder="0"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Batch / Heat No.
              </label>
              <input
                type="text"
                value={line.batchNo ?? ""}
                onChange={(e) => update({ batchNo: e.target.value })}
                placeholder="Batch"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Equipment No.
              </label>
              <input
                type="text"
                value={line.equipmentNo ?? ""}
                onChange={(e) => update({ equipmentNo: e.target.value })}
                placeholder="Eqpt No."
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          {/* Row 3 — Remarks */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-1">
              Remarks
            </label>
            <input
              type="text"
              value={line.remarks ?? ""}
              onChange={(e) => update({ remarks: e.target.value })}
              placeholder="Line-level notes"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
        );
      },
    },
  };

  const columns: ColDef<any>[] = [
    {
      key: "issueNumber",
      label: "Issue No",
      sortable: true,
      searchable: true,
    },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    {
      key: "issuedToName",
      label: "Issued To",
      sortable: true,
      searchable: true,
      // Read the server-computed `issuedToName` first (new records),
      // then fall back to whichever input actually carries the name
      // for older rows that predate the POST-route fix:
      //   - Self Work  → teamDepartment
      //   - otherwise  → contractorName or receivedBy.
      render: (row) =>
        row.issuedToName ||
        (row.issueType === "Self Work" ? row.teamDepartment : "") ||
        row.contractorName ||
        row.receivedBy ||
        "—",
    },
    { key: "issueDate", label: "Date", type: "date", sortable: true },
    {
      key: "lineCount",
      label: "Items",
      type: "number",
      sortable: true,
      render: (row) => `${row.lineCount ?? 0} items`,
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
        "cancelled",
      ],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
    {
      key: "_actions",
      label: "Actions",
      width: "110px",
      render: (row) => {
        const status = String(row.status ?? "draft").toLowerCase();
        const isDraft = status === "draft";
        const isPending = status === "pending_approval";
        const isApproved = status === "approved";
        // Icon-only actions — keeps the column tight and matches the
        // compact look the user wanted. Tone comes from the icon
        // colour; hover ring stays neutral so the row doesn't flash.
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/store/issue/${row.id}`);
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
            {isPending && canApprove && (
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
            {isPending && !canApprove && (
              <span
                className="p-1.5 text-amber-500"
                title="Awaiting approver"
              >
                <Send className="w-4 h-4 opacity-50" />
              </span>
            )}
            {isApproved && (
              <span
                className="p-1.5 text-emerald-500"
                title="Locked — material issue is approved"
              >
                <Check className="w-4 h-4" />
              </span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Material Issue"
        subtitle="Issue materials from store to site / contractor / equipment"
        breadcrumbs={[
          { label: "Store", href: "/store" },
          { label: "Material Issue" },
        ]}
      />
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer>
        <DataTable
          id="store-material-issue"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="Issue Material"
          defaultSort="issueDate"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        config={config}
      />

      <WorkflowConfirmDialog
        action={workflowAction?.kind ?? null}
        pending={workflowPending}
        rejectReason={rejectReason}
        onRejectReasonChange={setRejectReason}
        onClose={closeWorkflow}
        onConfirm={runWorkflowAction}
        entityNoun="Material Issue"
        entityLabel={workflowAction?.row?.issueNumber ?? ""}
        approveHint="Once approved, the stock ledger will post on issue."
        rejectPlaceholder="e.g. stock short at the requested location"
      />
    </>
  );
}
