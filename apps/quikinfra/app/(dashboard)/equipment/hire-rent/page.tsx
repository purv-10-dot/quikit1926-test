"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  List,
  ArrowDownRight,
  ArrowUpRight,
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
  useHireRates,
  useHireInVerifications,
  useRentOutBills,
  useHireRentSummary,
  usePatchRentOutBill,
} from "@/hooks/use-equipment";
import { useMenuActions, usePermissions } from "@/hooks/use-permissions";
import type {
  HireInVerificationRecord,
  HireRateRecord,
  RentOutBillRecord,
} from "@/lib/equipment/equipment-types";
import { HireRateDrawer } from "./rates/new/HireRateDrawer";
import { HireInDrawer } from "./hire-in/new/HireInDrawer";
import { RentOutDrawer } from "./rent-out/new/RentOutDrawer";

type TabKey = "rates" | "hire-in" | "rent-out";

function formatCurrency(n: number | null | undefined) {
  return `₹${(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function directionLabel(direction: string) {
  return direction === "hire_in" ? "Hire-In" : "Rent-Out";
}

function basisLabel(basis: string) {
  switch (basis) {
    case "day":
      return "day";
    case "month":
      return "month";
    default:
      return "hour";
  }
}

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Pending Approval",
  submitted: "Pending Approval",
  computed: "Computed",
};

export default function HireRentPage() {
  const router = useRouter();
  const { canAdd, canEdit } = useMenuActions("/equipment/hire-rent");
  const { isSuper } = usePermissions();
  const [tab, setTab] = useState<TabKey>("rates");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: summary } = useHireRentSummary();
  const { data: ratesResult, isLoading: ratesLoading } = useHireRates();
  const { data: verificationsResult, isLoading: verificationsLoading } =
    useHireInVerifications();
  const { data: billsResult, isLoading: billsLoading } = useRentOutBills();

  const patchBill = usePatchRentOutBill();

  const rates = ratesResult?.data ?? [];
  const verifications = verificationsResult?.data ?? [];
  const bills = billsResult?.data ?? [];

  const rateColumns: ColDef<HireRateRecord>[] = [
    {
      key: "direction",
      label: "Direction",
      width: "110px",
      render: (row) => (
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
            row.direction === "hire_in"
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {directionLabel(row.direction)}
        </span>
      ),
    },
    { key: "scopeLabel", label: "Scope", render: (row) => row.scopeLabel },
    {
      key: "rateBasis",
      label: "Basis",
      width: "80px",
      render: (row) => basisLabel(row.rateBasis),
    },
    {
      key: "rate",
      label: "Rate",
      width: "100px",
      render: (row) => (
        <span className="tabular-nums">{formatCurrency(row.rate)}</span>
      ),
    },
    { key: "sacCode", label: "SAC", width: "90px", render: (row) => row.sacCode ?? "—" },
    {
      key: "minGuaranteedQty",
      label: "Min Qty",
      width: "80px",
      render: (row) => row.minGuaranteedQty ?? "—",
    },
    {
      key: "gstPercent",
      label: "GST %",
      width: "70px",
      render: (row) => `${row.gstPercent}`,
    },
  ];

  const verificationColumns: ColDef<HireInVerificationRecord>[] = [
    { key: "verificationNumber", label: "Verif #", width: "100px" },
    {
      key: "equipment",
      label: "Equipment",
      render: (row) =>
        row.equipmentCode || row.equipmentName ? (
          <div>
            <div className="font-medium">{row.equipmentCode || row.equipmentName}</div>
            {row.equipmentCode && row.equipmentName && (
              <div className="text-xs text-gray-500">{row.equipmentName}</div>
            )}
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: "period",
      label: "Period",
      width: "180px",
      render: (row) => `${row.periodFrom} → ${row.periodTo}`,
    },
    {
      key: "loggedQty",
      label: "Logged",
      width: "70px",
      render: (row) => row.loggedQty ?? "—",
    },
    {
      key: "vendorClaimedQty",
      label: "Claimed",
      width: "70px",
      render: (row) => row.vendorClaimedQty ?? "—",
    },
    {
      key: "varianceQty",
      label: "Variance",
      width: "80px",
      render: (row) =>
        row.varianceQty != null ? (
          <span
            className={`tabular-nums ${
              row.varianceQty > 0 ? "text-red-600 font-medium" : ""
            }`}
          >
            {row.varianceQty}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "payableAmount",
      label: "Payable",
      width: "100px",
      render: (row) => formatCurrency(row.payableAmount),
    },
    {
      key: "totalAmount",
      label: "Total",
      width: "100px",
      render: (row) => formatCurrency(row.totalAmount),
    },
    {
      key: "status",
      label: "Status",
      width: "130px",
      render: (row) => (
        <StatusChip status={row.status} label={STATUS_LABEL[row.status] ?? undefined} />
      ),
    },
    {
      key: "actions",
      label: "Action",
      width: "90px",
      render: (row) => (
        <button
          type="button"
          className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/equipment/hire-rent/verification/${row.id}`);
          }}
        >
          View
        </button>
      ),
    },
  ];

  const billColumns: ColDef<RentOutBillRecord>[] = [
    { key: "billNumber", label: "Bill #", width: "110px" },
    {
      key: "equipment",
      label: "Equipment",
      render: (row) =>
        row.equipmentCode || row.equipmentName ? (
          <div>
            <div className="font-medium">{row.equipmentCode || row.equipmentName}</div>
            {row.equipmentCode && row.equipmentName && (
              <div className="text-xs text-gray-500">{row.equipmentName}</div>
            )}
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: "customerName",
      label: "Customer",
      render: (row) => row.customerName ?? "—",
    },
    {
      key: "period",
      label: "Period",
      width: "180px",
      render: (row) => `${row.periodFrom} — ${row.periodTo}`,
    },
    {
      key: "billableQty",
      label: "Qty",
      width: "60px",
      render: (row) => row.billableQty ?? "—",
    },
    {
      key: "amount",
      label: "Amount",
      width: "100px",
      render: (row) => formatCurrency(row.amount),
    },
    {
      key: "gstAmount",
      label: "GST",
      width: "120px",
      render: (row) =>
        row.gstAmount != null ? `${formatCurrency(row.gstAmount)} CGST+SGST` : "—",
    },
    {
      key: "totalAmount",
      label: "Total",
      width: "100px",
      render: (row) => formatCurrency(row.totalAmount),
    },
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
      render: (row) =>
        row.status !== "approved" && (isSuper || canEdit) ? (
          <button
            type="button"
            className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
            onClick={(e) => {
              e.stopPropagation();
              void patchBill.mutateAsync({ id: row.id, action: "approve" });
            }}
          >
            Approve
          </button>
        ) : (
          "—"
        ),
    },
  ];

  const primaryAction =
    tab === "rates"
      ? { label: "Add Hire Rate", href: "/equipment/hire-rent/rates/new" }
      : tab === "hire-in"
        ? { label: "New Verification", href: "/equipment/hire-rent/hire-in/new" }
        : { label: "New Rent-Out Bill", href: "/equipment/hire-rent/rent-out/new" };

  return (
    <>
      <PageHeader
        title="Hire & Rent"
        subtitle="Hire-rate master · hire-in verification · rent-out billing (GST)"
        breadcrumbs={[
          { label: "Plant & Machinery", href: "/equipment/hire-rent" },
          { label: "Hire & Rent" },
        ]}
        actions={
          (canAdd || isSuper) ? (
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {primaryAction.label}
            </PrimaryButton>
          ) : undefined
        }
      />

      <PageContainer>
        <div className="mb-4 flex gap-4 border-b border-slate-200">
          {(
            [
              { key: "rates", label: "Hire Rates" },
              { key: "hire-in", label: "Hire-In Verification" },
              { key: "rent-out", label: "Rent-Out Bills" },
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

        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <KPICard
            title="HIRE RATES"
            value={summary?.hireRates ?? 0}
            icon={<List className="h-5 w-5" />}
            color="brand"
          />
          <KPICard
            title="HIRE-IN PAYABLE"
            value={formatCurrency(summary?.hireInPayable)}
            icon={<ArrowDownRight className="h-5 w-5" />}
            color="amber"
          />
          <KPICard
            title="RENT-OUT REVENUE"
            value={formatCurrency(summary?.rentOutRevenue)}
            icon={<ArrowUpRight className="h-5 w-5" />}
            color="success"
          />
          <KPICard
            title="RENT BILLS"
            value={summary?.rentBills ?? 0}
            icon={<IndianRupee className="h-5 w-5" />}
            color="info"
          />
        </div>

        {tab === "rates" && (
          <DataTable
            id="hire-rates"
            columns={rateColumns as unknown as ColDef<Record<string, unknown>>[]}
            data={rates as unknown as Record<string, unknown>[]}
            loading={ratesLoading}
            fitToContent
            emptyTitle="No hire rates yet"
            emptyHint="Add a hire-in or rent-out rate card for machinery billing."
          />
        )}

        {tab === "hire-in" && (
          <DataTable
            id="hire-in-verifications"
            columns={verificationColumns as unknown as ColDef<Record<string, unknown>>[]}
            data={verifications as unknown as Record<string, unknown>[]}
            loading={verificationsLoading}
            fitToContent
            emptyTitle="No hire-in verifications"
            emptyHint="Create a verification sheet to compare logged vs vendor-claimed qty."
          />
        )}

        {tab === "rent-out" && (
          <DataTable
            id="rent-out-bills"
            columns={billColumns as unknown as ColDef<Record<string, unknown>>[]}
            data={bills as unknown as Record<string, unknown>[]}
            loading={billsLoading}
            fitToContent
            emptyTitle="No rent-out bills"
            emptyHint="Generate a rent-out bill from approved equipment logs."
          />
        )}
      </PageContainer>

      <HireRateDrawer
        open={createOpen && tab === "rates"}
        onClose={() => setCreateOpen(false)}
        onSaved={() => setCreateOpen(false)}
      />
      <HireInDrawer
        open={createOpen && tab === "hire-in"}
        onClose={() => setCreateOpen(false)}
        onSaved={() => setCreateOpen(false)}
      />
      <RentOutDrawer
        open={createOpen && tab === "rent-out"}
        onClose={() => setCreateOpen(false)}
        onSaved={() => setCreateOpen(false)}
      />
    </>
  );
}
