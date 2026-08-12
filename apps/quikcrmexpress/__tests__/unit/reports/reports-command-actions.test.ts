import { describe, expect, it, vi } from "vitest";
import { matchesQuery } from "@/components/leads/dashboard/command-palette";
import { buildReportsCommandActions } from "@/lib/reports/build-reports-command-actions";

describe("buildReportsCommandActions", () => {
  it("includes navigation and canned report runs", () => {
    const navigate = vi.fn();
    const actions = buildReportsCommandActions({
      onClose: vi.fn(),
      navigate,
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-31T00:00:00.000Z",
      ownerId: "",
      pathname: "/reports/library",
      cannedReports: [
        { id: "pipeline-by-stage", title: "Pipeline by stage", category: "Pipeline" },
      ],
    });

    const overview = actions.find((a) => a.id === "nav-overview");
    expect(overview).toBeDefined();
    overview!.run();
    expect(navigate).toHaveBeenCalledWith(
      expect.stringContaining("/reports/overview"),
    );

    const report = actions.find((a) => a.id === "report-pipeline-by-stage");
    expect(report).toBeDefined();
    expect(matchesQuery(report!, "pipeline")).toBe(true);
  });

  it("adds export actions on a report run page", () => {
    const actions = buildReportsCommandActions({
      onClose: vi.fn(),
      navigate: vi.fn(),
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-31T00:00:00.000Z",
      ownerId: "u1",
      pathname: "/reports/pipeline-by-stage",
      cannedReports: [],
      currentReportId: "pipeline-by-stage",
    });

    expect(actions.some((a) => a.id === "export-csv")).toBe(true);
    expect(actions.some((a) => a.id === "export-xlsx")).toBe(true);
  });
});
