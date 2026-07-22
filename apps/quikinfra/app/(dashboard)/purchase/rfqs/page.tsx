"use client";

/**
 * Request for Quotation (RFQ) — list + quick create.
 *
 * The "Source Indent" dropdown lists Indents that are fully approved
 * (statuses `approved` or `l3_approved`). Picking one stamps
 * `sourceIndentId` + `sourceIndentNumber` on the new RFQ so the chain
 * is PR → Indent → RFQ → PO.
 */

import { toErrorMessage } from "@/lib/api/errors";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, PageContainer, TabBar } from "@/components/PageShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { useIndents, useSubmitRFQ } from "@/hooks/use-approvals";
import { useMenuActions } from "@/hooks/use-permissions";
import { QuickCreateDrawer, type QuickCreateConfig } from "@/components/QuickCreateDrawer";
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
const AddQuoteModal = dynamic(
  () => import("@/components/AddQuoteModal").then((m) => m.AddQuoteModal),
  { ssr: false },
);
const CompareQuotesModal = dynamic(
  () => import("@/components/CompareQuotesModal").then((m) => m.CompareQuotesModal),
  { ssr: false },
);
import { ListChecks } from "lucide-react";
import { GroupedMaterialSelect, GROUPED_MATERIAL_OTHERS_GROUP_ID } from "@/components/GroupedMaterialSelect";
import { WhitebooksVendorSelect } from "@/components/WhitebooksVendorSelect";
import { useProjects, useItemGroups, useVendors, useTermsConditions } from "@/hooks/use-masters";
import { useQueryClient } from "@tanstack/react-query";
import { useServerTabList } from "@/hooks/use-server-tab-list";
import { buildRfqLinesFromIndent } from "@/lib/purchase/rfq-line-seed";
import { STATUS_TABS } from "./lib/constants";
import { buildRfqColumns } from "./components/columns";
import type {
  RfqVendor,
  RfqLine,
  RfqRow,
  TermRow,
  ProjectRow,
  IndentLine,
} from "./lib/types";

export default function RFQsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [peekTarget, setPeekTarget] = useState<{ type: SourceDocType; id: string } | null>(null);
  // RFQ awaiting submit confirmation — drives the ConfirmDialog (replaces
  // the native window.confirm). `null` when the dialog is closed.
  const [submitTarget, setSubmitTarget] = useState<RfqRow | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { canAdd } = useMenuActions("/purchase/rfqs");

  // Item-picker modal state — the per-vendor "Assign items" button
  // opens a multi-select of the RFQ's current material lines.
  // `pickerCtx` stores the target vendor row's data so the picker can
  // load its current selection and write back through the drawer's
  // update callback.
  const [pickerCtx, setPickerCtx] = useState<{
    items: ItemPickerItem[];
    selectedIds: string[];
    onSave: (ids: string[]) => void;
    vendorLabel: string;
  } | null>(null);

  // "Add Quote" modal — opened from the Vendors column. We hand it
  // the full vendor list (the modal filters to un-quoted ones for its
  // picker) and optionally a pre-selected vendor id when the user
  // clicked that specific vendor's "Add Quote" link.
  const [addQuoteCtx, setAddQuoteCtx] = useState<{
    rfqId: string;
    rfqNumber: string;
    vendors: RfqVendor[];
    lines: RfqLine[];
    initialVendorRowId?: string;
  } | null>(null);

  // "Compare Quotes" modal — opened from the Actions column. Carries
  // the RFQ snapshot so the modal can render without any extra API
  // call; it derives totals, ranks, and winners purely client-side
  // from the row the DataTable already has in memory.
  const [compareCtx, setCompareCtx] = useState<{
    rfqId: string;
    rfqNumber: string;
    projectName: string;
    vendors: RfqVendor[];
    lines: RfqLine[];
  } | null>(null);

  const submitMutation = useSubmitRFQ();
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ by?: string; order?: "asc" | "desc" }>({
    by: "rfqDate",
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
  } = useServerTabList<RfqRow>("rfqs", "/api/purchase/rfqs", {
    activeTab,
    tabs: STATUS_TABS,
    search: searchQuery,
    sortBy: sort.by,
    sortOrder: sort.order,
    initialPageSize: 25,
  });

  const doSubmit = async () => {
    if (!submitTarget) return;
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(submitTarget.id);
      setSubmitTarget(null);
    } catch (err: unknown) {
      // Keep the dialog open so the user can read the failure reason.
      setSubmitError(toErrorMessage(err, "Failed to submit RFQ"));
    }
  };

  const { data: projectsData } = useProjects();
  const { data: itemGroupsData } = useItemGroups();
  const { data: vendorsData } = useVendors();
  // T&C templates — show ones scoped to RFQ, plus "general" templates
  // that the company marks reusable across document types.
  const { data: termsData } = useTermsConditions();
  const termsOptions = useMemo(() => {
    const rows: TermRow[] = termsData?.data ?? [];
    return rows
      .filter(
        (r) =>
          r.status === "active" &&
          (r.applicableTo === "rfq" || r.applicableTo === "general"),
      )
      .map((r) => ({ value: r.id, label: r.title ?? "" }));
  }, [termsData]);
  const defaultTermsId = useMemo(() => {
    const rows: TermRow[] = termsData?.data ?? [];
    const def = rows.find(
      (r) => r.status === "active" && r.applicableTo === "rfq" && r.isDefault,
    );
    return def?.id ?? "";
  }, [termsData]);
  // Lookup map from id → body so the dropdown preview can render the
  // actual T&C text when the raiser picks a template.
  const termsById = useMemo(() => {
    const rows: TermRow[] = termsData?.data ?? [];
    const m = new Map<string, { title: string; body: string }>();
    for (const r of rows) {
      if (r?.id) m.set(r.id, { title: r.title ?? "", body: r.body ?? "" });
    }
    return m;
  }, [termsData]);

  // Pull ALL indents (no status filter) then keep only the approved
  // ones — covers both `approved` and the legacy `l3_approved` shape.
  const { data: indentsResult } = useIndents({ status: "all", search: "" });
  const approvedIndents = useMemo(
    () =>
      (indentsResult?.data ?? []).filter((i) =>
        ["approved", "l3_approved", "partially_ordered"].includes(i.status)
      ),
    [indentsResult]
  );

  const allProjects = projectsData?.data ?? [];
  const projectOptions = allProjects.map((p) => ({
    value: p.id,
    label: p.name,
  }));
  // Indexed lookup so the Project picker's onChange can pull the
  // project's canonical address for pre-fill on the RFQ form.
  const projectById = useMemo(() => {
    const map = new Map<string, ProjectRow>();
    for (const p of allProjects) map.set(p.id, p);
    return map;
  }, [allProjects]);
  const projectAddress = (p: ProjectRow): string =>
    [p?.address, p?.city, p?.state, p?.pincode]
      .filter((x) => x && String(x).trim())
      .join(", ");
  const itemGroups = useMemo(() => {
    const raw = itemGroupsData?.data ?? [];
    return raw.filter(
      (g) => (g?.status ?? "active").toLowerCase() !== "inactive",
    );
  }, [itemGroupsData]);

  const allVendors = vendorsData?.data ?? [];
  // Only active vendors are selectable (inactive/deleted/blacklisted excluded).
  const vendorOptions = allVendors
    .filter((v) => v.status === "active" && !(v as { isBlacklisted?: boolean }).isBlacklisted)
    .map((v) => ({
      value: v.id,
      label: v.companyName || v.name || v.id,
    }));
  // Indexed lookup so the Vendor picker's onChange can pull the email
  // off the vendor master row.
  const vendorById = useMemo(() => {
    const map = new Map<string, { id: string; companyName?: string; name?: string }>();
    for (const v of allVendors) map.set(v.id, v);
    return map;
  }, [allVendors]);
  const sourceIndentOptions = useMemo(
    () =>
      approvedIndents.map((ind) => ({
        value: ind.id,
        label: ind.indentNumber,
      })),
    [approvedIndents]
  );

  const config: QuickCreateConfig = {
    title: "New RFQ",
    subtitle: "Request for Quotation from vendors",
    apiEndpoint: "/api/purchase/rfqs",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rfqs"] }),
    fields: [
      {
        key: "sourceIndentId",
        label: "Source Indent",
        type: "select" as const,
        required: true,
        options: sourceIndentOptions,
        placeholder:
          sourceIndentOptions.length === 0
            ? "No approved indents available"
            : "Select an approved Indent…",
        span: 2 as const,
        // Mirror the Indent drawer's source-PR auto-fill: picking an
        // approved Indent stamps Project + Due Date and copies its
        // material lines into the RFQ grid. Material is auto-selected
        // when it can be reconciled to the current item master; the
        // picker still supports group → material browsing.
        onChange: (value: string) => {
          if (!value) return;
          const indent = approvedIndents.find((i) => i.id === value);
          if (!indent) return;
          const fields: Record<string, string> = {};
          if (indent.projectId) fields.projectId = indent.projectId;
          if (indent.requiredDate) fields.dueDate = indent.requiredDate;
          // Resolve each indent line to a current item id by code/name
          // (so a rename of the items master doesn't break old indents)
          // and carry its `sourceIndentLineId` — the id the PR/Indent "PO"
          // column rollup walks (PR line → indent line → PO line). Dropping
          // it left every RFQ-sourced PO unlinked and the source PR/Indent
          // stuck reading "Not ordered".
          const lines = buildRfqLinesFromIndent(
            (indent.lines ?? []) as IndentLine[],
            // Prefill from the indent line's own denormalized fields — the
            // lazy picker no longer holds the full item master, so group
            // auto-scroll is dropped (itemId + label stay correct).
            (l: IndentLine) => ({
              itemId: l.itemId ?? "",
              itemName: l.itemName ?? "",
              prefillGroupId: GROUPED_MATERIAL_OTHERS_GROUP_ID,
              uomCode: l.uomCode ?? "",
            }),
          );
          return { fields, lines };
        },
      },
      {
        key: "projectId",
        label: "Project",
        type: "select" as const,
        required: true,
        options: projectOptions,
        placeholder: "Select project",
        // Pre-fill the delivery Address from the project master when
        // the user picks a project (only if the address field hasn't
        // been touched — don't stomp manual edits).
        onChange: (value: string, formData: Record<string, string>) => {
          if (!value) return;
          const p = projectById.get(value);
          if (!p) return;
          const addr = projectAddress(p);
          if (!addr) return;
          const existing = String(formData.address ?? "").trim();
          if (existing && existing !== formData.address) return;
          return { address: addr };
        },
      },
      {
        key: "dueDate",
        label: "Due Date",
        type: "date" as const,
        required: true,
      },
      {
        key: "purpose",
        label: "Subject",
        type: "text" as const,
        span: 2 as const,
        placeholder: "e.g. Mahindra JCB parts, Q2 cement supply",
      },
      {
        // Delivery / site address printed on the vendor RFQ PDF.
        // Auto-filled from the project master when a Project is
        // picked; editable so the raiser can override per RFQ.
        // Required because this is the address printed on the
        // outgoing PDF / email — vendors can't quote without knowing
        // where to deliver, so we block submit instead of letting an
        // RFQ go out with a blank delivery line.
        key: "address",
        label: "Delivery Address",
        type: "textarea" as const,
        span: 2 as const,
        required: true,
        placeholder: "Site address that the vendor should deliver to",
        hint: "Shown on the RFQ PDF sent to vendors",
      },
      {
        // Which T&C template gets attached to the outgoing RFQ PDF.
        // Defaults to the RFQ-scoped "isDefault" template so the common
        // case needs no clicks. Required so every RFQ that goes to a
        // vendor carries a payment / delivery / quality T&C — the raiser
        // can still pick the org's default in one click, but they can't
        // skip it entirely.
        key: "termsTemplateId",
        label: "Terms & Conditions",
        type: "select" as const,
        span: 2 as const,
        required: true,
        options: termsOptions,
        placeholder:
          termsOptions.length === 0
            ? "No templates — add one under Masters → T&C"
            : "Use default / Pick a template…",
        defaultValue: defaultTermsId,
        // Inline preview — render the full body of the selected template
        // so the raiser sees exactly what the vendor will get in the PDF
        // without having to open the Masters screen.
        afterNode: (value: string) => {
          const picked = value ? termsById.get(value) : null;
          if (!picked) return null;
          return (
            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Preview · {picked.title}
              </div>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                {picked.body || "— no content —"}
              </pre>
            </div>
          );
        },
      },
    ],
    // Contacts are a repeatable list — multiple buyer-side people can
    // be named on one RFQ so a vendor's reply can go to any of them.
    // The server joins these into the existing `contactPerson` and
    // `contactMobile` string columns (comma-separated) to keep the DB
    // schema unchanged.
    tertiaryLineItems: {
      label: "Contact Persons",
      key: "contacts",
      addLabel: "Add Contact",
      fields: [
        {
          key: "name",
          label: "Contact Person",
          type: "text" as const,
          placeholder: "e.g. Anand Sharma",
          width: "wide" as const,
        },
        {
          key: "mobile",
          label: "Mobile",
          type: "text" as const,
          placeholder: "10-digit mobile",
          width: "wide" as const,
          // Digits only, capped at 10 — strips anything the user types
          // that isn't a number (the field previously accepted text).
          onChange: (value: string) => ({
            mobile: value.replace(/\D/g, "").slice(0, 10),
          }),
        },
      ],
    },
    secondaryLineItems: {
      label: "Vendors to Send RFQ",
      key: "vendors",
      addLabel: "Add Vendor",
      // Every vendor must have at least one item assigned — an empty
      // selection is no longer allowed to mean "send all". Only rows
      // with a chosen vendor are checked (the trailing blank row is
      // ignored).
      validateBeforeSubmit: (vendors) => {
        const withVendor = vendors.filter((v) => v.vendorId);
        const missing = withVendor.some(
          (v) =>
            !Array.isArray(v.assignedItemIds) ||
            v.assignedItemIds.length === 0,
        );
        if (!missing) return null;
        return "Please select the item material for the vendor — each vendor must have at least one item assigned.";
      },
      fields: [
        {
          key: "vendorId",
          label: "Vendor",
          type: "custom" as const,
          width: "wide" as const,
          render: (
            line,
            update: (patch: Record<string, unknown>) => void,
          ) => (
            <WhitebooksVendorSelect
              line={line}
              update={update}
              vendorOptions={vendorOptions}
              vendorById={vendorById}
            />
          ),
        },
        {
          key: "email",
          label: "Email",
          type: "text" as const,
          placeholder: "Email address",
          width: "wide" as const,
        },
        {
          // Per-vendor item assignment. Defaults to "send all items"
          // when `assignedItemIds` is empty — matches the legacy
          // behaviour for users who don't bother narrowing.
          key: "assignedItemIds",
          label: "Items",
          type: "custom" as const,
          width: "wide" as const,
          render: (
            line,
            update: (patch: Record<string, unknown>) => void,
            { primaryLines },
          ) => {
            const selected: string[] = Array.isArray(line.assignedItemIds)
              ? line.assignedItemIds
              : [];
            // Picker options — pull directly from the drawer's current
            // Material Lines so newly added items are always offered
            // and removed ones disappear from the selection set.
            // Use ROW INDEX as the picker id (not itemId) because two
            // rows can legitimately reference the same material at
            // different quantities — keying by itemId would make both
            // checkboxes share state and toggle in lockstep.
            const pickerItems: ItemPickerItem[] = primaryLines
              .map((pl, idx: number) => {
                if (!pl.itemId) return null;
                return {
                  id: `row-${idx}`,
                  label: pl.itemName ?? pl.itemId,
                  sublabel: [
                    pl.quantity ? `Qty ${pl.quantity}` : null,
                    pl.uomCode ?? null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                } as ItemPickerItem;
              })
              .filter((x: ItemPickerItem | null): x is ItemPickerItem => x !== null);

            // Normalise the selection — drop any ids that are no longer
            // in the material list so the count reads honestly.
            const validIds = new Set(pickerItems.map((p) => p.id));
            const cleanSelected = selected.filter((id) => validIds.has(id));
            const countLabel =
              pickerItems.length === 0
                ? "Add materials first"
                : cleanSelected.length === 0
                  ? "Select items (required)"
                  : `${cleanSelected.length} of ${pickerItems.length}`;
            const vendor = line.vendorId
              ? vendorById.get(line.vendorId)
              : null;
            const vendorLabel =
              vendor?.companyName || vendor?.name || "vendor";

            return (
              <button
                type="button"
                disabled={pickerItems.length === 0}
                onClick={() =>
                  setPickerCtx({
                    items: pickerItems,
                    selectedIds: cleanSelected,
                    vendorLabel,
                    onSave: (ids) => {
                      update({ assignedItemIds: ids });
                      setPickerCtx(null);
                    },
                  })
                }
                className={`w-full inline-flex items-center justify-between gap-2 px-2 py-1.5 rounded border text-xs ${
                  pickerItems.length === 0
                    ? "border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed"
                    : "border-gray-300 hover:border-accent-400 hover:bg-accent-50 text-gray-700"
                }`}
              >
                <span className="inline-flex items-center gap-1.5 truncate">
                  <ListChecks className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Assign items</span>
                </span>
                <span className="text-[11px] font-semibold text-gray-500 shrink-0">
                  {countLabel}
                </span>
              </button>
            );
          },
        },
      ],
    },
    lineItems: {
      label: "Material Lines (auto-filled from source Indent if left empty)",
      validateBeforeSubmit: (gridLines) => {
        const rowHasContent = (l: Record<string, unknown>) =>
          Object.entries(l).some(([k, v]) => {
            if (k === "prefillGroupId") return false; // UI-only hint
            return v !== undefined && v !== null && String(v).trim() !== "";
          });
        if (!gridLines.some(rowHasContent)) return "Add at least one material line";
        for (let i = 0; i < gridLines.length; i++) {
          const l = gridLines[i];
          if (!rowHasContent(l)) continue;
          if (!String(l.itemId ?? "").trim()) {
            return `Line ${i + 1}: Choose a material (group → item)`;
          }
          const q = parseFloat(String(l.quantity ?? "")) || 0;
          if (q <= 0) return `Line ${i + 1}: Quantity must be greater than 0`;
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
              selectedLabel={line.itemName ?? ""}
              onChange={(v) => {
                if (!v) update({ itemId: "", itemName: "", uomCode: "" });
                else update({ itemId: v });
              }}
              onSelect={(item) => {
                if (!item) return;
                const patch: Record<string, string> = { itemName: item.name ?? "" };
                if (item.uomCode) patch.uomCode = String(item.uomCode);
                update(patch);
              }}
              items={[]}
              groups={itemGroups.map((g) => ({ id: g.id, name: g.name, status: g.status, itemCount: g.itemCount }))}
              initialGroupId={line.prefillGroupId ?? null}
              placeholder="Select material…"
              size="sm"
            />
          ),
        },
        {
          key: "quantity",
          label: "Quantity",
          type: "number" as const,
          placeholder: "Qty",
        },
        {
          key: "uomCode",
          label: "UOM",
          type: "text" as const,
          placeholder: "UOM",
        },
      ],
    },
  };

  const columns = buildRfqColumns({
    router,
    setPeekTarget,
    setAddQuoteCtx,
    setCompareCtx,
    setSubmitError,
    setSubmitTarget,
  });

  return (
    <>
      <PageHeader
        title="Request for Quotation (RFQ)"
        subtitle="Compare vendor quotes for best pricing and terms"
        breadcrumbs={[
          { label: "Purchase", href: "/purchase" },
          { label: "RFQ" },
        ]}
      />
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer>
        <DataTable
          id="purchase-rfqs"
          columns={columns}
          data={data as RfqRow[]}
          onAdd={canAdd ? () => setDrawerOpen(true) : undefined}
          addLabel="New RFQ"
          historyEntityType="rfq"
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
        onClose={() => setDrawerOpen(false)}
        config={config}
      />

      <SourceDocPeekModal
        open={!!peekTarget}
        initial={peekTarget}
        onClose={() => setPeekTarget(null)}
      />

      <ItemPickerModal
        open={!!pickerCtx}
        title="Assign items to vendor"
        subtitle={
          pickerCtx
            ? `Pick which RFQ materials to send to ${pickerCtx.vendorLabel}. At least one item is required.`
            : undefined
        }
        requireSelection
        items={pickerCtx?.items ?? []}
        selectedIds={pickerCtx?.selectedIds ?? []}
        onClose={() => setPickerCtx(null)}
        onSave={(ids) => pickerCtx?.onSave(ids)}
      />

      <AddQuoteModal
        open={!!addQuoteCtx}
        rfqId={addQuoteCtx?.rfqId ?? ""}
        rfqNumber={addQuoteCtx?.rfqNumber}
        vendors={addQuoteCtx?.vendors ?? []}
        initialVendorRowId={addQuoteCtx?.initialVendorRowId}
        lines={addQuoteCtx?.lines ?? []}
        onClose={() => setAddQuoteCtx(null)}
        onSaved={() => {
          setAddQuoteCtx(null);
          qc.invalidateQueries({ queryKey: ["rfqs"] });
        }}
      />

      <CompareQuotesModal
        open={!!compareCtx}
        rfqId={compareCtx?.rfqId}
        rfqNumber={compareCtx?.rfqNumber}
        projectName={compareCtx?.projectName}
        vendors={compareCtx?.vendors ?? []}
        lines={compareCtx?.lines ?? []}
        onClose={() => setCompareCtx(null)}
        onEditQuote={(vendorRowId) => {
          if (!compareCtx) return;
          // Close compare → open the Add Quote modal pre-selected on
          // the clicked vendor so the raiser can revise the rates.
          setAddQuoteCtx({
            rfqId: compareCtx.rfqId,
            rfqNumber: compareCtx.rfqNumber,
            vendors: compareCtx.vendors,
            lines: compareCtx.lines,
            initialVendorRowId: vendorRowId,
          });
          setCompareCtx(null);
        }}
        onCreatePO={(vendorRowId, justification) => {
          if (!compareCtx) return;
          // Route to PO create flow. For a non-L1 vendor the compare
          // modal supplies the mandatory business justification, which
          // we carry into the PO form so it can be stored on the PO.
          const params = new URLSearchParams({
            rfqId: compareCtx.rfqId,
            vendorRowId,
          });
          if (justification) params.set("nonL1Justification", justification);
          router.push(`/purchase/orders?${params.toString()}`);
        }}
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
            Submit RFQ{" "}
            <span className="font-semibold text-slate-900">
              {submitTarget?.rfqNumber ?? submitTarget?.id}
            </span>{" "}
            for approval? It will be routed through the active RFQ workflow
            and you won't be able to edit it until an approver returns it.
            {submitError && (
              <span className="mt-3 block rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {submitError}
              </span>
            )}
          </>
        }
      />
    </>
  );
}
