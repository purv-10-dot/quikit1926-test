import type { CommandAction } from "@/components/leads/dashboard/command-palette";

export type ReportCommandGroupId = "navigation" | "reports" | "filters" | "export";

const GROUP_LABEL: Record<ReportCommandGroupId, string> = {
  navigation: "Go to",
  reports: "Run report",
  filters: "Date range",
  export: "Export",
};

export function reportCommandGroupLabel(group: ReportCommandGroupId): string {
  return GROUP_LABEL[group];
}

export type CannedReportRef = {
  id: string;
  title: string;
  category: string;
};

export type BuildReportsCommandActionsInput = {
  onClose: () => void;
  navigate: (href: string) => void;
  from: string;
  to: string;
  ownerId: string;
  /** Current path (e.g. `/reports/library`) for date-preset navigation. */
  pathname: string;
  cannedReports: CannedReportRef[];
  /** When on `/reports/[id]`, enables export actions. */
  currentReportId?: string;
};

function queryString(from: string, to: string, ownerId: string): string {
  const p = new URLSearchParams({ from, to });
  if (ownerId) p.set("ownerId", ownerId);
  return p.toString();
}

function presetRange(preset: "7d" | "30d" | "month" | "quarter"): { from: string; to: string } {
  const to = new Date();
  const today = new Date(to);
  today.setHours(0, 0, 0, 0);
  let from: Date;
  switch (preset) {
    case "7d":
      from = new Date(today.getTime() - 6 * 86400000);
      break;
    case "30d":
      from = new Date(today.getTime() - 29 * 86400000);
      break;
    case "month":
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case "quarter":
      from = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
      break;
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export function buildReportsCommandActions(
  input: BuildReportsCommandActionsInput,
): CommandAction[] {
  const closeAnd = (fn: () => void) => () => {
    fn();
    input.onClose();
  };

  const qs = queryString(input.from, input.to, input.ownerId);
  const withPreset = (preset: "7d" | "30d" | "month" | "quarter") => {
    const r = presetRange(preset);
    return queryString(r.from, r.to, input.ownerId);
  };

  const navigation: CommandAction[] = [
    {
      id: "nav-overview",
      group: "navigation",
      label: "Executive overview",
      keywords: ["overview", "kpi", "executive", "dashboard", "home"],
      hint: "Tab",
      run: closeAnd(() => input.navigate(`/reports/overview?${qs}`)),
    },
    {
      id: "nav-library",
      group: "navigation",
      label: "Report library",
      keywords: ["library", "canned", "standard", "catalog"],
      hint: "Tab",
      run: closeAnd(() => input.navigate(`/reports/library?${qs}`)),
    },
    {
      id: "nav-builder",
      group: "navigation",
      label: "Report builder",
      keywords: ["builder", "custom", "create", "group by"],
      hint: "Tab",
      run: closeAnd(() => input.navigate(`/reports/builder?${qs}`)),
    },
    {
      id: "nav-dashboard",
      group: "navigation",
      label: "Main CRM dashboard",
      keywords: ["dashboard", "crm", "home"],
      run: closeAnd(() => input.navigate("/dashboard")),
    },
  ];

  const reportRuns: CommandAction[] = input.cannedReports.map((r) => ({
    id: `report-${r.id}`,
    group: "reports",
    label: r.title,
    keywords: [r.category, r.id, "report", "run", "open"],
    hint: r.category,
    run: closeAnd(() => input.navigate(`/reports/${r.id}?${qs}`)),
  }));

  const filters: CommandAction[] = [
    {
      id: "filter-7d",
      group: "filters",
      label: "Set range: last 7 days",
      keywords: ["7d", "week", "filter", "date"],
      run: closeAnd(() => input.navigate(`${input.pathname}?${withPreset("7d")}`)),
    },
    {
      id: "filter-30d",
      group: "filters",
      label: "Set range: last 30 days",
      keywords: ["30d", "month", "filter", "date"],
      run: closeAnd(() => input.navigate(`${input.pathname}?${withPreset("30d")}`)),
    },
    {
      id: "filter-month",
      group: "filters",
      label: "Set range: this month",
      keywords: ["month", "filter", "date"],
      run: closeAnd(() => input.navigate(`${input.pathname}?${withPreset("month")}`)),
    },
    {
      id: "filter-quarter",
      group: "filters",
      label: "Set range: this quarter",
      keywords: ["quarter", "q1", "filter", "date"],
      run: closeAnd(() => input.navigate(`${input.pathname}?${withPreset("quarter")}`)),
    },
  ];

  const exports: CommandAction[] = [];
  if (input.currentReportId) {
    const exportQs = new URLSearchParams({ from: input.from, to: input.to, format: "csv" });
    if (input.ownerId) exportQs.set("ownerId", input.ownerId);
    const base = `/api/reports/canned/${input.currentReportId}?`;
    exports.push(
      {
        id: "export-csv",
        group: "export",
        label: "Export current report (CSV)",
        keywords: ["export", "download", "csv", "excel"],
        run: closeAnd(() => {
          window.location.href = `${base}${exportQs.toString()}`;
        }),
      },
      {
        id: "export-xlsx",
        group: "export",
        label: "Export current report (Excel)",
        keywords: ["export", "xlsx", "excel", "download"],
        run: closeAnd(() => {
          exportQs.set("format", "xlsx");
          window.location.href = `${base}${exportQs.toString()}`;
        }),
      },
    );
  }

  return [...navigation, ...reportRuns, ...filters, ...exports];
}
