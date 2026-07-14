"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  FileBarChart2, BarChart3, TrendingUp, Package,
  ShoppingCart, Warehouse, FolderKanban, Download, CalendarCheck,
} from "lucide-react";
import { PageHeader, PageContainer, StatusChip, SecondaryButton } from "@/components/PageShell";
import { exportCSV } from "@/components/QuickCreateDrawer";
import { SelectInput } from "@/components/FormDrawer";
import { getCurrentFY } from "@/lib/validators";

type ReportType = "po-register" | "po-vs-grn" | "vendor-purchase" | "pending-delivery" |
  "stock-valuation" | "stock-movement" | "consumption" | "low-stock" |
  "boq-progress" | "dpr-summary" | "pr-status" | "approval-log";

interface FYOption {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportType | null>(null);

  // Reports scope to the current financial year, computed from today's date
  // (Apr–Mar Indian fiscal year). Single option — the current FY.
  const fyOptions = useMemo<FYOption[]>(() => {
    const cur = getCurrentFY();
    return [{
      id: "fy-current",
      label: cur.label,
      startDate: cur.startDate,
      endDate: cur.endDate,
      isCurrent: true,
    }];
  }, []);

  const [selectedFyId, setSelectedFyId] = useState<string | null>(null);
  const selectedFy = fyOptions.find((f) => f.id === selectedFyId) ?? fyOptions[0]!;

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Construction operations intelligence"
        actions={
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-orange-600" />
            <label className="text-xs font-semibold text-orange-700">Financial Year</label>
            <div className="min-w-[180px]">
              <SelectInput
                value={selectedFy.id}
                onChange={setSelectedFyId}
                options={fyOptions.map((f) => ({
                  value: f.id,
                  label: `${f.label}${f.isCurrent ? " (current)" : ""}`,
                }))}
              />
            </div>
          </div>
        }
      />
      <PageContainer>
        {!activeReport ? (
          <ReportMenu onSelect={setActiveReport} fy={selectedFy} />
        ) : (
          <ReportViewer type={activeReport} fy={selectedFy} onBack={() => setActiveReport(null)} />
        )}
      </PageContainer>
    </>
  );
}

type MenuItem = {
  label: string;
  desc: string;
  icon: typeof BarChart3;
  /** Inline report rendered by ReportViewer. */
  key?: ReportType;
  /** Standalone report page to navigate to instead of rendering inline. */
  href?: string;
};

function ReportMenu({ onSelect, fy }: { onSelect: (r: ReportType) => void; fy: FYOption }) {
  const REPORTS: { section: string; items: MenuItem[] }[] = [
    { section: "Purchase", items: [
      { key: "po-register", label: "PO Register", desc: "All purchase orders with status and amounts", icon: ShoppingCart },
      { key: "po-vs-grn", label: "PO vs GRN", desc: "Ordered vs received quantity comparison", icon: BarChart3 },
      { key: "vendor-purchase", label: "Vendor-wise Purchase", desc: "Total purchase value by vendor", icon: TrendingUp },
      { key: "pr-status", label: "PR Status Report", desc: "All PRs with current status", icon: FileBarChart2 },
      { href: "/reports/vendor-performance", label: "Vendor Performance", desc: "On-time delivery & quality acceptance by vendor", icon: BarChart3 },
    ]},
    { section: "Store & Inventory", items: [
      { key: "stock-valuation", label: "Stock Valuation", desc: "Current stock value by item", icon: Warehouse },
      { key: "low-stock", label: "Low Stock Alert", desc: "Items below minimum stock level", icon: Package },
      { key: "stock-movement", label: "Stock Movement", desc: "GRN receipts and issues summary", icon: BarChart3 },
      { key: "consumption", label: "Consumption Report", desc: "Material usage by project", icon: TrendingUp },
    ]},
    { section: "Projects & Approvals", items: [
      { key: "boq-progress", label: "Project Progress", desc: "Project-wise value and status", icon: FolderKanban },
      { key: "dpr-summary", label: "DPR Summary", desc: "Daily progress overview", icon: FileBarChart2 },
      { key: "approval-log", label: "Approval Audit Log", desc: "All approval actions with timestamps", icon: BarChart3 },
    ]},
  ];

  const cardClass =
    "flex flex-col p-4 rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-orange-200 transition-all text-left";

  return (
    <div className="space-y-6">
      <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-xs text-orange-800">
        Reports below are scoped to <span className="font-bold">{fy.label}</span>{" "}
        ({fy.startDate} → {fy.endDate}). Use the FY selector in the header to switch periods.
      </div>
      {REPORTS.map((section) => (
        <div key={section.section}>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{section.section}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {section.items.map((report) =>
              report.href ? (
                <Link key={report.href} href={report.href} className={cardClass}>
                  <report.icon className="w-5 h-5 text-orange-600 mb-2" />
                  <p className="text-sm font-medium text-gray-900">{report.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{report.desc}</p>
                </Link>
              ) : (
                <button key={report.key} onClick={() => report.key && onSelect(report.key)} className={cardClass}>
                  <report.icon className="w-5 h-5 text-orange-600 mb-2" />
                  <p className="text-sm font-medium text-gray-900">{report.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{report.desc}</p>
                </button>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

type ReportConfig = {
  title: string;
  api: string;
  /** Field name used to filter rows by the selected FY range. Leave undefined for "current snapshot" reports. */
  dateField?: string;
  columns: { key: string; label: string; format?: "currency" | "status" }[];
};

function ReportViewer({ type, fy, onBack }: { type: ReportType; fy: FYOption; onBack: () => void }) {
  const REPORT_CONFIG: Record<ReportType, ReportConfig> = {
    "po-register": {
      title: "PO Register", api: "/api/purchase/orders", dateField: "poDate",
      columns: [
        { key: "poNumber", label: "PO Number" }, { key: "vendorName", label: "Vendor" },
        { key: "projectName", label: "Project" }, { key: "poDate", label: "Date" },
        { key: "totalAmount", label: "Amount", format: "currency" }, { key: "status", label: "Status", format: "status" },
      ],
    },
    "pr-status": {
      title: "PR Status Report", api: "/api/purchase/requisitions", dateField: "requestDate",
      columns: [
        { key: "prNumber", label: "PR Number" }, { key: "projectName", label: "Project" },
        { key: "requestDate", label: "Date" }, { key: "purpose", label: "Purpose" },
        { key: "estimatedTotal", label: "Est. Value", format: "currency" }, { key: "status", label: "Status", format: "status" },
      ],
    },
    "po-vs-grn": {
      title: "PO vs GRN Comparison", api: "/api/purchase/orders", dateField: "poDate",
      columns: [
        { key: "poNumber", label: "PO Number" }, { key: "vendorName", label: "Vendor" },
        { key: "totalAmount", label: "PO Amount", format: "currency" }, { key: "lineCount", label: "Items" },
        { key: "status", label: "Delivery Status", format: "status" },
      ],
    },
    "vendor-purchase": {
      // Vendors are master data — the FY pill annotates the report period
      // but the row set itself is always all active vendors.
      title: "Vendor-wise Purchase", api: "/api/masters/vendors",
      columns: [
        { key: "code", label: "Vendor Code" }, { key: "name", label: "Vendor Name" },
        { key: "city", label: "City" }, { key: "gstin", label: "GSTIN" }, { key: "status", label: "Status", format: "status" },
      ],
    },
    "pending-delivery": {
      title: "Pending Delivery", api: "/api/purchase/orders", dateField: "deliveryDate",
      columns: [
        { key: "poNumber", label: "PO Number" }, { key: "vendorName", label: "Vendor" },
        { key: "deliveryDate", label: "Due Date" }, { key: "status", label: "Status", format: "status" },
      ],
    },
    "stock-valuation": {
      title: "Stock Valuation Report",
      api: "/api/store/stock-register?includeAllItems=true",
      columns: [
        { key: "itemCode", label: "Code" }, { key: "itemName", label: "Material" },
        { key: "uomCode", label: "UOM" }, { key: "currentStock", label: "Qty" },
        { key: "avgRate", label: "Rate", format: "currency" }, { key: "stockValue", label: "Value", format: "currency" },
      ],
    },
    "low-stock": {
      title: "Low Stock Alerts", api: "/api/store/stock-register?lowStockOnly=true",
      columns: [
        { key: "itemCode", label: "Code" }, { key: "itemName", label: "Material" },
        { key: "currentStock", label: "Current Stock" }, { key: "minStockLevel", label: "Min Level" },
      ],
    },
    "stock-movement": {
      title: "Stock Movement Summary", api: "/api/store/stock-register",
      columns: [
        { key: "itemCode", label: "Code" }, { key: "itemName", label: "Material" },
        { key: "currentStock", label: "Balance" }, { key: "stockValue", label: "Value", format: "currency" },
      ],
    },
    "consumption": {
      title: "Material Consumption", api: "/api/store/stock-register",
      columns: [
        { key: "itemCode", label: "Code" }, { key: "itemName", label: "Material" },
        { key: "uomCode", label: "UOM" }, { key: "currentStock", label: "Stock" },
        { key: "stockValue", label: "Value", format: "currency" },
      ],
    },
    "boq-progress": {
      title: "Project Progress Summary", api: "/api/masters/projects", dateField: "startDate",
      columns: [
        { key: "code", label: "Project Code" }, { key: "name", label: "Project Name" },
        { key: "city", label: "Location" }, { key: "projectValue", label: "Contract Value", format: "currency" },
        { key: "status", label: "Status", format: "status" },
      ],
    },
    "dpr-summary": {
      title: "DPR Summary", api: "/api/projects/dpr", dateField: "reportDate",
      columns: [
        { key: "dprNumber", label: "DPR No" }, { key: "projectName", label: "Project" },
        { key: "reportDate", label: "Date" }, { key: "status", label: "Status", format: "status" },
      ],
    },
    "approval-log": {
      title: "Approval Audit Log", api: "/api/approvals/pending", dateField: "createdAt",
      columns: [
        { key: "entityNumber", label: "Document" }, { key: "entityType", label: "Type" },
        { key: "projectName", label: "Project" }, { key: "requestedByName", label: "Requested By" },
        { key: "status", label: "Status", format: "status" },
      ],
    },
  };

  const config = REPORT_CONFIG[type];

  const { data, isLoading } = useQuery({
    queryKey: ["report", type, fy.id],
    queryFn: async () => {
      // Send fyStart/fyEnd as query params. APIs that honor them filter
      // server-side; APIs that ignore them get filtered client-side below.
      const sep = config.api.includes("?") ? "&" : "?";
      const url = `${config.api}${sep}fyStart=${fy.startDate}&fyEnd=${fy.endDate}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  // Client-side FY filter as a defence-in-depth fallback. Reports with a
  // `dateField` get filtered against the selected FY range; reports without
  // one (stock state, vendor master) are passthrough.
  const allRows = useMemo(() => (data?.data ?? []) as Record<string, unknown>[], [data]);
  const rows = useMemo(() => {
    if (!config.dateField) return allRows;
    const start = fy.startDate;
    const end = fy.endDate;
    return allRows.filter((r) => {
      const v = r?.[config.dateField!];
      if (!v) return false;
      // ISO date string sort works at YYYY-MM-DD precision
      const s = String(v).slice(0, 10);
      return s >= start && s <= end;
    });
  }, [allRows, config.dateField, fy.startDate, fy.endDate]);

  const currencyCols = config.columns.filter((c) => c.format === "currency");
  const totalsValueColumn =
    currencyCols.length > 0 ? currencyCols[currencyCols.length - 1].key : undefined;
  const totalAmount = totalsValueColumn
    ? rows.reduce((sum: number, r) => sum + (Number(r?.[totalsValueColumn]) || 0), 0)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            ← Back to Reports
          </button>
          <h2 className="text-lg font-semibold text-gray-900">{config.title}</h2>
          <span className="text-xs font-bold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
            {fy.label}
          </span>
          <span className="text-sm text-gray-500">({rows.length} records)</span>
          {totalsValueColumn && totalAmount > 0 && (
            <span className="text-sm text-gray-700">
              Total: <span className="font-bold">₹ {totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
            </span>
          )}
        </div>
        <SecondaryButton onClick={() => exportCSV(rows, `${config.title.replace(/\s+/g, "-").toLowerCase()}-${fy.label.replace(/\s+/g, "")}`)}>
          <Download className="w-4 h-4" /> Export CSV
        </SecondaryButton>
      </div>

      {!config.dateField && (
        <div className="text-xs text-gray-500 italic">
          Note: this report shows the current snapshot — it isn&apos;t bound to the selected financial year.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 animate-pulse space-y-3">
            {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-gray-100 rounded" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">No data available for this report.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {config.columns.map(col => (
                    <th key={col.key} className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row, i: number) => (
                  <tr key={String(row.id ?? i)} className="hover:bg-gray-50/50">
                    {config.columns.map(col => (
                      <td key={col.key} className="px-4 py-3 text-sm text-gray-700">
                        {col.format === "currency" ? (
                          <span className="font-medium">₹ {Number(row[col.key] ?? 0).toLocaleString("en-IN")}</span>
                        ) : col.format === "status" ? (
                          <StatusChip status={String(row[col.key] ?? "")} />
                        ) : (
                          String(row[col.key] ?? "—")
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
