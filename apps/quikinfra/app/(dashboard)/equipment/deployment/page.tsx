"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Truck,
  AlertTriangle,
  History,
  MoreHorizontal,
  Trash2,
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
  useEquipmentTransfers,
  useDeploymentSummary,
  useEquipmentDocuments,
  usePatchTransfer,
  useDeleteEquipmentDocument,
} from "@/hooks/use-equipment";
import { useMenuActions } from "@/hooks/use-permissions";
import { useQueryClient } from "@tanstack/react-query";

type TabKey = "transfers" | "compliance";

interface TransferRow {
  id: string;
  transferNumber: string;
  equipmentCode: string;
  equipmentName: string;
  sourceProjectName: string | null;
  destinationProjectName: string;
  transferType: string;
  gatePassNo: string | null;
  transferDate: string;
  status: string;
}

interface DocRow {
  id: string;
  equipmentCode: string;
  equipmentName: string;
  docType: string;
  docNumber: string | null;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  complianceState: string;
}

const TRANSFER_STATUS: Record<string, "success" | "warning" | "neutral" | "danger"> = {
  received: "success",
  in_transit: "warning",
  cancelled: "danger",
};

const DOC_STATUS: Record<string, "success" | "warning" | "danger"> = {
  ok: "success",
  expiring: "warning",
  expired: "danger",
};

export default function DeploymentPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { canAdd, canEdit, canDelete } = useMenuActions("/equipment/deployment");
  const patchTransfer = usePatchTransfer();
  const deleteDoc = useDeleteEquipmentDocument();

  const [tab, setTab] = useState<TabKey>("transfers");
  const [actionMenu, setActionMenu] = useState<string | null>(null);

  const { data: transfersResult, isLoading: transfersLoading } =
    useEquipmentTransfers({});
  const { data: summary } = useDeploymentSummary();
  const { data: docsResult, isLoading: docsLoading } = useEquipmentDocuments();

  const transferRows: TransferRow[] = (transfersResult?.data ?? []) as TransferRow[];
  const docRows: DocRow[] = (docsResult?.data ?? []) as DocRow[];

  const handleReceive = async (id: string) => {
    await patchTransfer.mutateAsync({ id, action: "receive" });
    await qc.invalidateQueries({ queryKey: ["equipment-transfers"] });
    setActionMenu(null);
  };

  const handleCancelTransfer = async (id: string) => {
    await patchTransfer.mutateAsync({ id, action: "cancel" });
    await qc.invalidateQueries({ queryKey: ["equipment-transfers"] });
    setActionMenu(null);
  };

  const handleDeleteDoc = async (id: string) => {
    await deleteDoc.mutateAsync(id);
    setActionMenu(null);
  };

  const transferColumns: ColDef<TransferRow>[] = useMemo(
    () => [
      { key: "transferNumber", label: "Transfer #", width: "100px" },
      {
        key: "equipment",
        label: "Equipment",
        render: (row) => (
          <div>
            <div className="font-medium text-gray-900">{row.equipmentCode}</div>
            <div className="text-xs text-gray-500">{row.equipmentName}</div>
          </div>
        ),
      },
      {
        key: "route",
        label: "From → To",
        render: (row) => (
          <span className="text-sm">
            {row.sourceProjectName ?? "—"} → {row.destinationProjectName}
          </span>
        ),
      },
      {
        key: "transferType",
        label: "Type",
        width: "110px",
        render: (row) => (
          <span className="capitalize">{row.transferType}</span>
        ),
      },
      { key: "gatePassNo", label: "Gate Pass", width: "120px" },
      { key: "transferDate", label: "Date", width: "110px" },
      {
        key: "status",
        label: "Status",
        width: "100px",
        render: (row) => <StatusChip status={row.status} />,
      },
      {
        key: "actions",
        label: "Action",
        width: "80px",
        render: (row) =>
          row.status === "in_transit" && canEdit ? (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActionMenu(actionMenu === row.id ? null : row.id);
                }}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {actionMenu === row.id && (
                <div className="absolute right-0 z-20 mt-1 w-36 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-sm">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-gray-50"
                    onClick={() => void handleReceive(row.id)}
                  >
                    Receive
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-red-600"
                    onClick={() => void handleCancelTransfer(row.id)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ) : (
            <span className="text-gray-300">—</span>
          ),
      },
    ],
    [actionMenu, canEdit],
  );

  const docColumns: ColDef<DocRow>[] = [
    {
      key: "equipment",
      label: "Equipment",
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.equipmentCode}</div>
          <div className="text-xs text-gray-500">{row.equipmentName}</div>
        </div>
      ),
    },
    {
      key: "docType",
      label: "Document",
      render: (row) => (
        <span className="capitalize">{row.docType.replace("_", " ")}</span>
      ),
    },
    { key: "docNumber", label: "Doc No", width: "100px" },
    { key: "expiryDate", label: "Expiry", width: "110px" },
    {
      key: "days",
      label: "Days",
      width: "80px",
      render: (row) => {
        if (row.daysUntilExpiry == null) return "—";
        const abs = Math.abs(row.daysUntilExpiry);
        const label =
          row.daysUntilExpiry < 0 ? `${abs}d ago` : `${row.daysUntilExpiry}d left`;
        return (
          <span
            className={
              row.complianceState === "expired" ? "text-red-600 font-medium" : ""
            }
          >
            {label}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      width: "100px",
      render: (row) => <StatusChip status={row.complianceState} />,
    },
    {
      key: "actions",
      label: "Action",
      width: "70px",
      render: (row) =>
        canDelete ? (
          <button
            type="button"
            onClick={() => void handleDeleteDoc(row.id)}
            className="p-1 text-gray-400 hover:text-red-600"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
  ];

  const primaryAction =
    tab === "transfers"
      ? { label: "New Transfer", href: "/equipment/deployment/new" }
      : { label: "Add Document", href: "/equipment/deployment/documents/new" };

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Plant & Machinery", href: "/equipment/deployment" },
          { label: "Deployment" },
        ]}
        title="Deployment & Compliance"
        subtitle="Inter-site transfers (gate pass) · document expiry alerts"
        actions={
          canAdd ? (
            <PrimaryButton onClick={() => router.push(primaryAction.href)}>
              <Plus className="w-4 h-4" />
              {primaryAction.label}
            </PrimaryButton>
          ) : undefined
        }
      />

      <PageContainer>
        <div className="flex gap-6 border-b border-gray-200 mb-6">
          {(
            [
              { key: "transfers", label: "Transfers" },
              { key: "compliance", label: "Compliance Docs" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <KPICard
            title="IN TRANSIT"
            value={summary?.inTransit ?? 0}
            icon={<Truck className="w-5 h-5" />}
            color="brand"
          />
          <KPICard
            title="DOCS EXPIRED"
            value={summary?.docsExpired ?? 0}
            icon={<AlertTriangle className="w-5 h-5" />}
            color="amber"
          />
          <KPICard
            title="DOCS EXPIRING"
            value={summary?.docsExpiring ?? 0}
            icon={<History className="w-5 h-5" />}
            color="neutral"
          />
        </div>

        {tab === "transfers" ? (
          <DataTable
            id="equipment-transfers"
            columns={transferColumns}
            data={transferRows}
            loading={transfersLoading}
            fitToContent
            emptyTitle="No transfers yet"
            emptyHint="Dispatch a machine to another project with a gate pass."
          />
        ) : (
          <DataTable
            id="equipment-documents"
            columns={docColumns}
            data={docRows}
            loading={docsLoading}
            fitToContent
            emptyTitle="No compliance documents"
            emptyHint="Add RC, insurance, PUC, fitness, permit or road tax records."
          />
        )}
      </PageContainer>
    </>
  );
}
