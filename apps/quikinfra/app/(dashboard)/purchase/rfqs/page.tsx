"use client";

/**
 * Request for Quotation (RFQ) — list + quick create.
 *
 * The "Source Indent" dropdown lists Indents that are fully approved
 * (statuses `approved` or `l3_approved`). Picking one stamps
 * `sourceIndentId` + `sourceIndentNumber` on the new RFQ so the chain
 * is PR → Indent → RFQ → PO.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Send, CheckCircle2, GitCompare } from "lucide-react";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type ColDef } from "@/components/DataTable";
import { useRFQs, useIndents, useSubmitRFQ } from "@/hooks/use-approvals";
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
import { useProjects, useItems, useItemGroups, useVendors, useTermsConditions } from "@/hooks/use-masters";
import { useQueryClient } from "@tanstack/react-query";
import { buildTabCounts, filterByTab, type TabSpec } from "@/lib/tab-counts";

const STATUS_TABS: TabSpec[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "sent", label: "Sent" },
  { key: "responses_received", label: "Responses" },
  { key: "evaluated", label: "Evaluated" },
  { key: "closed", label: "Closed" },
];

export default function RFQsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [peekTarget, setPeekTarget] = useState<{ type: SourceDocType; id: string } | null>(null);
  // RFQ awaiting submit confirmation — drives the ConfirmDialog (replaces
  // the native window.confirm). `null` when the dialog is closed.
  const [submitTarget, setSubmitTarget] = useState<any | null>(null);
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
    vendors: any[];
    lines: any[];
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
    vendors: any[];
    lines: any[];
  } | null>(null);

  const { data: result } = useRFQs({ status: "all", search: "" });
  const submitMutation = useSubmitRFQ();
  const allRows = result?.data ?? [];
  const tabs = useMemo(() => buildTabCounts(allRows, STATUS_TABS), [allRows]);
  const data = useMemo(
    () => filterByTab(allRows, activeTab, STATUS_TABS),
    [allRows, activeTab],
  );

  const doSubmit = async () => {
    if (!submitTarget) return;
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(submitTarget.id);
      setSubmitTarget(null);
    } catch (err: any) {
      // Keep the dialog open so the user can read the failure reason.
      setSubmitError(err?.message ?? "Failed to submit RFQ");
    }
  };

  const { data: projectsData } = useProjects();
  const { data: itemsData } = useItems();
  const { data: itemGroupsData } = useItemGroups();
  const { data: vendorsData } = useVendors();
  // T&C templates — show ones scoped to RFQ, plus "general" templates
  // that the company marks reusable across document types.
  const { data: termsData } = useTermsConditions();
  const termsOptions = useMemo(() => {
    const rows: any[] = termsData?.data ?? [];
    return rows
      .filter(
        (r) =>
          r.status === "active" &&
          (r.applicableTo === "rfq" || r.applicableTo === "general"),
      )
      .map((r) => ({ value: r.id, label: r.title }));
  }, [termsData]);
  const defaultTermsId = useMemo(() => {
    const rows: any[] = termsData?.data ?? [];
    const def = rows.find(
      (r) => r.status === "active" && r.applicableTo === "rfq" && r.isDefault,
    );
    return def?.id ?? "";
  }, [termsData]);
  // Lookup map from id → body so the dropdown preview can render the
  // actual T&C text when the raiser picks a template.
  const termsById = useMemo(() => {
    const rows: any[] = termsData?.data ?? [];
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
      (indentsResult?.data ?? []).filter((i: any) =>
        ["approved", "l3_approved", "partially_ordered"].includes(i.status)
      ),
    [indentsResult]
  );

  const allProjects = projectsData?.data ?? [];
  const projectOptions = allProjects.map((p: any) => ({
    value: p.id,
    label: p.name,
  }));
  // Indexed lookup so the Project picker's onChange can pull the
  // project's canonical address for pre-fill on the RFQ form.
  const projectById = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of allProjects) map.set(p.id, p);
    return map;
  }, [allProjects]);
  const projectAddress = (p: any): string =>
    [p?.address, p?.city, p?.state, p?.pincode]
      .filter((x) => x && String(x).trim())
      .join(", ");
  const allItems = itemsData?.data ?? [];
  const itemGroups = useMemo(() => {
    const raw = itemGroupsData?.data ?? [];
    return raw.filter(
      (g: any) => (g?.status ?? "active").toLowerCase() !== "inactive",
    );
  }, [itemGroupsData]);
  const itemOptions = allItems.map((i: any) => ({
    value: i.id,
    label: i.name,
  }));
  // Indexed lookup so the Material picker onChange can pull UOM off
  // the item master in O(1), mirroring the Indent form.
  const itemById = useMemo(() => {
    const map = new Map<string, any>();
    for (const i of allItems) map.set(i.id, i);
    return map;
  }, [allItems]);

  const resolveItemMatch = useCallback(
    (l: any) =>
      (l.itemCode && allItems.find((it: any) => it.code === l.itemCode)) ||
      (l.itemName && allItems.find((it: any) => it.name === l.itemName)) ||
      (l.itemId && allItems.find((it: any) => it.id === l.itemId)) ||
      null,
    [allItems],
  );

  const prefillGroupIdForMatch = (match: any | null) => {
    const gid = String(match?.groupId ?? "").trim();
    const gname = String(match?.groupName ?? "").trim();
    if (!gid || !gname) return GROUPED_MATERIAL_OTHERS_GROUP_ID;
    return gid;
  };

  const allVendors = vendorsData?.data ?? [];
  const vendorOptions = allVendors
    .filter((v: any) => !v.isBlacklisted && v.status !== "blacklisted")
    .map((v: any) => ({
      value: v.id,
      label: v.companyName || v.name || v.id,
    }));
  // Indexed lookup so the Vendor picker's onChange can pull the email
  // off the vendor master row.
  const vendorById = useMemo(() => {
    const map = new Map<string, any>();
    for (const v of allVendors) map.set(v.id, v);
    return map;
  }, [allVendors]);
  const sourceIndentOptions = useMemo(
    () =>
      approvedIndents.map((ind: any) => ({
        value: ind.id,
        label: ind.indentNumber,
      })),
    [approvedIndents]
  );

  const config = {
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
          const indent = approvedIndents.find((i: any) => i.id === value);
          if (!indent) return;
          const fields: Record<string, string> = {};
          if (indent.projectId) fields.projectId = indent.projectId;
          if (indent.requiredDate) fields.dueDate = indent.requiredDate;
          // Resolve each indent line to a current item id by code/name
          // so a rename of the items master doesn't break old indents.
          const lines: Record<string, string>[] = (indent.lines ?? []).map(
            (l: any) => {
              const match = resolveItemMatch(l);
              return {
                itemId: match?.id ?? "",
                prefillGroupId: prefillGroupIdForMatch(match),
                quantity: String(
                  l.qtyRequested ?? l.indentedQty ?? l.quantity ?? "",
                ),
                uomCode: l.uomCode ?? match?.uomCode ?? "",
              };
            },
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
        label: "Subject / Supply For",
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
        },
      ],
    },
    secondaryLineItems: {
      label: "Vendors to Send RFQ",
      key: "vendors",
      addLabel: "Add Vendor",
      fields: [
        {
          key: "vendorId",
          label: "Vendor",
          type: "custom" as const,
          width: "wide" as const,
          render: (
            line: Record<string, any>,
            update: (patch: Record<string, any>) => void,
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
            line: Record<string, any>,
            update: (patch: Record<string, any>) => void,
            { primaryLines }: { primaryLines: Record<string, any>[] },
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
              .map((pl: any, idx: number) => {
                if (!pl.itemId) return null;
                const master = itemById.get(pl.itemId);
                return {
                  id: `row-${idx}`,
                  label: master?.name ?? pl.itemId,
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
                  ? `Send all ${pickerItems.length}`
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
                    : "border-gray-300 hover:border-orange-400 hover:bg-orange-50 text-gray-700"
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
      validateBeforeSubmit: (gridLines: Record<string, any>[]) => {
        const rowHasContent = (l: Record<string, any>) =>
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
          render: (line: Record<string, any>, update: (patch: Record<string, any>) => void) => (
            <GroupedMaterialSelect
              value={line.itemId ?? ""}
              onChange={(v) => {
                if (!v) {
                  update({ itemId: "", uomCode: "" });
                  return;
                }
                const item = itemById.get(v);
                const patch: Record<string, string> = { itemId: v };
                if (item?.uomCode) patch.uomCode = String(item.uomCode);
                update(patch);
              }}
              items={allItems}
              groups={itemGroups.map((g: any) => ({ id: g.id, name: g.name, status: g.status }))}
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

  const columns: ColDef<any>[] = [
    {
      key: "rfqNumber",
      label: "RFQ No",
      sortable: true,
      searchable: true,
      render: (row) => (
        <span
          className="text-orange-600 cursor-pointer hover:underline font-medium"
          onClick={() => router.push(`/purchase/rfqs/${row.id}`)}
        >
          {row.rfqNumber}
        </span>
      ),
    },
    {
      key: "sourceIndentNumber",
      label: "Source Indent",
      sortable: true,
      searchable: true,
      render: (row) =>
        row.sourceIndentNumber && row.sourceIndentId ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPeekTarget({ type: "indent", id: row.sourceIndentId });
            }}
            className="font-mono text-xs text-indigo-600 hover:text-indigo-800 underline"
            title="View Indent details"
          >
            {row.sourceIndentNumber}
          </button>
        ) : (
          <span className="text-[11px] text-gray-400 italic">—</span>
        ),
    },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "dueDate", label: "Due Date", type: "date", sortable: true },
    {
      key: "lineCount",
      label: "Items",
      type: "number",
      sortable: true,
      render: (row) => `${row.lineCount ?? 0} items`,
    },
    {
      // Vendors column — per-vendor status row. Each vendor gets its
      // own line with an "Add Quote" link that flips to a green
      // "Quoted" badge the moment rates are saved for that vendor.
      // Progress pill on top gives a quick glance; overflow beyond 4
      // vendors collapses to "+N more" (hover to see the names).
      key: "_vendors",
      label: "Vendors",
      width: "240px",
      render: (row) => {
        const vendors: any[] = Array.isArray(row.vendors) ? row.vendors : [];
        if (vendors.length === 0) {
          return <span className="text-[11px] text-gray-400 italic">—</span>;
        }
        const quotedCount = vendors.filter(
          (v) => Array.isArray(v.quotedRates) && v.quotedRates.length > 0,
        ).length;
        const total = vendors.length;
        const allQuoted = quotedCount === total;
        const MAX_VISIBLE = 4;
        const visible = vendors.slice(0, MAX_VISIBLE);
        const overflow = total - visible.length;

        return (
          <div className="flex flex-col gap-1.5">
            <span
              className={
                allQuoted
                  ? "self-start inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-semibold"
                  : "self-start inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-[10px] font-semibold"
              }
            >
              {allQuoted && <CheckCircle2 className="w-3 h-3" />}
              {quotedCount}/{total} quoted
            </span>
            <ul className="space-y-0.5">
              {visible.map((v, i) => {
                const hasQuoted =
                  Array.isArray(v.quotedRates) && v.quotedRates.length > 0;
                const name =
                  v.vendorName || v.vendorId || `Vendor ${i + 1}`;
                const tip = v.email ? `${name} \u2014 ${v.email}` : name;
                return (
                  <li
                    key={v.id ?? v.vendorId ?? i}
                    title={`${tip} \u00B7 ${hasQuoted ? "Quoted" : "Pending"}`}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span
                        className={
                          hasQuoted
                            ? "w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                            : "w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0"
                        }
                      />
                      <span
                        className={
                          hasQuoted
                            ? "text-gray-800 truncate"
                            : "text-gray-500 truncate"
                        }
                      >
                        {name}
                      </span>
                    </div>
                    {hasQuoted ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddQuoteCtx({
                            rfqId: row.id,
                            rfqNumber: row.rfqNumber ?? "",
                            vendors,
                            lines: Array.isArray(row.lines) ? row.lines : [],
                            initialVendorRowId: v.id,
                          });
                        }}
                        title="Click to edit this quote"
                        className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 hover:underline shrink-0"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Quoted
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddQuoteCtx({
                            rfqId: row.id,
                            rfqNumber: row.rfqNumber ?? "",
                            vendors,
                            lines: Array.isArray(row.lines) ? row.lines : [],
                            initialVendorRowId: v.id,
                          });
                        }}
                        className="text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline font-medium shrink-0"
                      >
                        Add Quote
                      </button>
                    )}
                  </li>
                );
              })}
              {overflow > 0 && (
                <li
                  title={vendors
                    .slice(MAX_VISIBLE)
                    .map((v) => v.vendorName || v.vendorId || "Vendor")
                    .join(", ")}
                  className="text-[11px] text-gray-400 italic pl-3.5"
                >
                  +{overflow} more
                </li>
              )}
            </ul>
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
        "sent",
        "responses_received",
        "evaluated",
        "closed",
        "rejected",
      ],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
    {
      key: "_actions",
      label: "Actions",
      width: "210px",
      render: (row) => {
        const rowVendors: any[] = Array.isArray(row.vendors) ? row.vendors : [];
        const anyQuoted = rowVendors.some(
          (v) => Array.isArray(v.quotedRates) && v.quotedRates.length > 0,
        );
        const isDraft = row.status === "draft";
        return (
          <div className="flex items-center justify-end gap-1.5">
            {anyQuoted && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCompareCtx({
                    rfqId: row.id,
                    rfqNumber: row.rfqNumber ?? "",
                    projectName: row.projectName ?? "",
                    vendors: rowVendors,
                    lines: Array.isArray(row.lines) ? row.lines : [],
                  });
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100"
                title="Compare vendor quotes"
              >
                <GitCompare className="w-3.5 h-3.5" />
                Compare
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/purchase/rfqs/${row.id}`);
              }}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              title="View"
            >
              <Eye className="w-4 h-4" />
            </button>
            {isDraft && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSubmitError(null);
                  setSubmitTarget(row);
                }}
                className="p-1.5 rounded hover:bg-gray-100 text-orange-500"
                title="Submit for Approval"
              >
                <Send className="w-4 h-4" />
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
          data={data}
          onAdd={canAdd ? () => setDrawerOpen(true) : undefined}
          addLabel="New RFQ"
          defaultSort="dueDate"
          defaultSortDir="desc"
          historyEntityType="rfq"
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
            ? `Pick which RFQ materials to send to ${pickerCtx.vendorLabel}. Leave empty to send all.`
            : undefined
        }
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
        onCreatePO={(vendorRowId) => {
          if (!compareCtx) return;
          // Stub: route to PO create flow. A proper implementation
          // would prefill the PO form with the RFQ's items at this
          // vendor's quoted rates.
          router.push(
            `/purchase/orders?rfqId=${encodeURIComponent(compareCtx.rfqId)}&vendorRowId=${encodeURIComponent(vendorRowId)}`,
          );
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
