"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";

const PROJECT_OPTIONS: { value: string; label: string }[] = [];

export default function LabourPage() {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: result, isLoading } = useQuery({
    queryKey: ["hrms-labour"],
    queryFn: () => fetch(`/api/hrms/labour`).then(r => r.json()),
  });

  const data = result?.data ?? [];

  const config = {
    title: "Record Daily Labour",
    subtitle: "Log daily manpower deployment by trade category",
    apiEndpoint: "/api/hrms/labour",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hrms-labour"] }),
    fields: [
      { key: "date", label: "Date", type: "date" as const, required: true },
      { key: "projectId", label: "Project", type: "select" as const, required: true, options: PROJECT_OPTIONS, placeholder: "Select project" },
      { key: "contractor", label: "Contractor", type: "text" as const, required: true, placeholder: "Contractor name" },
      { key: "mason", label: "Mason", type: "number" as const, placeholder: "0" },
      { key: "helperM", label: "Helper (M)", type: "number" as const, placeholder: "0" },
      { key: "helperF", label: "Helper (F)", type: "number" as const, placeholder: "0" },
      { key: "carpenter", label: "Carpenter", type: "number" as const, placeholder: "0" },
      { key: "fitter", label: "Fitter", type: "number" as const, placeholder: "0" },
      { key: "plumber", label: "Plumber", type: "number" as const, placeholder: "0" },
      { key: "electrician", label: "Electrician", type: "number" as const, placeholder: "0" },
      { key: "operator", label: "Operator", type: "number" as const, placeholder: "0" },
    ],
  };

  const columns: ColDef<any>[] = [
    { key: "date", label: "Date", type: "date", sortable: true },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "contractor", label: "Contractor", sortable: true, searchable: true },
    { key: "mason", label: "Mason", type: "number", sortable: true },
    { key: "helperM", label: "Hlpr(M)", type: "number", sortable: true },
    { key: "helperF", label: "Hlpr(F)", type: "number", sortable: true },
    { key: "carpenter", label: "Carp", type: "number", sortable: true },
    { key: "fitter", label: "Fitter", type: "number", sortable: true },
    { key: "plumber", label: "Plumb", type: "number", sortable: true },
    { key: "electrician", label: "Elec", type: "number", sortable: true },
    { key: "operator", label: "Opr", type: "number", sortable: true },
    { key: "total", label: "Total", type: "number", sortable: true },
  ];

  return (
    <>
      <PageHeader
        title="Labour Register"
        subtitle="Daily labour deployment by trade and contractor"
        breadcrumbs={[{ label: "HRMS", href: "/hrms" }, { label: "Labour Register" }]}
      />
      <PageContainer>
        <DataTable
          id="hrms-labour"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="Record Labour"
          defaultSort="date"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
