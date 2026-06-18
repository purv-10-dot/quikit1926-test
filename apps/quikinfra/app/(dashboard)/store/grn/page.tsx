"use client";

/**
 * GRN — Goods Receipt Notes. Lives under Store since it's the "goods in"
 * counterpart of Material Issue. The backend API still sits under
 * /api/purchase/grn to avoid a backend migration — GRN is still
 * conceptually a Purchase-workflow artifact, we've only moved the UI
 * placement so store users find it in the expected section.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Send } from "lucide-react";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { useGRNs, usePurchaseOrders, useSubmitGRN } from "@/hooks/use-purchase";
import { QuickCreateDrawer, type QuickCreateConfig } from "@/components/QuickCreateDrawer";
import { useProjects, useItems, useLocations, useVendors } from "@/hooks/use-masters";
import { useMenuActions } from "@/hooks/use-permissions";
import { useQueryClient } from "@tanstack/react-query";
import { renderGrnLine } from "@/components/GrnLineRow";
import { buildGrnFields } from "@/lib/grn-form-fields";
import { buildTabCounts, filterByTab, type TabSpec } from "@/lib/tab-counts";

const STATUS_TABS: TabSpec[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending_inspection", label: "Pending Inspection" },
  { key: "inspected", label: "Inspected" },
  { key: "approved", label: "Approved" },
  { key: "partially_accepted", label: "Partial" },
  { key: "rejected", label: "Rejected" },
];

type GrnVendorNode = { id: string; companyName?: string; name?: string };
type GrnPoLine = {
  itemId?: string; itemName?: string; uomCode?: string;
  poQty?: number | string; quantity?: number | string; receivedQty?: number | string;
};
type GrnPo = {
  id?: string; poNumber: string; status?: string; projectId?: string;
  vendorId?: string; vendorName?: string; lines?: GrnPoLine[];
};
interface GrnRow {
  id: string; grnNumber?: string; status?: string; lineCount?: number;
  [key: string]: unknown;
}

export default function GRNPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { canAdd } = useMenuActions("/store/grn");

  const { data: result, isLoading } = useGRNs({ status: "all", search: "" });
  const submitMutation = useSubmitGRN();
  const allRows = result?.data ?? [];
  const tabs = useMemo(() => buildTabCounts(allRows, STATUS_TABS), [allRows]);
  const data = useMemo(
    () => filterByTab(allRows, activeTab, STATUS_TABS),
    [allRows, activeTab],
  );

  const handleSubmit = async (grnId: string) => {
    if (!confirm("Submit this GRN for approval?")) return;
    try {
      await submitMutation.mutateAsync(grnId);
    } catch { /* error toast handled globally */ }
  };

  const { data: projectsData } = useProjects();
  const { data: itemsData } = useItems();
  const { data: locationsData } = useLocations();
  const { data: vendorsData } = useVendors();
  // Indexed vendor lookup so we can always resolve a name from the
  // PO's vendorId even if the PO-list response's inlined vendorName
  // is empty (can happen when the PO was created before the Prisma
  // migration's vendor-join was in place).
  const vendorById = new Map<string, GrnVendorNode>();
  for (const v of (vendorsData?.data ?? []) as unknown as GrnVendorNode[]) vendorById.set(v.id, v);

  const projectOptions = (projectsData?.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  const itemOptions = (itemsData?.data ?? []).map((i) => ({ value: i.id, label: i.name }));
  const locationOptions = (locationsData?.data ?? []).map((l) => ({ value: l.id, label: l.name }));
  // Only offer POs that are approved/sent/partially-received — draft
  // POs can't yet receive goods, and fully-received ones don't make
  // sense to GRN-against a second time.
  const { data: posData } = usePurchaseOrders({ status: "all" });
  const allPOs = (posData?.data ?? []) as unknown as GrnPo[];
  const poOptions = allPOs
    .filter((p) =>
      ["approved", "sent", "partially_received"].includes(p.status ?? ""),
    )
    .map((p) => ({
      value: p.poNumber,
      label: p.poNumber,
    }));
  const poByNumber = new Map<string, GrnPo>();
  for (const p of allPOs) poByNumber.set(p.poNumber, p);

  const config: QuickCreateConfig = {
    title: "Record GRN",
    subtitle: "Receive and inspect goods against a purchase order",
    apiEndpoint: "/api/purchase/grn",
    onSuccess: (created: unknown) => {
      qc.invalidateQueries({ queryKey: ["grns"] });
      const c = created as { id?: string; data?: { id?: string } } | null;
      const newId = c?.id ?? c?.data?.id;
      if (newId) router.push(`/store/grn/${newId}`);
    },
    // Shared field list — see `buildGrnFields` for the canonical
    // shape. The only thing that differs between the two GRN entry
    // points is the "PO Reference" field: dropdown here, disabled
    // text on the PO-detail page.
    fields: buildGrnFields({
      poRefField: {
        key: "poRef",
        label: "PO Reference",
        type: "select" as const,
        required: true,
        options: poOptions,
        placeholder:
          poOptions.length === 0
            ? "No open POs available"
            : "Select a Purchase Order\u2026",
        onChange: (value: string) => {
          if (!value) return;
          const po = poByNumber.get(value);
          if (!po) return;
          const fields: Record<string, string> = {};
          if (po.projectId) fields.projectId = po.projectId;
          const masterVendor = po.vendorId
            ? vendorById.get(po.vendorId)
            : null;
          const vendorName =
            po.vendorName ||
            masterVendor?.companyName ||
            masterVendor?.name ||
            "";
          if (vendorName) fields.vendorName = vendorName;
          const lines = (po.lines ?? []).map((l) => ({
            itemId: l.itemId ?? "",
            itemName: l.itemName ?? "",
            uomCode: l.uomCode ?? "",
            poQty: String(l.poQty ?? l.quantity ?? "0"),
            prevRcvd: String(l.receivedQty ?? "0"),
            pending: String(
              parseFloat(String(l.poQty ?? l.quantity ?? "0")) -
                parseFloat(String(l.receivedQty ?? "0")),
            ),
            receivedQty: "",
            rejectedQty: "",
            batchNo: "",
            condition: "Good",
            testCertRef: "",
            remarks: "",
          }));
          return { fields, lines };
        },
      },
      projectOptions,
      locationOptions,
    }),
    lineItems: {
      label: "Received Items",
      hideAddLine: true,
      // Card-style row layout — see `renderGrnLine` for the JSX. The
      // `fields` list below is still required so the drawer serialises
      // every line key into the POST payload; the default inline grid
      // is bypassed by `rowRender`.
      rowRender: renderGrnLine,
      fields: [
        {
          // Material — read-only label, filled from the selected PO.
          key: "itemName",
          label: "Material",
          type: "custom" as const,
          width: "wide" as const,
          render: (line) => (
            <div className="text-sm text-gray-900 leading-tight">
              <div className="font-medium truncate">
                {line.itemName || "\u2014"}
              </div>
              {(() => {
                const poQty = parseFloat(String(line.poQty ?? "0")) || 0;
                const received = parseFloat(String(line.receivedQty ?? "0")) || 0;
                const rejected = parseFloat(String(line.rejectedQty ?? "0")) || 0;
                const accepted = Math.max(received - rejected, 0);
                const short = poQty - accepted;
                if (short > 0 && received > 0) {
                  return (
                    <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
                      Short by {short.toLocaleString("en-IN")} {line.uomCode || ""}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          ),
        },
        {
          key: "uomCode",
          label: "UOM",
          type: "custom" as const,
          render: (line) => (
            <div className="text-xs text-gray-700 uppercase">
              {line.uomCode || "\u2014"}
            </div>
          ),
        },
        {
          key: "poQty",
          label: "PO Qty",
          type: "custom" as const,
          render: (line) => (
            <div className="text-sm text-gray-800 tabular-nums">
              {line.poQty != null
                ? Number(line.poQty).toLocaleString("en-IN")
                : "\u2014"}
            </div>
          ),
        },
        {
          key: "prevRcvd",
          label: "Prev. Rcvd",
          type: "custom" as const,
          render: (line) => (
            <div className="text-sm text-gray-500 tabular-nums">
              {line.prevRcvd != null
                ? Number(line.prevRcvd).toLocaleString("en-IN")
                : "0"}
            </div>
          ),
        },
        {
          key: "pending",
          label: "Pending",
          type: "custom" as const,
          render: (line) => {
            const poQty = parseFloat(String(line.poQty ?? "0")) || 0;
            const prev = parseFloat(String(line.prevRcvd ?? "0")) || 0;
            const pending = Math.max(poQty - prev, 0);
            return (
              <div className="text-sm text-gray-800 tabular-nums">
                {pending.toLocaleString("en-IN")}
              </div>
            );
          },
        },
        {
          key: "receivedQty",
          label: "Received",
          type: "number" as const,
          placeholder: "0",
        },
        {
          key: "rejectedQty",
          label: "Rejected",
          type: "number" as const,
          placeholder: "0",
        },
        {
          key: "acceptedQty",
          label: "Accepted",
          type: "custom" as const,
          render: (line) => {
            const received = parseFloat(String(line.receivedQty ?? "0")) || 0;
            const rejected = parseFloat(String(line.rejectedQty ?? "0")) || 0;
            const accepted = Math.max(received - rejected, 0);
            return (
              <div className="text-sm font-semibold text-emerald-600 tabular-nums">
                {accepted.toLocaleString("en-IN")}
              </div>
            );
          },
        },
        {
          key: "batchNo",
          label: "Batch / Heat No.",
          type: "text" as const,
          placeholder: "Batch",
        },
        {
          key: "condition",
          label: "Condition",
          type: "select" as const,
          options: [
            { value: "Good", label: "Good" },
            { value: "Damaged", label: "Damaged" },
            { value: "Partially Damaged", label: "Partially Damaged" },
          ],
        },
        {
          key: "testCertRef",
          label: "Test Cert. Ref.",
          type: "text" as const,
          placeholder: "Ref...",
        },
        {
          key: "remarks",
          label: "Remarks",
          type: "text" as const,
          placeholder: "Remarks",
        },
      ],
    },
  };

  const columns: ColDef<GrnRow>[] = [
    {
      key: "grnNumber", label: "GRN No", sortable: true, searchable: true,
      render: (row) => (
        <span className="text-orange-600 cursor-pointer hover:underline font-medium"
              onClick={() => router.push(`/store/grn/${row.id}`)}>
          {row.grnNumber}
        </span>
      ),
    },
    { key: "poNumber", label: "PO Number", sortable: true, searchable: true },
    { key: "vendorName", label: "Vendor", sortable: true, searchable: true },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "grnDate", label: "Date", type: "date", sortable: true },
    {
      key: "lineCount", label: "Items", type: "number", sortable: true,
      render: (row) => `${row.lineCount ?? 0} items`,
    },
    {
      key: "status", label: "Status", type: "select",
      options: ["draft", "pending_inspection", "inspected", "approved", "partially_accepted", "rejected"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
    {
      key: "_actions",
      label: "Actions",
      width: "100px",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/store/grn/${row.id}`);
            }}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            title="View"
          >
            <Eye className="w-4 h-4" />
          </button>
          {row.status === "draft" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSubmit(row.id);
              }}
              className="p-1.5 rounded hover:bg-gray-100 text-orange-500"
              title="Submit for Approval"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Goods Receipt Notes (GRN)"
        subtitle="Receive, inspect, and accept deliveries against purchase orders"
        breadcrumbs={[{ label: "Store", href: "/store" }, { label: "GRN" }]}
      />

      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <PageContainer>
        <DataTable
          id="store-grn"
          columns={columns}
          data={data as unknown as GrnRow[]}
          onAdd={canAdd ? () => setDrawerOpen(true) : undefined}
          addLabel="Record GRN"
          historyEntityType="grn"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
