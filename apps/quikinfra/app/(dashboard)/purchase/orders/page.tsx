"use client";

/**
 * Purchase Orders — list + quick create.
 *
 * The "Source RFQ" dropdown lists RFQs in `evaluated` or `closed` state
 * — i.e. the ones where the vendor selection is done and a PO can be
 * raised. Picking an RFQ stamps `sourceRfqId` + `sourceRfqNumber` on
 * the PO, and the POST handler auto-derives `sourceIndentId` from the
 * chosen RFQ so the existing P0 validation (sourceIndentId mandatory,
 * indent must be L3-approved, etc.) still passes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Send } from "lucide-react";
import { toErrorMessage } from "@/lib/api/errors";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  PageHeader, PageContainer, TabBar,
} from "@/components/PageShell";
import { DataTable } from "@/components/DataTable";
import { useSubmitPO } from "@/hooks/use-purchase";
import { useRFQs, useIndents } from "@/hooks/use-approvals";
import { useMenuActions } from "@/hooks/use-permissions";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import dynamic from "next/dynamic";
import type { SourceDocType } from "@/components/SourceDocPeekModal";
import type { ItemPickerItem } from "@/components/ItemPickerModal";
const SourceDocPeekModal = dynamic(
  () => import("@/components/SourceDocPeekModal").then((m) => m.SourceDocPeekModal),
  { ssr: false },
);
const ItemPickerModal = dynamic(
  () => import("@/components/ItemPickerModal").then((m) => m.ItemPickerModal),
  { ssr: false },
);
import { useProjects, useVendors, useItems, useItemGroups, useLocations, useTermsConditions } from "@/hooks/use-masters";
import { useQueryClient } from "@tanstack/react-query";
import { useServerTabList } from "@/hooks/use-server-tab-list";
import { STATUS_TABS } from "./lib/constants";
import { buildOrderColumns } from "./components/columns";
import { buildPoFormConfig, type PoFormConfigDeps } from "./lib/po-form-config";
import type {
  TermRow,
  SourceLine,
  RfqVendorLike,
  RfqLike,
  OrderIndentNode,
  OrderRfqNode,
  PoRow,
} from "./lib/types";

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [peekTarget, setPeekTarget] = useState<{ type: SourceDocType; id: string } | null>(null);
  const { canAdd } = useMenuActions("/purchase/orders");
  // Prefill for "Create PO" launched from the RFQ quote-comparison. The
  // compare modal routes here with ?rfqId&vendorRowId(&nonL1Justification);
  // we resolve the RFQ + that vendor's quoted rates and open the drawer
  // pre-populated with vendor, items, rates, project and dates.
  const searchParams = useSearchParams();
  const prefillHandledRef = useRef(false);
  const [prefill, setPrefill] = useState<{
    formData: Record<string, string>;
    lines: Record<string, unknown>[];
    secondaryLines: Record<string, unknown>[];
  } | null>(null);
  // Item-picker modal state for the PO Vendor section's "Assign
  // items" button — same ergonomics as the RFQ drawer.
  const [pickerCtx, setPickerCtx] = useState<{
    items: ItemPickerItem[];
    selectedIds: string[];
    onSave: (ids: string[]) => void;
    vendorLabel: string;
  } | null>(null);

  const submitMutation = useSubmitPO();
  const [submitTarget, setSubmitTarget] = useState<{ id: string; poNumber: string | null } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ by?: string; order?: "asc" | "desc" }>({
    by: "poDate",
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
  } = useServerTabList<PoRow>("purchase-orders", "/api/purchase/orders", {
    activeTab,
    tabs: STATUS_TABS,
    search: searchQuery,
    sortBy: sort.by,
    sortOrder: sort.order,
    initialPageSize: 25,
  });

  // Submit-for-approval opens a lightweight ConfirmDialog (matching the
  // Purchase Requisitions list) instead of a browser confirm().
  const handleSubmit = (row: { id: string; poNumber?: string | null }) => {
    setSubmitError(null);
    setSubmitTarget({ id: row.id, poNumber: row.poNumber ?? null });
  };

  const doSubmit = async () => {
    if (!submitTarget) return;
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(submitTarget.id);
      setSubmitTarget(null);
    } catch (err: unknown) {
      // Keep the dialog open so the user can read the failure reason.
      setSubmitError(toErrorMessage(err, "Failed to submit PO"));
    }
  };

  const { data: projectsData } = useProjects();
  const { data: vendorsData } = useVendors();
  const { data: itemGroupsData } = useItemGroups();
  const { data: locationsData } = useLocations();
  // T&C templates — show EVERY active template regardless of
  // `applicableTo`. The original filter (po + general only) hid
  // templates the user had tagged as "rfq", which surprised users
  // who keep one or two generic templates and reuse them across
  // document types. PO-tagged ones float to the top of the sort
  // so they're still the obvious default.
  const { data: termsData } = useTermsConditions();
  const termsOptions = useMemo(() => {
    const rows: TermRow[] = termsData?.data ?? [];
    const applicableWeight: Record<string, number> = {
      po: 0,
      general: 1,
      rfq: 2,
      wo: 3,
    };
    return rows
      .filter((r) => r.status === "active")
      .sort(
        (a, b) =>
          (applicableWeight[a.applicableTo ?? ""] ?? 9) -
          (applicableWeight[b.applicableTo ?? ""] ?? 9),
      )
      .map((r) => ({
        value: r.id,
        label:
          r.applicableTo && r.applicableTo !== "po"
            ? `${r.title} (${String(r.applicableTo).toUpperCase()})`
            : r.title ?? "",
      }));
  }, [termsData]);
  const defaultPoTermsId = useMemo(() => {
    const rows: TermRow[] = termsData?.data ?? [];
    // Prefer a PO-tagged default, then any general default, then any
    // default of another type so a single reusable template still
    // auto-selects on drawer open.
    return (
      rows.find(
        (r) => r.status === "active" && r.applicableTo === "po" && r.isDefault,
      )?.id ??
      rows.find(
        (r) =>
          r.status === "active" &&
          r.applicableTo === "general" &&
          r.isDefault,
      )?.id ??
      rows.find((r) => r.status === "active" && r.isDefault)?.id ??
      ""
    );
  }, [termsData]);
  const termsById = useMemo(() => {
    const rows: TermRow[] = termsData?.data ?? [];
    const m = new Map<string, { title: string; body: string }>();
    for (const r of rows) {
      if (r?.id) m.set(r.id, { title: r.title ?? "", body: r.body ?? "" });
    }
    return m;
  }, [termsData]);

  // Pull all RFQs and keep only those ready for PO creation. The
  // canonical "ready for PO" set is anything past initial draft /
  // pending — approved or further down the lifecycle. The buyer can
  // raise a PO straight off an `approved` RFQ even before it has been
  // formally sent, since approval is the gate that authorises spend.
  const { data: rfqsResult } = useRFQs({ status: "all", search: "" });
  const readyRfqs = useMemo(
    () =>
      (rfqsResult?.data ?? []).filter((r) =>
        [
          "approved",
          "sent",
          "responses_received",
          "quoted",
          "evaluated",
          "closed",
        ].includes(r.status),
      ),
    [rfqsResult],
  );

  // Approved indents — populate the Source Indent picker so a PO can
  // be raised straight from an indent without an intervening RFQ.
  const { data: indentsResult } = useIndents({ status: "all", search: "" });
  const approvedIndents = useMemo(
    () =>
      (indentsResult?.data ?? []).filter((i) =>
        ["approved", "l3_approved", "partially_ordered"].includes(i.status),
      ),
    [indentsResult],
  );

  const projectOptions = (projectsData?.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));
  // Match the RFQ drawer's vendor label format exactly so the picker
  // reads the same in both flows. `||` (not `??`) treats an empty
  // `companyName` as "missing" and falls through to the contact name
  // — matters for vendors created without a registered company.
  // Only active vendors are selectable (inactive/deleted/blacklisted excluded).
  const vendorOptions = (vendorsData?.data ?? [])
    .filter((v) => v.status === "active" && !(v as { isBlacklisted?: boolean }).isBlacklisted)
    .map((v) => ({
      value: v.id,
      label: v.companyName || v.name || v.id,
    }));
  const sourceRfqOptions = useMemo(
    () =>
      readyRfqs.map((rfq) => ({
        value: rfq.id,
        label: rfq.rfqNumber,
      })),
    [readyRfqs]
  );
  const sourceIndentOptions = useMemo(
    () =>
      approvedIndents.map((ind) => ({
        value: ind.id,
        label: ind.indentNumber,
      })),
    [approvedIndents],
  );
  const locationOptions = (locationsData?.data ?? []).filter((l) => l?.status === "active").map((l) => ({
    value: l.id,
    label: l.name ?? l.code ?? l.id,
  }));
  const todayIso = new Date().toISOString().slice(0, 10);

  // Indexed lookup so the source-doc onChange handlers can pull the
  // matching row in O(1). We key off the FULL indent list (all
  // statuses) — not just `approvedIndents` — so the RFQ autofill
  // can still find the parent indent's `qtyOpen` even when the
  // indent has rolled into `fully_ordered` / `closed` after the RFQ
  // was raised. The picker options still filter to approved only.
  const indentById = useMemo(() => {
    const m = new Map<string, OrderIndentNode>();
    for (const i of (indentsResult?.data ?? []) as unknown as OrderIndentNode[]) {
      if (i.id) m.set(i.id, i);
    }
    return m;
  }, [indentsResult]);
  const rfqById = useMemo(() => {
    const m = new Map<string, OrderRfqNode>();
    for (const r of readyRfqs as unknown as OrderRfqNode[]) {
      if (r.id) m.set(r.id, r);
    }
    return m;
  }, [readyRfqs]);
  const itemGroups = useMemo(() => {
    const raw = itemGroupsData?.data ?? [];
    return raw.filter(
      (g) => (g?.status ?? "active").toLowerCase() !== "inactive",
    );
  }, [itemGroupsData]);
  const allVendors = vendorsData?.data ?? [];
  const vendorById = useMemo(() => {
    const m = new Map<string, { id: string; companyName?: string; name?: string; email?: string; phone?: string; mobile?: string }>();
    for (const v of allVendors as unknown as { id: string; companyName?: string; name?: string; email?: string; phone?: string; mobile?: string }[]) m.set(v.id, v);
    return m;
  }, [allVendors]);

  // Use the source line's own itemId (the lazy picker no longer holds the
  // full item master to reconcile by code/name; source lines carry the id).
  const resolveItemId = (l: SourceLine | null | undefined): string =>
    l?.itemId ?? "";

  // Pull the best vendor + rate the buyer would expect when choosing a
  // source RFQ. If exactly one vendor quoted, pre-fill that vendor; if
  // multiple quoted, leave vendor blank for the buyer to pick (the
  // Compare modal is the right tool for that decision). Per-line
  // rates fall back to the vendor's quote on that line.
  const pickRfqVendorAndRates = (rfq: RfqLike): {
    vendorId: string | null;
    rateByLineKey: Map<string, string>;
  } => {
    const vendors: RfqVendorLike[] = rfq?.vendors ?? [];
    const quoted = vendors.filter(
      (v) => Array.isArray(v.quotedRates) && v.quotedRates.length > 0,
    );
    const chosen = quoted.length === 1 ? quoted[0] : null;
    const rateByLineKey = new Map<string, string>();
    if (chosen) {
      for (const q of chosen.quotedRates ?? []) {
        if (q?.lineId) rateByLineKey.set(String(q.lineId), String(q.rate ?? ""));
      }
    }
    return { vendorId: chosen?.vendorId ?? null, rateByLineKey };
  };

  // Resolve the ?rfqId&vendorRowId prefill (from the RFQ compare modal's
  // "Create PO") into a fully-populated PO draft: the chosen vendor, the
  // RFQ's line items at that vendor's quoted rates, plus project/date and
  // any non-L1 justification stamped into remarks.
  useEffect(() => {
    const rfqId = searchParams.get("rfqId");
    const vendorRowId = searchParams.get("vendorRowId");
    if (!rfqId || !vendorRowId) {
      prefillHandledRef.current = false;
      return;
    }
    if (prefillHandledRef.current) return;

    const allRfqs = (rfqsResult?.data ?? []) as unknown as OrderRfqNode[];
    const rfq = allRfqs.find((r) => r.id === rfqId);
    if (!rfq) return; // RFQ list not loaded yet — retry on next render
    const rfqVendors =
      (rfq as { vendors?: Array<Record<string, unknown>> }).vendors ?? [];
    const vendorRow = rfqVendors.find((v) => v.id === vendorRowId);
    if (!vendorRow) return;
    prefillHandledRef.current = true;

    const rateByLineKey = new Map<string, string>();
    const quoted = Array.isArray(vendorRow.quotedRates)
      ? (vendorRow.quotedRates as Array<{ lineId?: string; rate?: unknown }>)
      : [];
    for (const q of quoted) {
      if (q?.lineId) rateByLineKey.set(String(q.lineId), String(q.rate ?? ""));
    }

    const lines = (rfq.lines ?? []).map((l: SourceLine, i: number) => {
      const key = String(l.id ?? l.lineId ?? `row-${i}`);
      const itemId = resolveItemId(l);
      const qty = String(l.quantity ?? l.qtyRequested ?? "");
      return {
        itemId,
        itemName: l.itemName ?? "",
        indentLineId: l.sourceIndentLineId ?? undefined,
        poQty: qty,
        maxQty: "",
        uomCode: l.uomCode ?? "",
        unitRate: rateByLineKey.get(key) ?? String(l.standardRate ?? ""),
        gstRate: String(l.gstRate ?? "18"),
      } as Record<string, unknown>;
    });

    const vendorId = String(vendorRow.vendorId ?? "");
    const email =
      vendorById.get(vendorId)?.email ??
      (typeof vendorRow.email === "string" ? vendorRow.email : "") ??
      "";
    // Single-vendor PO → assign every prefilled line to this vendor so
    // the mandatory per-vendor item rule is satisfied out of the box.
    const secondaryLines: Record<string, unknown>[] = [
      {
        vendorId,
        email,
        assignedItemIds: lines.map((_, i) => `row-${i}`),
      },
    ];

    const formData: Record<string, string> = {
      poDate: todayIso,
      sourceRfqId: rfqId,
      sourceRfqNumber: String(rfq.rfqNumber ?? ""),
      projectId: String(rfq.projectId ?? ""),
      deliveryDate: rfq.dueDate ? String(rfq.dueDate).slice(0, 10) : "",
    };
    if (rfq.sourceIndentId) formData.sourceIndentId = String(rfq.sourceIndentId);
    const justification = searchParams.get("nonL1Justification");
    if (justification) {
      formData.remarks = `Non-L1 vendor justification: ${justification}`;
    }

    setPrefill({ formData, lines, secondaryLines });
    setDrawerOpen(true);
    router.replace("/purchase/orders");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, rfqsResult, vendorById]);

  const config = buildPoFormConfig({
    projectOptions, vendorOptions, locationOptions, termsOptions,
    sourceRfqOptions, sourceIndentOptions, itemGroups,
    readyRfqs: readyRfqs as unknown as OrderRfqNode[],
    vendorById, termsById, indentById, rfqById,
    defaultPoTermsId, todayIso, prefill, qc,
    resolveItemId, pickRfqVendorAndRates, setPickerCtx,
  });

  const columns = buildOrderColumns({ handleSubmit, setPeekTarget, router, vendorById });

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle="Order materials from vendors against approved RFQs and Indents"
        breadcrumbs={[{ label: "Purchase", href: "/purchase" }, { label: "Purchase Orders" }]}
      />

      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <PageContainer>
        <DataTable
          id="purchase-orders"
          columns={columns}
          data={data as PoRow[]}
          onAdd={canAdd ? () => setDrawerOpen(true) : undefined}
          addLabel="New PO"
          historyEntityType="po"
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

      <QuickCreateDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setPrefill(null);
        }}
        config={config}
        initialFormData={prefill?.formData}
        initialSecondaryLines={prefill?.secondaryLines}
      />

      <SourceDocPeekModal
        open={!!peekTarget}
        initial={peekTarget}
        onClose={() => setPeekTarget(null)}
      />

      <ConfirmDialog
        open={!!submitTarget}
        onClose={() => {
          if (!submitMutation.isPending) {
            setSubmitTarget(null);
            setSubmitError(null);
          }
        }}
        onConfirm={doSubmit}
        title="Submit for Approval"
        confirmLabel="Submit"
        tone="primary"
        loading={submitMutation.isPending}
        message={
          <>
            Submit PO{" "}
            <span className="font-semibold text-slate-900">
              {submitTarget?.poNumber ?? submitTarget?.id}
            </span>{" "}
            for approval? It will be routed through the active Purchase Order
            workflow and you won't be able to edit it until an approver returns
            it.
            {submitError && (
              <span className="mt-3 block rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {submitError}
              </span>
            )}
          </>
        }
      />


      <ItemPickerModal
        open={!!pickerCtx}
        title="Assign items to vendor"
        subtitle={
          pickerCtx
            ? `Pick which PO items to include for ${pickerCtx.vendorLabel}. At least one item is required.`
            : undefined
        }
        requireSelection
        items={pickerCtx?.items ?? []}
        selectedIds={pickerCtx?.selectedIds ?? []}
        onClose={() => setPickerCtx(null)}
        onSave={(ids) => pickerCtx?.onSave(ids)}
      />
    </>
  );
}
