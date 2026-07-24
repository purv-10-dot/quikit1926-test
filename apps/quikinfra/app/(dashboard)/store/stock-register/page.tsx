"use client";

import { useEffect, useState } from "react";
import { BarChart3, AlertTriangle, ShoppingCart } from "lucide-react";
import {
  PageHeader, PageContainer, KPICard,
} from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { useStockRegister } from "@/hooks/use-store";

interface StockRegisterRow {
  id?: string; balance?: number | string; isLowStock?: boolean;
  minStockLevel?: number | string; onOrderQty?: number | string;
  onOrderValue?: number | string; stockValue?: number | string;
  [key: string]: unknown;
}

export default function StockRegisterPage() {
  const [projectFilter, setProjectFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [showLowOnly, setShowLowOnly] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setPage(1);
  }, [projectFilter, locationFilter, showLowOnly, search, pageSize]);

  const { data: result, isLoading } = useStockRegister({
    projectId: projectFilter || undefined,
    locationId: locationFilter || undefined,
    lowStockOnly: showLowOnly,
    search: search || undefined,
    page,
    pageSize,
  });

  const stockData = result?.data ?? [];
  const total = result?.total ?? 0;
  const summary = result?.summary ?? {
    totalItems: 0,
    totalValue: 0,
    onOrderValue: 0,
    lowStockCount: 0,
  };

  const columns: ColDef<StockRegisterRow>[] = [
    { key: "itemCode", label: "Code", sortable: true, searchable: true },
    { key: "itemName", label: "Item Name", sortable: true, searchable: true },
    { key: "groupName", label: "Group", sortable: true },
    { key: "uomCode", label: "UOM", width: "60px" },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "locationName", label: "Location", sortable: true },
    { key: "totalIn", label: "In", type: "number", sortable: true },
    { key: "totalOut", label: "Out", type: "number", sortable: true },
    {
      key: "onOrderQty",
      label: "On Order",
      type: "number",
      sortable: true,
      // Pending PO qty (orderedQty − receivedQty across all live
      // POs for this item). Lets the user see what's expected before
      // any GRN posts.
      render: (row) =>
        Number(row.onOrderQty) > 0 ? (
          <span className="text-orange-700 font-semibold">{row.onOrderQty}</span>
        ) : (
          <span className="text-slate-300">0</span>
        ),
    },
    {
      key: "onOrderValue",
      label: "On Order Value",
      type: "number",
      sortable: true,
      render: (row) =>
        Number(row.onOrderValue) > 0
          ? `₹ ${Number(row.onOrderValue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
          : <span className="text-slate-300">₹ 0.00</span>,
    },
    {
      key: "balance", label: "Balance", type: "number", sortable: true,
      render: (row) => (
        <span className={`font-bold ${row.isLowStock ? "text-rose-700" : "text-slate-900"}`}>
          {row.balance}
          {row.isLowStock && <AlertTriangle className="w-3 h-3 inline ml-1 text-rose-500" />}
        </span>
      ),
    },
    { key: "minStockLevel", label: "Min", type: "number", sortable: true,
      render: (row) => row.minStockLevel ?? "—",
    },
    {
      key: "stockValue", label: "Value", type: "number", sortable: true,
      render: (row) => `₹ ${Number(row.stockValue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    },
    {
      key: "isLowStock", label: "Low Stock", type: "boolean",
    },
  ];

  return (
    <>
      <PageHeader
        title="Stock Register"
        subtitle="Current stock levels — computed from append-only ledger"
        breadcrumbs={[{ label: "Store", href: "/store" }, { label: "Stock Register" }]}
      />

      <PageContainer>
        {/* Summary KPIs — semantic colors aligned with construction-ERP palette:
            primary count → brand, money received → success, pending POs → warn,
            alerts → danger. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard title="Total Items" value={summary.totalItems} icon={<BarChart3 className="w-5 h-5" />} color="brand" />
          <KPICard title="Total Stock Value" subtitle="Received stock" value={`₹ ${(summary.totalValue ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`} icon={<BarChart3 className="w-5 h-5" />} color="success" />
          <KPICard title="On Order Value" subtitle="Open POs, not yet received" value={`₹ ${(summary.onOrderValue ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`} icon={<ShoppingCart className="w-5 h-5" />} color="warn" />
          <KPICard title="Low Stock Alerts" value={summary.lowStockCount} icon={<AlertTriangle className="w-5 h-5" />} color="danger" />
        </div>

        <DataTable
          id="stock-register"
          columns={columns.map((c) => ({ ...c, sortable: false }))}
          data={stockData as unknown as StockRegisterRow[]}
          loading={isLoading}
          serverMode
          serverTotal={total}
          serverPage={page}
          serverPageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onSearchChange={setSearch}
          hideFilter
          hideColumns
        />
      </PageContainer>
    </>
  );
}
