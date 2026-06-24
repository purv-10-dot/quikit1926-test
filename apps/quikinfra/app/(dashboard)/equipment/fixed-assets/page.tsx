"use client";

import { useState } from "react";
import {
  Plus,
  Layers,
  Package,
  Undo2,
  Wrench,
  AlertTriangle,
  IndianRupee,
} from "lucide-react";
import {
  PageHeader,
  PageContainer,
  PrimaryButton,
  KPICard,
  StatusChip,
} from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import {
  useFixedAssetDashboard,
  useFixedAssetIssuances,
  useFixedAssetTransfers,
  useReturnFixedAssetIssuance,
  usePatchFixedAssetTransfer,
} from "@/hooks/use-fixed-assets";
import { useMenuActions, usePermissions } from "@/hooks/use-permissions";
import { IssueAssetDrawer } from "./issue/new/IssueAssetDrawer";
import { AssetTransferDrawer } from "./transfers/new/AssetTransferDrawer";
import type {
  FixedAssetCategoryRow,
  FixedAssetIssuanceRecord,
  FixedAssetTransferRecord,
} from "@/lib/equipment/fixed-assets-types";

type TabKey = "dashboard" | "issuances" | "transfers";

function formatCurrency(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function FixedAssetsPage() {
  const { canAdd, canEdit } = useMenuActions("/equipment/fixed-assets");
  const { isSuper } = usePermissions();
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: dashboard, isLoading: dashLoading } = useFixedAssetDashboard();
  const { data: issuancesResult, isLoading: issuancesLoading } = useFixedAssetIssuances();
  const { data: transfersResult, isLoading: transfersLoading } = useFixedAssetTransfers();

  const returnIssuance = useReturnFixedAssetIssuance();
  const patchTransfer = usePatchFixedAssetTransfer();

  const kpis = dashboard?.kpis;
  const byCategory = dashboard?.byCategory ?? [];
  const issuances = issuancesResult?.data ?? [];
  const transfers = transfersResult?.data ?? [];

  const primaryAction =
    tab === "issuances"
      ? { label: "Issue Asset", href: "/equipment/fixed-assets/issue/new" }
      : tab === "transfers"
        ? { label: "New Transfer", href: "/equipment/fixed-assets/transfers/new" }
        : null;

  const issuanceColumns: ColDef<FixedAssetIssuanceRecord>[] = [
    { key: "issuanceNumber", label: "Issuance #", width: "100px" },
    {
      key: "asset",
      label: "Asset",
      render: (row) => (
        <div>
          <div className="font-medium">{row.assetCode}</div>
          <div className="text-xs text-gray-500">{row.assetName}</div>
        </div>
      ),
    },
    {
      key: "issuedTo",
      label: "Issued To",
      render: (row) => (
        <div>
          <div className="font-medium">{row.issuedTo}</div>
          <div className="text-xs text-gray-500 capitalize">{row.issuedToType}</div>
        </div>
      ),
    },
    { key: "quantity", label: "Qty", width: "60px" },
    { key: "pendingQty", label: "Pending", width: "70px" },
    { key: "gatePassNo", label: "Gate Pass", width: "110px", render: (r) => r.gatePassNo ?? "—" },
    {
      key: "expectedReturnDate",
      label: "Expected",
      width: "100px",
      render: (r) => r.expectedReturnDate ?? "—",
    },
    {
      key: "status",
      label: "Status",
      width: "90px",
      render: (r) => <StatusChip status={r.status} />,
    },
    {
      key: "actions",
      label: "Action",
      width: "90px",
      render: (row) =>
        row.pendingQty > 0 && (isSuper || canEdit) ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"
            onClick={(e) => {
              e.stopPropagation();
              void returnIssuance.mutateAsync({ id: row.id, action: "return" });
            }}
          >
            <Undo2 className="h-3 w-3" />
            Return
          </button>
        ) : (
          "—"
        ),
    },
  ];

  const transferColumns: ColDef<FixedAssetTransferRecord>[] = [
    { key: "transferNumber", label: "Transfer #", width: "100px" },
    {
      key: "asset",
      label: "Asset",
      render: (row) => (
        <div>
          <div className="font-medium">{row.assetCode}</div>
          <div className="text-xs text-gray-500">{row.assetName}</div>
        </div>
      ),
    },
    { key: "quantity", label: "Qty", width: "60px" },
    {
      key: "route",
      label: "From → To",
      render: (row) => (
        <span className="text-sm">
          {row.sourceProjectName ?? "—"} → {row.destinationProjectName}
        </span>
      ),
    },
    { key: "gatePassNo", label: "Gate Pass", width: "110px", render: (r) => r.gatePassNo ?? "—" },
    {
      key: "status",
      label: "Status",
      width: "100px",
      render: (r) => <StatusChip status={r.status} />,
    },
    {
      key: "actions",
      label: "Action",
      width: "130px",
      render: (row) =>
        row.status === "in_transit" && (isSuper || canEdit) ? (
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              className="font-medium text-emerald-700"
              onClick={(e) => {
                e.stopPropagation();
                void patchTransfer.mutateAsync({ id: row.id, action: "receive" });
              }}
            >
              Receive
            </button>
            <button
              type="button"
              className="text-slate-500"
              onClick={(e) => {
                e.stopPropagation();
                void patchTransfer.mutateAsync({ id: row.id, action: "cancel" });
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          "—"
        ),
    },
  ];

  const categoryColumns: ColDef<FixedAssetCategoryRow>[] = [
    { key: "category", label: "Category" },
    { key: "assets", label: "Assets", width: "100px" },
    {
      key: "bookValue",
      label: "Book Value",
      width: "140px",
      render: (r) => formatCurrency(r.bookValue),
    },
  ];

  return (
    <>
      <PageHeader
        title="Fixed Asset / Tools"
        subtitle="Issuance · returns · transfers"
        breadcrumbs={[
          { label: "Plant & Machinery", href: "/equipment/fixed-assets" },
          { label: "Fixed Assets" },
        ]}
        actions={
          primaryAction && (canAdd || isSuper) ? (
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {primaryAction.label}
            </PrimaryButton>
          ) : undefined
        }
      />

      <PageContainer>
        <div className="mb-4 flex flex-wrap gap-4 border-b border-slate-200">
          {(
            [
              { key: "dashboard", label: "Dashboard" },
              { key: "issuances", label: "Issuances" },
              { key: "transfers", label: "Transfers" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "dashboard" && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              <KPICard title="ASSETS" value={kpis?.assets ?? 0} icon={<Layers className="h-5 w-5" />} color="brand" />
              <KPICard title="AVAILABLE" value={kpis?.available ?? 0} icon={<Package className="h-5 w-5" />} color="success" />
              <KPICard title="ISSUED" value={kpis?.issued ?? 0} icon={<Undo2 className="h-5 w-5" />} color="amber" />
              <KPICard title="UNDER REPAIR" value={kpis?.underRepair ?? 0} icon={<Wrench className="h-5 w-5" />} color="info" />
              <KPICard title="LOST" value={kpis?.lost ?? 0} icon={<AlertTriangle className="h-5 w-5" />} color="warn" />
              <KPICard
                title="BOOK VALUE"
                value={formatCurrency(kpis?.bookValue ?? 0)}
                icon={<IndianRupee className="h-5 w-5" />}
                color="success"
              />
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-800">By Category</h3>
              <DataTable
                id="fixed-assets-by-category"
                columns={categoryColumns}
                data={byCategory}
                loading={dashLoading}
                fitToContent
                emptyTitle="No assets registered"
                emptyHint="Add tools and fixed assets in Masters → Assets."
              />
            </div>
          </>
        )}

        {tab === "issuances" && (
          <DataTable
            id="fixed-asset-issuances"
            columns={issuanceColumns}
            data={issuances}
            loading={issuancesLoading}
            fitToContent
            emptyTitle="No issuances yet"
            emptyHint="Issue an asset to a user, department, or site."
          />
        )}

        {tab === "transfers" && (
          <DataTable
            id="fixed-asset-transfers"
            columns={transferColumns}
            data={transfers}
            loading={transfersLoading}
            fitToContent
            emptyTitle="No transfers yet"
            emptyHint="Dispatch assets between project sites."
          />
        )}

      </PageContainer>

      <IssueAssetDrawer
        open={createOpen && tab === "issuances"}
        onClose={() => setCreateOpen(false)}
        onSaved={() => setCreateOpen(false)}
      />
      <AssetTransferDrawer
        open={createOpen && tab === "transfers"}
        onClose={() => setCreateOpen(false)}
        onSaved={() => setCreateOpen(false)}
      />
    </>
  );
}
