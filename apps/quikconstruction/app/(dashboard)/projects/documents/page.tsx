"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageContainer, StatusChip } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";

const PROJECT_OPTIONS: { value: string; label: string }[] = [];

const CATEGORY_OPTIONS = [
  { value: "Drawing", label: "Drawing" },
  { value: "Contract", label: "Contract" },
  { value: "NOC", label: "NOC" },
  { value: "RERA", label: "RERA" },
  { value: "Environmental", label: "Environmental" },
  { value: "Inspection", label: "Inspection" },
];

export default function DocumentsPage() {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: result, isLoading } = useQuery({
    queryKey: ["projects-documents"],
    queryFn: () => fetch(`/api/projects/documents`).then(r => r.json()),
  });

  const data = result?.data ?? [];

  const config = {
    title: "Upload Document",
    subtitle: "Add a project document to the register",
    apiEndpoint: "/api/projects/documents",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects-documents"] }),
    fields: [
      { key: "file", label: "File", type: "file" as const, required: true, accept: ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.dwg,.dxf", span: 2 as const },
      { key: "documentName", label: "Document Name", type: "text" as const, required: true, placeholder: "e.g. Structural Drawing — Pier P1", span: 2 as const },
      { key: "category", label: "Category", type: "select" as const, required: true, options: CATEGORY_OPTIONS, placeholder: "Select category" },
      { key: "projectId", label: "Project", type: "select" as const, required: true, options: PROJECT_OPTIONS, placeholder: "Select project" },
      { key: "version", label: "Version", type: "text" as const, placeholder: "Rev 1 / V1.0" },
      { key: "uploadedBy", label: "Uploaded By", type: "text" as const, placeholder: "Name" },
      { key: "remarks", label: "Remarks", type: "textarea" as const, placeholder: "Notes about this document...", span: 2 as const },
    ],
  };

  const categoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      Drawing: "bg-blue-50 text-blue-700",
      Contract: "bg-purple-50 text-purple-700",
      NOC: "bg-green-50 text-green-700",
      RERA: "bg-orange-50 text-orange-700",
      Environmental: "bg-teal-50 text-teal-700",
      Inspection: "bg-amber-50 text-amber-700",
    };
    return colors[cat] ?? "bg-gray-50 text-gray-700";
  };

  const columns: ColDef<any>[] = [
    { key: "documentName", label: "Document Name", sortable: true, searchable: true },
    {
      key: "category", label: "Category", type: "select",
      options: ["Drawing", "Contract", "NOC", "RERA", "Environmental", "Inspection"],
      sortable: true,
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${categoryColor(row.category)}`}>{row.category}</span>
      ),
    },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "version", label: "Version" },
    { key: "uploadedBy", label: "Uploaded By", sortable: true },
    { key: "uploadDate", label: "Upload Date", type: "date", sortable: true },
    {
      key: "status", label: "Status", type: "select",
      options: ["draft", "active", "approved"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Document Management"
        subtitle="Project drawings, contracts, NOCs, and regulatory documents"
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "Documents" }]}
      />
      <PageContainer>
        <DataTable
          id="projects-documents"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="Upload Document"
          defaultSort="uploadDate"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
