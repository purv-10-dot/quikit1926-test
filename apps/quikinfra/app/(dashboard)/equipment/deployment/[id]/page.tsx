"use client";

/**
 * Equipment Transfer — detail page.
 *
 * Mirrors the equipment log-book / maintenance detail pages: PageHeader with
 * breadcrumbs + status + actions, grouped info cards (Transfer Details /
 * Remarks), and an Audit sidebar. In-transit transfers expose
 * Receive / Cancel actions (same as the list row menu).
 */

import { useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  PageHeader,
  PageContainer,
  StatusChip,
  PrimaryButton,
  PageSkeleton,
} from "@/components/PageShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatDateTimeIST } from "@/lib/format/datetime";
import { useEquipmentTransfer, usePatchTransfer } from "@/hooks/use-equipment";
import { useUsers } from "@/hooks/use-users";
import { toErrorMessage } from "@/lib/api/errors";

export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: transfer, isLoading } = useEquipmentTransfer(id);
  const { data: usersData } = useUsers();
  const patchMutation = usePatchTransfer();

  const [action, setAction] = useState<"receive" | "cancel" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of usersData?.data ?? []) {
      map.set(u.id, u.fullName?.trim() || u.email || u.id);
    }
    return map;
  }, [usersData]);
  const userName = (uid: string | null | undefined) =>
    uid ? (nameById.get(uid) ?? uid) : "—";

  if (isLoading) return <PageSkeleton />;
  if (!transfer) {
    return (
      <PageContainer>
        <p className="text-gray-500 py-12 text-center">Transfer not found</p>
      </PageContainer>
    );
  }

  const dash = (v: unknown) =>
    v === null || v === undefined || v === "" ? "—" : String(v);
  const isInTransit = transfer.status === "in_transit";

  const runAction = async () => {
    if (!action) return;
    setActionError(null);
    try {
      await patchMutation.mutateAsync({ id, action });
      setAction(null);
    } catch (err: unknown) {
      setActionError(toErrorMessage(err, "Action failed"));
    }
  };

  return (
    <>
      <PageHeader
        title={transfer.transferNumber}
        subtitle={`Equipment Transfer — ${transfer.equipmentCode} · ${transfer.equipmentName}`}
        breadcrumbs={[
          { label: "Plant & Machinery", href: "/equipment/deployment" },
          { label: "Deployment", href: "/equipment/deployment" },
          { label: transfer.transferNumber },
        ]}
        onBack={() => router.push("/equipment/deployment")}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip status={transfer.status} />
            {isInTransit && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null);
                    setAction("cancel");
                  }}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-gray-200 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <XCircle className="w-4 h-4" /> Cancel
                </button>
                <PrimaryButton
                  onClick={() => {
                    setActionError(null);
                    setAction("receive");
                  }}
                >
                  <CheckCircle2 className="w-4 h-4" /> Receive
                </PrimaryButton>
              </>
            )}
          </div>
        }
      />

      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card title="Transfer Details">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoField label="Transfer #" value={transfer.transferNumber} />
                <InfoField
                  label="Equipment"
                  value={`${transfer.equipmentCode} — ${transfer.equipmentName}`}
                />
                <InfoField label="From" value={dash(transfer.sourceProjectName)} />
                <InfoField label="To" value={transfer.destinationProjectName} />
                <InfoField
                  label="Type"
                  value={<span className="capitalize">{transfer.transferType}</span>}
                />
                <InfoField label="Transfer Date" value={transfer.transferDate} />
                {transfer.transferType === "returnable" && (
                  <InfoField
                    label="Returnable Until"
                    value={dash(transfer.returnableTo)}
                  />
                )}
                <InfoField label="Gate Pass" value={dash(transfer.gatePassNo)} />
                <InfoField label="Status" value={<StatusChip status={transfer.status} />} />
                <InfoField label="Reason" value={dash(transfer.reason)} span={4} />
              </div>
            </Card>

            {transfer.remarks && (
              <Card title="Remarks">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {transfer.remarks}
                </p>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Audit</h3>
              <div className="space-y-3">
                <InfoField
                  label="Created"
                  value={formatDateTimeIST(transfer.createdAt)}
                />
                <InfoField label="Created By" value={userName(transfer.createdBy)} />
                <InfoField
                  label="Updated"
                  value={formatDateTimeIST(transfer.updatedAt)}
                />
                <InfoField label="Updated By" value={userName(transfer.updatedBy)} />
              </div>
            </div>
          </div>
        </div>
      </PageContainer>

      <ConfirmDialog
        open={action !== null}
        onClose={() => {
          if (!patchMutation.isPending) {
            setAction(null);
            setActionError(null);
          }
        }}
        onConfirm={runAction}
        title={action === "cancel" ? "Cancel Transfer" : "Receive Transfer"}
        confirmLabel={action === "cancel" ? "Cancel Transfer" : "Receive"}
        tone={action === "cancel" ? "danger" : "primary"}
        loading={patchMutation.isPending}
        message={
          <>
            {action === "cancel" ? (
              <>
                Cancel transfer{" "}
                <span className="font-semibold text-gray-900">
                  {transfer.transferNumber}
                </span>
                ? The machine stays at its current project.
              </>
            ) : (
              <>
                Acknowledge receipt of{" "}
                <span className="font-semibold text-gray-900">
                  {transfer.transferNumber}
                </span>{" "}
                at {transfer.destinationProjectName}? The machine&apos;s project
                will be updated.
              </>
            )}
            {actionError && (
              <span className="mt-3 block rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {actionError}
              </span>
            )}
          </>
        }
      />
    </>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <span className="inline-block w-1 h-3.5 bg-orange-500 rounded-sm" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoField({
  label,
  value,
  highlight,
  span,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
  span?: number;
}) {
  return (
    <div className={span === 4 ? "col-span-2 md:col-span-4" : ""}>
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      <div
        className={`text-sm mt-0.5 ${highlight ? "font-bold text-gray-900" : "text-gray-700"}`}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}
