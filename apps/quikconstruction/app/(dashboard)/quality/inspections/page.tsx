"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";

const RESULT_TABS = [
  { key: "all", label: "All" },
  { key: "Pass", label: "Pass" },
  { key: "Fail", label: "Fail" },
  { key: "Conditional", label: "Conditional" },
];

const PROJECT_OPTIONS: { value: string; label: string }[] = [];
const CHECKLIST_OPTIONS: { value: string; label: string }[] = [];

const RESULT_OPTIONS = [
  { value: "Pass", label: "Pass" },
  { value: "Fail", label: "Fail" },
  { value: "Conditional", label: "Conditional" },
];

export default function InspectionsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: result, isLoading } = useQuery({
    queryKey: ["quality-inspections"],
    queryFn: () => fetch(`/api/quality/inspections`).then(r => r.json()),
  });

  const allData = result?.data ?? [];
  const data = activeTab === "all" ? allData : allData.filter((r: any) => r.result === activeTab);

  const config = {
    title: "New Inspection",
    subtitle: "Record a quality inspection result",
    apiEndpoint: "/api/quality/inspections",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quality-inspections"] }),
    fields: [
      { key: "projectId", label: "Project", type: "select" as const, required: true, options: PROJECT_OPTIONS, placeholder: "Select project" },
      { key: "date", label: "Inspection Date", type: "date" as const, required: true },
      { key: "boqItem", label: "BOQ Item / Activity", type: "text" as const, required: true, placeholder: "e.g. RCC M30 — Pier Cap", span: 2 as const },
      { key: "checklistUsed", label: "Checklist Used", type: "select" as const, required: true, options: CHECKLIST_OPTIONS, placeholder: "Select checklist" },
      { key: "inspector", label: "Inspector", type: "text" as const, required: true, placeholder: "Inspector name" },
      { key: "result", label: "Result", type: "select" as const, required: true, options: RESULT_OPTIONS, placeholder: "Select result" },
      { key: "remarks", label: "Remarks", type: "textarea" as const, placeholder: "Observations, deviations, corrective actions...", span: 2 as const },
    ],
  };

  const resultColor = (r: string) => {
    if (r === "Pass") return "bg-green-50 text-green-700";
    if (r === "Fail") return "bg-red-50 text-red-700";
    return "bg-amber-50 text-amber-700";
  };

  const columns: ColDef<any>[] = [
    { key: "inspectionNo", label: "Inspection No", sortable: true, searchable: true },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "boqItem", label: "BOQ Item", sortable: true, searchable: true },
    { key: "checklistUsed", label: "Checklist" },
    { key: "inspector", label: "Inspector", sortable: true },
    { key: "date", label: "Date", type: "date", sortable: true },
    {
      key: "result", label: "Result", type: "select",
      options: ["Pass", "Fail", "Conditional"],
      sortable: true,
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${resultColor(row.result)}`}>{row.result}</span>
      ),
    },
    { key: "remarks", label: "Remarks", searchable: true },
  ];

  return (
    <>
      <PageHeader
        title="Quality Inspections"
        subtitle="Inspection records linked to BOQ items and work orders"
        breadcrumbs={[{ label: "Quality", href: "/quality" }, { label: "Inspections" }]}
      />
      <TabBar tabs={RESULT_TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer>
        <DataTable
          id="quality-inspections"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="New Inspection"
          defaultSort="date"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
