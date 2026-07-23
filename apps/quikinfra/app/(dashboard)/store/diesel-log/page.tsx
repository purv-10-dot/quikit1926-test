"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { useDieselLogs } from "@/hooks/use-store";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { useProjects, useMachinery } from "@/hooks/use-masters";
import { useMenuActions } from "@/hooks/use-permissions";
import { useQueryClient } from "@tanstack/react-query";

interface DieselLogRow {
  id: string; logDate?: string; machineryName?: string; projectName?: string;
  openingReading?: number | string; closingReading?: number | string;
  quantityIssued?: number | string; unitRate?: number | string;
  totalCost?: number | string; operatorName?: string;
  [key: string]: unknown;
}

export default function DieselLogPage() {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { canAdd } = useMenuActions("/store/diesel-log");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("logDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setPage(1);
  }, [search, sortBy, sortOrder, pageSize]);

  const { data: result, isLoading } = useDieselLogs({
    search: search || undefined,
    page,
    pageSize,
    sortBy,
    sortOrder,
  });
  const data = result?.data ?? [];
  const total = result?.total ?? 0;

  const { data: projectsData } = useProjects();
  const { data: machineryData } = useMachinery();

  const projects = (projectsData?.data ?? []) as { id: string; name?: string; city?: string }[];
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name ?? "" }));
  const projectById = useMemo(() => {
    const m = new Map<string, { id: string; name?: string; city?: string }>();
    for (const p of projects) {
      if (p?.id) m.set(p.id, p);
    }
    return m;
  }, [projects]);
  const machineryOptions = (machineryData?.data ?? []).filter((m) => m?.status === "active").map((m) => ({ value: m.id, label: m.name }));
  const machineryById = useMemo(() => {
    const m = new Map<string, { id: string; name?: string; fuelType?: string }>();
    for (const row of (machineryData?.data ?? []) as { id: string; name?: string; fuelType?: string }[]) {
      if (row?.id) m.set(row.id, row);
    }
    return m;
  }, [machineryData]);

  const fuelMeta = (machineryId: string | undefined | null): { fuelType: string; unitLabel: string } => {
    const row = machineryId ? machineryById.get(machineryId) : null;
    const fuelType = String(row?.fuelType ?? "").trim() || "N/A";
    const ft = fuelType.toLowerCase();
    const unitLabel =
      ft === "diesel" || ft === "petrol"
        ? "Litres"
        : ft === "electric"
          ? "kWh"
          : "Units";
    return { fuelType, unitLabel };
  };

  const config = {
    title: "New Diesel Log Entry",
    subtitle: "Record fuel consumption for a machine",
    apiEndpoint: "/api/store/diesel-logs",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["diesel-logs"] }),
    fields: [
      {
        key: "projectId",
        label: "Project",
        type: "select" as const,
        required: true,
        options: projectOptions,
        placeholder: "Select project",
        onChange: (value: string) => {
          const p = projectById.get(value);
          const city = String(p?.city ?? "").trim();
          return { locationId: city };
        },
      },
      {
        key: "locationId",
        label: "Location",
        type: "select" as const,
        disabled: (fd: Record<string, unknown>) => !String(fd.projectId ?? "").trim(),
        options: (fd: Record<string, unknown>) => {
          const pid = String(fd.projectId ?? "").trim();
          if (!pid) return [];
          const p = projectById.get(pid);
          const city = String(p?.city ?? "").trim();
          if (!city) return [];
          return [{ value: city, label: city }];
        },
        placeholder: "No city on project",
        requiredIf: (fd: Record<string, unknown>) => {
          const pid = String(fd.projectId ?? "").trim();
          if (!pid) return false;
          const p = projectById.get(pid);
          return Boolean(String(p?.city ?? "").trim());
        },
      },
      {
        key: "machineryId",
        label: "Machinery",
        type: "select" as const,
        required: true,
        options: machineryOptions,
        placeholder: "Select machinery",
        afterNode: (value: string) => {
          const { fuelType } = fuelMeta(value);
          return (
            <div className="mt-1 text-[11px] text-gray-500">
              Fuel Type: <span className="font-semibold text-gray-700">{fuelType}</span>
            </div>
          );
        },
      },
      { key: "logDate", label: "Log Date", type: "date" as const, required: true },
      { key: "openingReading", label: "Opening Reading", type: "number" as const, placeholder: "Opening meter" },
      { key: "closingReading", label: "Closing Reading", type: "number" as const, placeholder: "Closing meter" },
      {
        key: "quantityIssued",
        label: "Quantity Issued",
        type: "number" as const,
        required: true,
        placeholder: "Quantity",
        afterNode: (_value: string, formData: Record<string, string>) => {
          const { fuelType, unitLabel } = fuelMeta(formData.machineryId);
          return (
            <div className="mt-1 text-[11px] text-gray-500">
              Unit: <span className="font-semibold text-gray-700">{unitLabel}</span>{" "}
              <span className="text-gray-400">·</span>{" "}
              Fuel: <span className="font-semibold text-gray-700">{fuelType}</span>
            </div>
          );
        },
      },
      {
        key: "unitRate",
        label: "Unit Rate",
        type: "number" as const,
        placeholder: "Rate per unit",
        afterNode: (_value: string, formData: Record<string, string>) => {
          const { unitLabel } = fuelMeta(formData.machineryId);
          return (
            <div className="mt-1 text-[11px] text-gray-500">
              Rate per <span className="font-semibold text-gray-700">{unitLabel.toLowerCase()}</span>
            </div>
          );
        },
      },
      { key: "operatorName", label: "Operator Name", type: "text" as const, placeholder: "Operator name" },
    ],
  };

  const columns: ColDef<DieselLogRow>[] = [
    { key: "logDate", label: "Date", type: "date", sortable: true },
    { key: "machineryName", label: "Machine", sortable: false, searchable: true },
    { key: "projectName", label: "Project", sortable: false, searchable: true },
    { key: "openingReading", label: "Opening", type: "number", sortable: false, render: (row) => row.openingReading ?? "—" },
    { key: "closingReading", label: "Closing", type: "number", sortable: false, render: (row) => row.closingReading ?? "—" },
    { key: "quantityIssued", label: "Qty", type: "number", sortable: true },
    {
      key: "unitRate", label: "Rate", type: "number", sortable: false,
      render: (row) => row.unitRate ? `₹ ${Number(row.unitRate).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "totalCost", label: "Cost", type: "number", sortable: false,
      render: (row) => row.totalCost ? `₹ ${Number(row.totalCost).toLocaleString("en-IN")}` : "—",
    },
    { key: "operatorName", label: "Operator", sortable: false, render: (row) => row.operatorName ?? "—" },
  ];

  return (
    <>
      <PageHeader
        title="Diesel / Fuel Log Book"
        subtitle="Machine-wise fuel consumption tracking"
        breadcrumbs={[{ label: "Store", href: "/store" }, { label: "Diesel Log" }]}
      />
      <PageContainer>
        <DataTable
          id="store-diesel-log"
          columns={columns}
          data={data as DieselLogRow[]}
          loading={isLoading}
          serverMode
          serverTotal={total}
          serverPage={page}
          serverPageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onSearchChange={setSearch}
          onSortChange={(key, dir) => {
            setSortBy(key);
            setSortOrder(dir);
          }}
          onAdd={canAdd ? () => setDrawerOpen(true) : undefined}
          addLabel="Log Entry"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
