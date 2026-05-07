"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { useProjects } from "@/hooks/use-masters";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "Active", label: "Active" },
  { key: "Resolved", label: "Resolved" },
];

const CATEGORY_OPTIONS = [
  { value: "Rain", label: "Rain" },
  { value: "Material Shortage", label: "Material Shortage" },
  { value: "Drawing Revision", label: "Drawing Revision" },
  { value: "Labour Strike", label: "Labour Strike" },
  { value: "Govt Order", label: "Govt Order" },
];

export default function HindrancePage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: result, isLoading } = useQuery({
    queryKey: ["projects-hindrance"],
    queryFn: () => fetch(`/api/projects/hindrance`).then(r => r.json()),
  });

  const { data: projectsData } = useProjects();
  const projectOptions = (projectsData?.data ?? []).map((p: any) => ({ value: p.id, label: p.name }));

  const allData = result?.data ?? [];
  const data = activeTab === "all" ? allData : allData.filter((r: any) => r.status === activeTab);

  const config = {
    title: "Report Hindrance",
    subtitle: "Log a delay or obstruction affecting project progress",
    apiEndpoint: "/api/projects/hindrance",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects-hindrance"] }),
    fields: [
      { key: "projectId", label: "Project", type: "select" as const, required: true, options: projectOptions, placeholder: "Select project", searchable: true },
      { key: "category", label: "Category", type: "select" as const, required: true, options: CATEGORY_OPTIONS, placeholder: "Select category" },
      {
        key: "dateFrom",
        label: "Date From",
        type: "date" as const,
        required: true,
        // When the start date moves forward past the current end date,
        // wipe the end so the user has to re-pick — prevents stale
        // invalid ranges sneaking through to submit.
        onChange: (v: string, formData: Record<string, string>) => {
          if (formData.dateTo && v && formData.dateTo < v) {
            return { dateTo: "" };
          }
        },
      },
      {
        key: "dateTo",
        label: "Date To",
        type: "date" as const,
        placeholder: "Leave blank if ongoing",
        min: (f: Record<string, string>) => f.dateFrom || undefined,
      },
      { key: "daysLost", label: "Days Lost", type: "number" as const, required: true, placeholder: "0" },
      { key: "status", label: "Status", type: "select" as const, required: true, options: [{ value: "Active", label: "Active" }, { value: "Resolved", label: "Resolved" }], placeholder: "Select status" },
      { key: "description", label: "Description", type: "textarea" as const, required: true, placeholder: "Describe the hindrance...", span: 2 as const },
      { key: "impactOnCriticalPath", label: "Impact on Critical Path", type: "text" as const, placeholder: "Yes/No and details", span: 2 as const },
    ],
  };

  const columns: ColDef<any>[] = [
    { key: "hindranceNo", label: "Hindrance No", sortable: true, searchable: true },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "dateFrom", label: "Date From", type: "date", sortable: true },
    { key: "dateTo", label: "Date To", type: "date", render: (row) => row.dateTo || "Ongoing" },
    { key: "daysLost", label: "Days Lost", type: "number", sortable: true },
    {
      key: "category", label: "Category", type: "select",
      options: ["Rain", "Material Shortage", "Drawing Revision", "Labour Strike", "Govt Order"],
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">{row.category}</span>
      ),
    },
    { key: "description", label: "Description", searchable: true },
    {
      key: "status", label: "Status", type: "select",
      options: ["Active", "Resolved"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Hindrance Register"
        subtitle="Track delays, obstructions, and their impact on project timeline"
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "Hindrance Register" }]}
      />
      <TabBar tabs={STATUS_TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer>
        <DataTable
          id="projects-hindrance"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="Report Hindrance"
          defaultSort="dateFrom"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
