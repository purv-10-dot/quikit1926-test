"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageContainer, StatusChip } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";

const CATEGORY_OPTIONS = [
  { value: "Concrete", label: "Concrete" },
  { value: "Steel", label: "Steel" },
  { value: "MEP", label: "MEP" },
  { value: "General", label: "General" },
];

export default function ChecklistsPage() {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: result, isLoading } = useQuery({
    queryKey: ["quality-checklists"],
    queryFn: () => fetch(`/api/quality/checklists`).then(r => r.json()),
  });

  const data = result?.data ?? [];

  const config = {
    title: "New Checklist Template",
    subtitle: "Create a quality checklist for site activities",
    apiEndpoint: "/api/quality/checklists",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quality-checklists"] }),
    fields: [
      { key: "name", label: "Checklist Name", type: "text" as const, required: true, placeholder: "e.g. Pre-Pour Concrete Checklist", span: 2 as const },
      { key: "category", label: "Category", type: "select" as const, required: true, options: CATEGORY_OPTIONS, placeholder: "Select category" },
      { key: "status", label: "Status", type: "select" as const, options: [{ value: "Active", label: "Active" }, { value: "Draft", label: "Draft" }], placeholder: "Select status" },
    ],
    lineItems: {
      label: "Checklist Items",
      fields: [
        { key: "item", label: "Check Item", type: "text" as const, placeholder: "Inspection point", width: "wide" },
        { key: "acceptanceCriteria", label: "Acceptance Criteria", type: "text" as const, placeholder: "Pass/Fail criteria", width: "wide" },
      ],
    },
  };

  const columns: ColDef<any>[] = [
    { key: "name", label: "Name", sortable: true, searchable: true },
    {
      key: "category", label: "Category", type: "select",
      options: ["Concrete", "Steel", "MEP", "General"],
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{row.category}</span>
      ),
    },
    {
      key: "itemsCount", label: "Items", type: "number", sortable: true,
      render: (row) => `${row.itemsCount ?? 0} items`,
    },
    { key: "createdDate", label: "Created Date", type: "date", sortable: true },
    {
      key: "status", label: "Status", type: "select",
      options: ["Active", "Draft"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Quality Checklists"
        subtitle="Templates for site quality inspections"
        breadcrumbs={[{ label: "Quality", href: "/quality" }, { label: "Checklists" }]}
      />
      <PageContainer>
        <DataTable
          id="quality-checklists"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="New Checklist"
          defaultSort="createdDate"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
