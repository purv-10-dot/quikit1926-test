"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Truck,
  AlertTriangle,
  History,
  MoreHorizontal,
  Trash2,
  Eye,
  ExternalLink,
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
import { TransferDrawer } from "./new/TransferDrawer";
import { ComplianceDocumentDrawer } from "./documents/new/ComplianceDocumentDrawer";

type TabKey = "transfers" | "compliance";

interface TransferRow {
  [key: string]: unknown;
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
  [key: string]: unknown;
  id: string;
  equipmentCode: string;
  equipmentName: string;
  docType: string;
  docNumber: string | null;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  complianceState: string;
  fileUrl: string | null;
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
  const [createOpen, setCreateOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("transferDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setPage(1);
  }, [search, sortBy, sortOrder, pageSize]);

  const transferParams = useMemo(
    () => ({ search: search || undefined, page, pageSize, sortBy, sortOrder }),
    [search, page, pageSize, sortBy, sortOrder],
  );

  const { data: transfersResult, isLoading: transfersLoading } =
    useEquipmentTransfers(transferParams);
  const { data: summary } = useDeploymentSummary();
  const { data: docsResult, isLoading: docsLoading } = useEquipmentDocuments();

  const transferRows: TransferRow[] = (transfersResult?.data ?? []) as unknown as TransferRow[];
  const transfersTotal = transfersResult?.total ?? 0;
  const docRows: DocRow[] = (docsResult?.data ?? []) as unknown as DocRow[];

  const handleReceive = async (id: string) => {
    setActionMenu(null);
    try {
      await patchTransfer.mutateAsync({ id, action: "receive" });
      await qc.invalidateQueries({ queryKey: ["equipment-transfers"] });
    } catch {
      /* error toast handled globally via mutation meta */
    }
  };

  const handleCancelTransfer = async (id: string) => {
    setActionMenu(null);
    try {
      await patchTransfer.mutateAsync({ id, action: "cancel" });
      await qc.invalidateQueries({ queryKey: ["equipment-transfers"] });
    } catch {
      /* error toast handled globally via mutation meta */
    }
  };

  const handleDeleteDoc = async (id: string) => {
    setActionMenu(null);
    try {
      await deleteDoc.mutateAsync(id);
    } catch {
      /* error toast handled globally via mutation meta */
    }
  };

  const transferColumns: ColDef<TransferRow>[] = useMemo(
    () => [
      { key: "transferNumber", label: "Transfer #", width: "100px", sortable: false },
      {
        key: "equipment",
        label: "Equipment",
        sortable: false,
        render: (row) =>
          row.equipmentCode || row.equipmentName ? (
            <div>
              <div className="font-medium text-gray-900">
                {row.equipmentCode || row.equipmentName}
              </div>
              {row.equipmentCode && row.equipmentName && (
                <div className="text-xs text-gray-500">{row.equipmentName}</div>
              )}
            </div>
          ) : (
            <span className="text-gray-400">—</span>
          ),
      },
      {
        key: "route",
        label: "From → To",
        sortable: false,
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
      { key: "gatePassNo", label: "Gate Pass", width: "120px", sortable: false },
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
        width: "100px",
        sortable: false,
        render: (row) => (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/equipment/deployment/${row.id}`);
              }}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              title="View"
              aria-label="View"
            >
              <Eye className="w-4 h-4" />
            </button>
            {row.status === "in_transit" && canEdit && (
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
            )}
          </div>
        ),
      },
    ],
    [actionMenu, canEdit, router],
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
      render: (row) =>
        row.fileUrl ? (
          <a
            href={row.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 capitalize font-medium text-accent-600 hover:text-accent-700 hover:underline"
            title="Open document in new tab"
          >
            {row.docType.replace("_", " ")}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
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
            title="Delete"
            aria-label="Delete"
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
            <PrimaryButton onClick={() => setCreateOpen(true)}>
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
                  ? "border-accent-500 text-accent-600"
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
            serverMode
            serverTotal={transfersTotal}
            serverPage={page}
            serverPageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onSearchChange={setSearch}
            onSortChange={(key, dir) => {
              setSortBy(key);
              setSortOrder(dir);
            }}
            historyEntityType="equipment_transfers"
            getHistoryRowLabel={(row) =>
              `${row.transferNumber} · ${row.equipmentCode}`
            }
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

      <TransferDrawer
        open={createOpen && tab === "transfers"}
        onClose={() => setCreateOpen(false)}
        onSaved={async () => {
          await qc.invalidateQueries({ queryKey: ["equipment-transfers"] });
          await qc.invalidateQueries({ queryKey: ["deployment-summary"] });
          setCreateOpen(false);
        }}
      />

      <ComplianceDocumentDrawer
        open={createOpen && tab === "compliance"}
        onClose={() => setCreateOpen(false)}
        onSaved={async () => {
          await qc.invalidateQueries({ queryKey: ["equipment-documents"] });
          await qc.invalidateQueries({ queryKey: ["deployment-summary"] });
          setCreateOpen(false);
        }}
      />
    </>
  );
}
