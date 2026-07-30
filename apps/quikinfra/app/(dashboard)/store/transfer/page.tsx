"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Eye, Send, Check, X as XIcon, Truck, PackageCheck,
} from "lucide-react";
import { PageFrame, PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { WorkflowConfirmDialog } from "@/components/WorkflowConfirmDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useServerTabList } from "@/hooks/use-server-tab-list";
import { QuickCreateDrawer, type QuickCreateConfig } from "@/components/QuickCreateDrawer";
import { GroupedMaterialSelect, type GroupedMaterialSelectItem } from "@/components/GroupedMaterialSelect";
import { useProjects, useItemGroups, useLocations, useUOMs, useAssets } from "@/hooks/use-masters";
import { usePermissions, useMenuActions } from "@/hooks/use-permissions";
import { useQueryClient } from "@tanstack/react-query";
import { INDIAN_STATES, citiesForState } from "@/lib/data/india-geo";
import { type TabSpec } from "@/lib/tab-counts";
import { toast } from "@/lib/toast";

const MENU_KEY = "store.transfer";

const TABS: TabSpec[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "dispatched", label: "Dispatched" },
  { key: "in_transit", label: "In Transit" },
  { key: "received", label: "Received" },
];

// Transfer Type — drives which fields are shown. Two variants only:
//   - intra_site:   same project, no destination project field
//   - inter_project: cross-project move, adds a Destination Project
//                    picker and a Chargeable Transfer toggle (debit
//                    note to the receiving project).
const TRANSFER_TYPE_OPTIONS = [
  { value: "intra_site", label: "Intra-Site (Same Project)" },
  { value: "inter_project", label: "Inter-Project" },
];

const TRANSFER_REASON_OPTIONS = [
  { value: "project_requirement", label: "Project Requirement" },
  { value: "surplus_redistribution", label: "Surplus Redistribution" },
  { value: "stock_consolidation", label: "Stock Consolidation" },
  { value: "shortage_at_destination", label: "Shortage at Destination" },
  { value: "equipment_relocation", label: "Equipment Relocation" },
  { value: "return_to_warehouse", label: "Return to Warehouse" },
  { value: "other", label: "Other" },
];

const DISPATCH_CONDITION_OPTIONS = [
  { value: "good", label: "Good" },
  { value: "ok", label: "OK" },
  { value: "damaged", label: "Damaged" },
  { value: "partial", label: "Partial" },
  { value: "as_is", label: "As-Is" },
];

interface TransferRow {
  id: string; transferNumber?: string; status?: string; lineCount?: number;
  canActOnCurrentStep?: boolean;
  [key: string]: unknown;
}
type TransferItemNode = GroupedMaterialSelectItem & {
  currentStock?: number | string | null;
  stockOnHand?: number | string | null;
  minStockLevel?: number | string | null;
};
type AssetNode = { id: string; assetCode?: string; name?: string; category?: string };
type LocationNode = { id: string; name?: string; state?: string; city?: string };

export default function StockTransferPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { canAdd } = useMenuActions("/store/transfer");

  // Workflow action state — Submit / Approve / Reject open the
  // WorkflowConfirmDialog; Dispatch + Receive use the simpler
  // ConfirmDialog since both are single-action transitions.
  const [workflowAction, setWorkflowAction] = useState<
    { kind: "submit" | "approve" | "reject"; row: TransferRow } | null
  >(null);
  const [rejectReason, setRejectReason] = useState("");
  const [workflowPending, setWorkflowPending] = useState(false);
  const [dispatchTarget, setDispatchTarget] = useState<TransferRow | null>(null);
  const [dispatchPending, setDispatchPending] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<TransferRow | null>(null);
  const [receivePending, setReceivePending] = useState(false);

  const { permissionMatrix, isSuper } = usePermissions();
  const matrixRow = permissionMatrix?.[MENU_KEY];
  const canEdit = isSuper || !matrixRow || matrixRow.edit !== false;
  const canSubmit = canEdit;
  // Approve/Reject visibility is decided PER ROW by the workflow's
  // current step (server-computed in the list API as
  // `row.canActOnCurrentStep`).
  const canApproveRow = (row: TransferRow): boolean =>
    isSuper || row?.canActOnCurrentStep === true;

  const openWorkflow = (
    kind: "submit" | "approve" | "reject",
    row: TransferRow,
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
        const res = await fetch(`/api/store/transfers/${row.id}/submit`, {
          method: "POST",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      } else {
        const action = kind === "approve" ? "approve" : "reject";
        const res = await fetch(`/api/store/transfers/${row.id}/approve`, {
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
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      toast.success(
        kind === "submit"
          ? "Submitted for approval"
          : kind === "approve"
            ? "Transfer approved"
            : "Transfer rejected",
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
      const res = await fetch(
        `/api/store/transfers/${dispatchTarget.id}/dispatch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      setDispatchTarget(null);
      toast.success("Transfer dispatched");
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, "Dispatch failed"));
    } finally {
      setDispatchPending(false);
    }
  };

  const runReceive = async () => {
    if (!receiveTarget) return;
    setReceivePending(true);
    try {
      const res = await fetch(
        `/api/store/transfers/${receiveTarget.id}/receive`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["stock-register"] });
      setReceiveTarget(null);
      toast.success("Transfer received");
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, "Receive failed"));
    } finally {
      setReceivePending(false);
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ by?: string; order?: "asc" | "desc" }>({
    by: "transferDate",
    order: "desc",
  });
  const {
    items: data,
    total,
    page,
    pageSize,
    setPage,
    setPageSize,
    tabs,
    isLoading,
  } = useServerTabList<TransferRow>("stock-transfers", "/api/store/transfers", {
    activeTab,
    tabs: TABS,
    search: searchQuery,
    sortBy: sort.by,
    sortOrder: sort.order,
    initialPageSize: 25,
  });

  const { data: projectsData } = useProjects();
  const { data: itemGroupsData } = useItemGroups();
  const { data: locationsData } = useLocations();
  const { data: uomsData } = useUOMs();
  const { data: assetsData } = useAssets();

  const projects = (projectsData?.data ?? []) as { id: string; name?: string }[];
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name ?? "" }));

  // Lazy picker fetches items per-group on demand; onSelect supplies the
  // picked item for autofill, so no full item-master load / itemById map.
  const items: TransferItemNode[] = [];
  const itemGroups = itemGroupsData?.data ?? [];
  const uomOptions = (uomsData?.data ?? []).filter((u) => u?.status === "active").map((u) => ({
    value: u.code,
    label: u.code,
  }));

  const assets = (assetsData?.data ?? []) as unknown as AssetNode[];
  const assetOptions = assets.map((a) => ({
    value: a.id,
    label: `${a.assetCode} — ${a.name}`,
  }));
  const assetById = useMemo(() => {
    const m = new Map<string, AssetNode>();
    for (const a of assets) m.set(a.id, a);
    return m;
  }, [assets]);

  // State / City / Location cascading dropdowns. State + City come from
  // the shared India geo dataset (same source as StateCitySelect used in
  // Vendors / Projects / Locations) so the picker is comprehensive and
  // consistent across the app — not limited to states where a location
  // master record already exists. The Location select then filters the
  // locations master by the picked state + city.
  const locations = (locationsData?.data ?? []) as unknown as LocationNode[];
  const stateOptions = useMemo(
    () => INDIAN_STATES.map((s) => ({ value: s.name, label: s.name })),
    [],
  );

  const cityOptionsFor = (state: string) =>
    citiesForState(state).map((c) => ({ value: c, label: c }));

  const locationOptionsFor = (state: string, city: string) => {
    return locations
      .filter((l) => {
        if ((l as { status?: string }).status !== "active") return false;
        if (state && l.state !== state) return false;
        if (city && l.city !== city) return false;
        return true;
      })
      .map((l) => ({ value: l.id, label: l.name ?? "" }));
  };

  const todayIso = new Date().toISOString().slice(0, 10);

  const config: QuickCreateConfig = {
    title: "New Stock Transfer",
    subtitle: "Transfer materials between projects, sites, and warehouses",
    apiEndpoint: "/api/store/transfers",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stock-transfers"] }),
    fields: [
      // Row 1 — Transfer Type / Reason / Date
      {
        key: "transferType",
        label: "Transfer Type",
        type: "select" as const,
        required: true,
        options: TRANSFER_TYPE_OPTIONS,
        defaultValue: "intra_site",
        placeholder: "Select transfer type",
        // Flipping back to Intra-Site clears the Inter-Project-only
        // fields so a stale destination project / debit-note flag
        // doesn't ride along on a same-project transfer. The fields
        // themselves are hidden via `hiddenIf` so the user never sees
        // them for intra moves.
        onChange: (value: string) => {
          if (value === "intra_site") {
            return {
              destinationProjectId: "",
              chargeableTransfer: "",
            };
          }
        },
      },
      {
        key: "transferReason",
        label: "Transfer Reason",
        type: "select" as const,
        required: true,
        options: TRANSFER_REASON_OPTIONS,
        defaultValue: "project_requirement",
        placeholder: "Select reason",
      },
      {
        key: "transferDate",
        label: "Date",
        type: "date" as const,
        required: true,
        defaultValue: todayIso,
      },

      // Row 2 — Source Project (always visible, full-width). For
      // Inter-Project, an extra Destination Project picker appears on
      // the next row. Intra-Site hides the destination field entirely
      // so the user isn't prompted for a second project they can't pick.
      {
        key: "sourceProjectId",
        label: "Source Project",
        type: "select" as const,
        searchable: true,
        required: true,
        options: projectOptions,
        placeholder: "Select Project...",
        span: 2 as const,
      },
      {
        key: "destinationProjectId",
        label: "Destination Project",
        type: "select" as const,
        searchable: true,
        options: projectOptions,
        placeholder: "Select Destination Project...",
        span: 2 as const,
        hiddenIf: (fd: Record<string, string>) =>
          fd.transferType !== "inter_project",
        requiredIf: (fd: Record<string, string>) =>
          fd.transferType === "inter_project",
      },

      // Row 3 — From Location: State / City / Location (cascading,
      // all three searchable because state lists are long — 28+
      // rows — and cities within a state can run into dozens too).
      {
        key: "fromState",
        label: "From State",
        type: "select" as const,
        searchable: true,
        options: stateOptions,
        placeholder: "State...",
      },
      {
        key: "fromCity",
        label: "From City",
        type: "select" as const,
        searchable: true,
        options: (fd: Record<string, string>) => cityOptionsFor(fd.fromState ?? ""),
        placeholder: "City...",
      },
      {
        key: "fromLocationId",
        label: "From Location",
        type: "select" as const,
        searchable: true,
        required: true,
        options: (fd: Record<string, string>) =>
          locationOptionsFor(fd.fromState ?? "", fd.fromCity ?? ""),
        placeholder: "Select Location...",
        span: 2 as const,
      },

      // Row 4 — To Location: State / City / Location (cascading)
      {
        key: "toState",
        label: "To State",
        type: "select" as const,
        searchable: true,
        options: stateOptions,
        placeholder: "State...",
      },
      {
        key: "toCity",
        label: "To City",
        type: "select" as const,
        searchable: true,
        options: (fd: Record<string, string>) => cityOptionsFor(fd.toState ?? ""),
        placeholder: "City...",
      },
      {
        key: "toLocationId",
        label: "To Location",
        type: "select" as const,
        searchable: true,
        required: true,
        options: (fd: Record<string, string>) =>
          locationOptionsFor(fd.toState ?? "", fd.toCity ?? ""),
        placeholder: "Select Location...",
        span: 2 as const,
      },

      // Row 5 — Vehicle / Dispatch / Transit
      {
        key: "vehicleNo",
        label: "Vehicle No.",
        type: "text" as const,
        placeholder: "e.g. MH-12-AB-3456",
      },
      {
        // Native datetime-local picker — renders the browser's combined
        // date + time widget. Value is stored as `YYYY-MM-DDTHH:MM` in
        // local time; the POST handler converts to UTC before saving.
        key: "dispatchDateTime",
        label: "Dispatch Date & Time",
        type: "datetime-local" as const,
      },
      {
        key: "estTransitDays",
        label: "Est. Transit Days",
        type: "number" as const,
        placeholder: "e.g. 1",
        min: 0,
      },

      // Row 6 — Commercial / E-Way Bill. The Chargeable Transfer
      // (Debit Note) toggle is Inter-Project-only: an intra-site move
      // never generates a debit note because the cost stays within
      // the same project's cost centre.
      {
        key: "chargeableTransfer",
        label: "Chargeable Transfer (Debit Note)",
        type: "checkbox" as const,
        hiddenIf: (fd: Record<string, string>) =>
          fd.transferType !== "inter_project",
      },
      {
        key: "transactionAmount",
        label: "Transaction Amount (₹)",
        type: "number" as const,
        placeholder: "0",
        hint: "E-Way Bill becomes mandatory at ≥ ₹50,000 unless intra-state.",
      },
      {
        key: "interstateTransfer",
        label: "Interstate Transfer",
        type: "checkbox" as const,
      },
      {
        key: "ewayBillNo",
        label: "E-Way Bill No.",
        type: "text" as const,
        placeholder: "Not Required",
        // Mirrors the Gate Pass / Material Issue rule: E-Way Bill is
        // required when the transaction amount crosses ₹50,000, but
        // intercity-exempt flags suppress it. For transfers we
        // additionally require it whenever the move crosses state
        // boundaries (Interstate Transfer = true) regardless of value.
        requiredIf: (fd: Record<string, string>) => {
          if (fd.interstateTransfer === "true") return true;
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

      // Row 7 — Free-text
      {
        key: "remarks",
        label: "Remarks",
        type: "textarea" as const,
        placeholder: "Any additional notes",
        span: 2 as const,
      },
    ],
    lineItems: {
      label: "Materials to Transfer",
      addLabel: "Add Item",
      // Block submit when no line has a material picked. The drawer
      // strips fully-empty rows before posting, so we have to enforce
      // the rule here rather than relying on field-level `required`
      // (which only runs against header fields).
      validateBeforeSubmit: (lines) => {
        const hasMaterial = lines.some(
          (l) => typeof l?.itemId === "string" && l.itemId.trim().length > 0,
        );
        if (!hasMaterial) {
          return "Add at least one material with an item selected before creating the transfer.";
        }
        const missingQty = lines.some(
          (l) =>
            typeof l?.itemId === "string" &&
            l.itemId.trim().length > 0 &&
            (!l.dispatchQty || Number(l.dispatchQty) <= 0),
        );
        if (missingQty) {
          return "Every material line needs a Dispatch Qty greater than 0.";
        }
        return null;
      },
      fields: [
        {
          key: "itemId",
          label: "Material *",
          type: "custom" as const,
          width: "wide",
          required: true,
          render: (line, update: (patch: Record<string, unknown>) => void) => (
            <GroupedMaterialSelect
              lazy
              value={line.itemId ?? ""}
              onChange={(v) => {
                if (!v) {
                  update({ itemId: "", itemName: "", itemCode: "", uomCode: "", availableStock: "0" });
                  return;
                }
                update({ itemId: v });
              }}
              onSelect={(item) => {
                if (!item) return;
                const it = item as TransferItemNode;
                update({
                  itemName: it.name ?? "",
                  itemCode: it.code ?? "",
                  uomCode: it.uomCode ?? "",
                  availableStock: String(
                    it.currentStock ?? it.stockOnHand ?? it.minStockLevel ?? "0",
                  ),
                });
              }}
              items={items}
              groups={itemGroups.map((g) => ({
                id: g.id,
                name: g.name,
                status: g.status,
                itemCount: g.itemCount,
              }))}
              placeholder={
                items.length === 0 ? "No items in master" : "Select material..."
              }
              size="sm"
            />
          ),
        },
        {
          key: "uomCode",
          label: "UOM",
          type: "select" as const,
          options: uomOptions,
          placeholder: "UOM",
        },
        {
          key: "availableStock",
          label: "Available",
          type: "number" as const,
          placeholder: "0",
        },
        {
          key: "dispatchQty",
          label: "Dispatch Qty",
          type: "number" as const,
          required: true,
          placeholder: "0",
        },
        {
          key: "dispatchCondition",
          label: "Disp. Condition",
          type: "select" as const,
          options: DISPATCH_CONDITION_OPTIONS,
          placeholder: "Condition",
        },
        {
          key: "remarks",
          label: "Remarks",
          type: "text" as const,
          placeholder: "Line notes",
        },
      ],
    },
    secondaryLineItems: {
      label: "Assets to Transfer",
      key: "assetLines",
      addLabel: "Add Asset",
      fields: [
        {
          key: "assetId",
          label: "Asset / Tool",
          type: "select" as const,
          searchable: true,
          options: assetOptions,
          placeholder:
            assetOptions.length === 0 ? "No assets in master" : "Select asset...",
          onChange: (value: string) => {
            const a = value ? assetById.get(value) : null;
            if (!a) return { assetCode: "", assetName: "", category: "", uomCode: "" };
            return {
              assetCode: a.assetCode ?? "",
              assetName: a.name ?? "",
              category: a.category ?? "",
              uomCode: "",
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
          key: "dispatchCondition",
          label: "Condition",
          type: "select" as const,
          options: DISPATCH_CONDITION_OPTIONS,
          placeholder: "Condition",
        },
        {
          key: "remarks",
          label: "Remarks",
          type: "text" as const,
          placeholder: "Line notes",
          width: "wide" as const,
        },
      ],
    },
  };

  const columns: ColDef<TransferRow>[] = [
    {
      key: "transferNumber", label: "Transfer No", sortable: true, searchable: true,
      render: (row) => (
        <span className="text-accent-600 cursor-pointer hover:underline font-medium"
              onClick={() => router.push(`/store/transfer/${row.id}`)}>
          {row.transferNumber}
        </span>
      ),
    },
    { key: "fromLocationName", label: "From", sortable: true, searchable: true },
    { key: "toLocationName", label: "To", sortable: true, searchable: true },
    { key: "transferDate", label: "Date", type: "date", sortable: true },
    {
      key: "lineCount", label: "Items", type: "number", sortable: true,
      render: (row) => `${row.lineCount ?? 0} items`,
    },
    {
      key: "status", label: "Status", type: "select",
      options: [
        "draft", "pending_approval", "approved", "rejected",
        "dispatched", "in_transit", "received",
      ],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
    {
      key: "_actions",
      label: "Actions",
      width: "160px",
      // Icon-only actions matching Gate Pass / Good Return. The
      // status-driven icon set walks the transfer's lifecycle —
      // Submit (draft) → Approve/Reject (pending) → Dispatch
      // (approved) → Receive (dispatched/in-transit).
      render: (row) => {
        const status = String(row.status ?? "draft").toLowerCase();
        const isDraft = status === "draft";
        const isPending = status === "pending_approval";
        const isApproved = status === "approved";
        const canReceive = ["dispatched", "in_transit"].includes(status);
        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/store/transfer/${row.id}`);
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
            {isPending && canApproveRow(row) && (
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
            {canReceive && canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setReceiveTarget(row);
                }}
                className="p-1 rounded hover:bg-emerald-50 text-emerald-600"
                title="Mark as received"
              >
                <PackageCheck className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageFrame>
      <PageHeader
        title="Stock Transfer (Inter-Site)"
        subtitle="Transfer materials between projects, sites, and warehouses"
        breadcrumbs={[{ label: "Store", href: "/store" }, { label: "Stock Transfer" }]}
      />
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer fill>
        <DataTable
          id="store-transfer"
          columns={columns}
          data={data as unknown as TransferRow[]}
          onAdd={canAdd ? () => setDrawerOpen(true) : undefined}
          addLabel="New Transfer"
          historyEntityType="transfer"
          loading={isLoading}
          serverMode
          serverTotal={total}
          serverPage={page}
          serverPageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onSearchChange={setSearchQuery}
          onSortChange={(k, d) => setSort({ by: k, order: d })}
        />
      </PageContainer>
      </PageFrame>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />

      <WorkflowConfirmDialog
        action={workflowAction?.kind ?? null}
        pending={workflowPending}
        rejectReason={rejectReason}
        onRejectReasonChange={setRejectReason}
        onClose={closeWorkflow}
        onConfirm={runWorkflowAction}
        entityNoun="Stock Transfer"
        entityLabel={workflowAction?.row?.transferNumber ?? ""}
        approveHint="Once approved, the transfer is ready for dispatch."
        rejectPlaceholder="e.g. insufficient stock at source; fix quantity"
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
              Mark transfer{" "}
              <span className="font-semibold text-gray-900">
                {dispatchTarget.transferNumber}
              </span>{" "}
              as dispatched? Use this once the truck has left the source
              location.
            </div>
          ) : null
        }
      />

      <ConfirmDialog
        open={!!receiveTarget}
        onClose={() => (receivePending ? null : setReceiveTarget(null))}
        onConfirm={runReceive}
        loading={receivePending}
        tone="primary"
        title="Mark as Received"
        confirmLabel="Receive"
        message={
          receiveTarget ? (
            <div>
              Mark transfer{" "}
              <span className="font-semibold text-gray-900">
                {receiveTarget.transferNumber}
              </span>{" "}
              as received? The material is now on the destination store's
              stock ledger.
            </div>
          ) : null
        }
      />
    </>
  );
}
