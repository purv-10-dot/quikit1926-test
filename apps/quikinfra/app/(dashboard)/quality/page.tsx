"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Search, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader, PageContainer, KPICard } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { useProjects } from "@/hooks/use-masters";
import { useMenuActions } from "@/hooks/use-permissions";

interface InspectionRow {
  id?: string; result?: string; category?: string; projectId?: string; projectName?: string;
  [key: string]: unknown;
}

export default function QualityPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { canAdd } = useMenuActions("/quality");

  const { data: chkResult } = useQuery({
    queryKey: ["quality-checklists"],
    queryFn: () => fetch("/api/quality/checklists").then(r => r.json()),
  });

  const { data: inspResult } = useQuery({
    queryKey: ["quality-inspections"],
    queryFn: () => fetch("/api/quality/inspections").then(r => r.json()),
  });

  const { data: projectsData } = useProjects();
  const projects = projectsData?.data ?? [];

  const checklists = chkResult?.data ?? [];
  const inspections = (inspResult?.data ?? []) as InspectionRow[];
  const pendingInspections = inspections.filter((i) => i.result === "Conditional").length;
  const passed = inspections.filter((i) => i.result === "Pass").length;
  const failed = inspections.filter((i) => i.result === "Fail").length;

  const projectOptions = useMemo(
    () => projects.map((p) => ({ value: p.id, label: `${p.code ?? p.id} — ${p.name ?? ""}`.trim() })),
    [projects],
  );

  const combinedCreateConfig = useMemo(() => ({
    title: "New Inspection/Checklist",
    subtitle: "Create checklist and record inspection in one step",
    apiEndpoint: "/api/quality/inspections",
    onSuccess: () => {},
    fields: [
      { key: "projectId", label: "Project", type: "select" as const, required: true, options: projectOptions, placeholder: "Select project", searchable: true },
      { key: "date", label: "Inspection Date", type: "date" as const, required: true },
      { key: "boqItem", label: "BOQ Item / Activity", type: "text" as const, required: true, placeholder: "e.g. RCC M30 — Pier Cap", span: 2 as const },
      { key: "inspector", label: "Inspector", type: "text" as const, required: true, placeholder: "Inspector name" },
      { key: "result", label: "Result", type: "select" as const, required: true, options: [
        { value: "Pass", label: "Pass" },
        { value: "Fail", label: "Fail" },
        { value: "Conditional", label: "Conditional" },
      ], placeholder: "Select result" },
      { key: "remarks", label: "Remarks", type: "textarea" as const, placeholder: "Observations, deviations, corrective actions...", span: 2 as const },

      { key: "checklistName", label: "Checklist Name", type: "text" as const, required: true, placeholder: "e.g. Pre-Pour Concrete Checklist", span: 2 as const },
      { key: "category", label: "Category", type: "select" as const, required: true, options: [
        { value: "Concrete", label: "Concrete" },
        { value: "Steel", label: "Steel" },
        { value: "MEP", label: "MEP" },
        { value: "General", label: "General" },
        { value: "Other", label: "Other" },
      ], placeholder: "Select category" },
      { key: "status", label: "Status", type: "select" as const, options: [{ value: "Active", label: "Active" }, { value: "Draft", label: "Draft" }], placeholder: "Select status" },
    ],
    lineItems: {
      label: "Checklist Items",
      fields: [
        { key: "item", label: "Check Item", type: "text" as const, placeholder: "Inspection point", width: "wide" },
        { key: "acceptanceCriteria", label: "Acceptance Criteria", type: "text" as const, placeholder: "Pass/Fail criteria", width: "wide" },
      ],
    },
  }), [projectOptions]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) {
      map.set(p.id, `${p.code ?? p.id} — ${p.name ?? ""}`.trim());
    }
    return map;
  }, [projects]);

  const columns: ColDef<InspectionRow>[] = useMemo(() => {
    const resultColor = (r: string) => {
      if (r === "Pass") return "bg-green-50 text-green-700";
      if (r === "Fail") return "bg-red-50 text-red-700";
      return "bg-amber-50 text-amber-700";
    };
    return [
      { key: "inspectionNo", label: "Inspection No", sortable: true, searchable: true },
      {
        key: "projectId",
        label: "Project",
        sortable: true,
        searchable: true,
        render: (row) => projectNameById.get(row.projectId ?? "") ?? row.projectName ?? "—",
      },
      { key: "boqItem", label: "BOQ Item", sortable: true, searchable: true },
      { key: "checklistName", label: "Checklist Name", sortable: true, searchable: true },
      {
        key: "category",
        label: "Category",
        type: "select",
        options: ["Concrete", "Steel", "MEP", "General", "Other"],
        sortable: true,
        render: (row) => (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700">
            {row.category ?? "—"}
          </span>
        ),
      },
      { key: "inspector", label: "Inspector", sortable: true },
      { key: "date", label: "Date", type: "date", sortable: true },
      {
        key: "result", label: "Result", type: "select",
        options: ["Pass", "Fail", "Conditional"],
        sortable: true,
        render: (row) => (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${resultColor(row.result ?? "")}`}>{row.result}</span>
        ),
      },
      { key: "remarks", label: "Remarks", searchable: true },
    ];
  }, [projectNameById]);

  return (
    <>
      <PageHeader
        title="Inspection/Checklist"
        subtitle="Single workflow for checklist + inspection tracking"
      />
      <PageContainer>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Total Checklists" value={checklists.length}
            icon={<ClipboardCheck className="w-5 h-5" />} color="blue" />
          <KPICard title="Pending Inspections" value={pendingInspections}
            icon={<Search className="w-5 h-5" />} color="amber" />
          <KPICard title="Passed" value={passed}
            icon={<CheckCircle2 className="w-5 h-5" />} color="green" />
          <KPICard title="Failed" value={failed}
            icon={<XCircle className="w-5 h-5" />} color="red" />
        </div>

        <div className="mt-6">
          <DataTable
            id="inspection-checklist"
            columns={columns}
            data={inspections}
            onAdd={canAdd ? () => setDrawerOpen(true) : undefined}
            addLabel="New Inspection/Checklist"
          />
        </div>
      </PageContainer>

      <QuickCreateDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        config={combinedCreateConfig}
      />
    </>
  );
}
