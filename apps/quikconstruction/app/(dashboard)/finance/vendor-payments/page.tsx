"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "Pending", label: "Pending" },
  { key: "Approved", label: "Approved" },
  { key: "Paid", label: "Paid" },
];

const VENDOR_OPTIONS: { value: string; label: string }[] = [];

const TDS_OPTIONS = [
  { value: "194C-1%", label: "194C — Individual/HUF (1%)" },
  { value: "194C-2%", label: "194C — Others (2%)" },
  { value: "194J-10%", label: "194J — Professional/Technical (10%)" },
  { value: "194I-10%", label: "194I — Rent on Plant/Machinery (10%)" },
];

const PAYMENT_MODE_OPTIONS = [
  { value: "NEFT", label: "NEFT" },
  { value: "RTGS", label: "RTGS" },
  { value: "Cheque", label: "Cheque" },
];

const BANK_OPTIONS: { value: string; label: string }[] = [];

export default function VendorPaymentsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: result, isLoading } = useQuery({
    queryKey: ["finance-vendor-payments"],
    queryFn: () => fetch(`/api/finance/vendor-payments`).then(r => r.json()),
  });

  // Route returns the standard envelope { ok, data: { data: [...], total } },
  // so the rows live two levels deep. Fall back gracefully if the shape ever
  // changes back to an unwrapped array.
  const allData: any[] = Array.isArray(result?.data)
    ? result.data
    : Array.isArray(result?.data?.data)
      ? result.data.data
      : [];
  const data = activeTab === "all" ? allData : allData.filter((r: any) => r.status === activeTab);

  const config = {
    title: "New Vendor Payment",
    subtitle: "Record a vendor invoice and payment",
    apiEndpoint: "/api/finance/vendor-payments",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance-vendor-payments"] }),
    fields: [
      { key: "vendor", label: "Vendor", type: "select" as const, required: true, options: VENDOR_OPTIONS, placeholder: "Select vendor" },
      { key: "poRef", label: "PO / WO Reference", type: "text" as const, placeholder: "PO-2026-XXX" },
      { key: "invoiceNo", label: "Invoice No", type: "text" as const, required: true, placeholder: "Vendor invoice number" },
      { key: "invoiceAmount", label: "Invoice Amount", type: "number" as const, required: true, placeholder: "0" },
      { key: "tdsSection", label: "TDS Section", type: "select" as const, options: TDS_OPTIONS, placeholder: "Select TDS code" },
      { key: "paymentMode", label: "Payment Mode", type: "select" as const, options: PAYMENT_MODE_OPTIONS, placeholder: "Select mode" },
      { key: "bank", label: "Bank", type: "select" as const, options: BANK_OPTIONS, placeholder: "Select bank" },
      { key: "status", label: "Status", type: "select" as const, options: [{ value: "Pending", label: "Pending" }, { value: "Approved", label: "Approved" }], placeholder: "Select status" },
    ],
  };

  const columns: ColDef<any>[] = [
    { key: "paymentNo", label: "Payment No", sortable: true, searchable: true },
    { key: "vendor", label: "Vendor", sortable: true, searchable: true },
    { key: "poRef", label: "PO Ref", searchable: true },
    { key: "invoiceNo", label: "Invoice No", searchable: true },
    {
      key: "invoiceAmount", label: "Invoice Amt", type: "number", sortable: true,
      render: (row) => row.invoiceAmount ? `₹ ${Number(row.invoiceAmount).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "tdsDeducted", label: "TDS", type: "number",
      render: (row) => row.tdsDeducted ? `₹ ${Number(row.tdsDeducted).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "netPayable", label: "Net Payable", type: "number", sortable: true,
      render: (row) => row.netPayable ? `₹ ${Number(row.netPayable).toLocaleString("en-IN")}` : "—",
    },
    { key: "paymentDate", label: "Pay Date", type: "date", sortable: true, render: (row) => row.paymentDate || "—" },
    {
      key: "status", label: "Status", type: "select",
      options: ["Pending", "Approved", "Paid"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
    { key: "utrNo", label: "UTR No", render: (row) => row.utrNo || "—" },
  ];

  return (
    <>
      <PageHeader
        title="Vendor Payments"
        subtitle="Invoice tracking, TDS deduction, and payment processing"
        breadcrumbs={[{ label: "Finance", href: "/finance" }, { label: "Vendor Payments" }]}
      />
      <TabBar tabs={STATUS_TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer>
        <DataTable
          id="finance-vendor-payments"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="New Payment"
          defaultSort="paymentDate"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
