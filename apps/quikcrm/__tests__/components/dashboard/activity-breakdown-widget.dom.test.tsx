// @vitest-environment jsdom
/**
 * FR-4.5 — ActivityBreakdownWidget (dashboard surface for Phase-4 activity data).
 *
 * RED → GREEN: the widget does not exist yet; these tests fail at import until
 * components/dashboard/activity-breakdown-widget.tsx is created.
 *
 * The widget surfaces TWO breakdowns the KPI cards can't hold (per the component
 * decision: a NEW breakdown widget, not extending role-kpi-grid, because this is
 * table/list-shaped, not scalar-card-shaped):
 *
 *   1. BY TYPE — activitiesByType ({ type, count }[]) from GET /api/dashboard/metrics.
 *      Reuses the SAME react-query cache key role-kpi-grid uses
 *      (["dashboard","role-metrics"]) so it does NOT issue a second /metrics fetch.
 *   2. PER-REP FIELD AGGREGATES — GET /api/dashboard/field-aggregates?activityTypeId=<id>
 *      (FR-4.4). All fields rendered as columns in a horizontally-scrollable table
 *      (reps = rows; Number → numberSum + team-total footer; Select/Text → value×count).
 *
 * Activity-type PICKER is sourced from GET /api/activities/types (the same
 * endpoint the log-activity modal uses) and DEFAULTS to the first active type so
 * the per-rep table renders populated on first paint. Changing it refetches
 * /field-aggregates for the new type.
 *
 * HONEST SCOPE: jsdom-level. Browser render is OWED (login-loop/migration
 * blockers, same as c-1/c-2) — this is NOT browser-verified.
 *
 * Convention: vi.stubGlobal("fetch", …) + a QueryClientProvider wrapper, matching
 * log-activity-modal.dom.test.tsx and the dashboard's own react-query widgets.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActivityBreakdownWidget } from "@/components/dashboard/activity-breakdown-widget";

// ── fixtures ────────────────────────────────────────────────────────────────
const TYPES = [
  { id: "at1", code: "upwork_connect", label: "Upwork Connect", isActive: true, sortOrder: 0 },
  { id: "at2", code: "linkedin_dm", label: "LinkedIn DM", isActive: true, sortOrder: 1 },
];

const METRICS = {
  role: "Administrator",
  metrics: {
    activitiesByType: [
      { type: "Call", count: 12 },
      { type: "Email", count: 7 },
    ],
  },
};

// per-rep aggregates for at1 (the default type): one Number field + one Select field.
const AGG_AT1 = [
  {
    fieldKey: "bid",
    fieldLabel: "Bid Amount",
    fieldType: "Number",
    perRep: [
      { ownerId: "u1", ownerName: "Rep One", numberSum: 3000 },
      { ownerId: "u2", ownerName: "Rep Two", numberSum: 1500 },
    ],
    teamTotal: { numberSum: 4500 },
  },
  {
    fieldKey: "outcome",
    fieldLabel: "Outcome",
    fieldType: "Select",
    perRep: [
      { ownerId: "u1", ownerName: "Rep One", countsByValue: [{ value: "Replied", count: 2 }] },
    ],
  },
];

const AGG_AT2 = [
  {
    fieldKey: "msgs",
    fieldLabel: "Messages Sent",
    fieldType: "Number",
    perRep: [{ ownerId: "u1", ownerName: "Rep One", numberSum: 9 }],
    teamTotal: { numberSum: 9 },
  },
];

// fetch router: /metrics, /activities/types, /field-aggregates?activityTypeId=.
function installFetch({
  types = TYPES,
  metrics = METRICS,
  aggByType = { at1: AGG_AT1, at2: AGG_AT2 } as Record<string, unknown>,
}: { types?: unknown[]; metrics?: unknown; aggByType?: Record<string, unknown> } = {}) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    calls.push(url);
    const ok = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) } as Response);
    if (url.includes("/api/dashboard/metrics")) return ok(metrics);
    if (url.includes("/api/activities/types")) return ok(types);
    if (url.includes("/api/dashboard/field-aggregates")) {
      const id = new URL(url, "http://t").searchParams.get("activityTypeId") ?? "";
      return ok(aggByType[id] ?? []);
    }
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderWidget(props?: Partial<{ userRole: string; qs: string; tz: string }>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ActivityBreakdownWidget
        userRole={props?.userRole ?? "Administrator"}
        // The widget now forwards the active dashboard filters so it shares the
        // ["dashboard","role-metrics",qs] key with role-kpi-grid.
        qs={props?.qs ?? "from=2026-08-01&to=2026-08-17"}
        tz={props?.tz ?? "Asia/Kolkata"}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => installFetch());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("<ActivityBreakdownWidget> — FR-4.5", () => {
  it("renders the by-type breakdown from activitiesByType (/metrics)", async () => {
    renderWidget();
    await waitFor(() => expect(screen.getByText("Call")).toBeTruthy());
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("defaults the type picker to the first active type and renders its per-rep table", async () => {
    renderWidget();
    // first type (Upwork Connect / at1) is selected by default -> its fields render
    await waitFor(() => expect(screen.getByText("Bid Amount")).toBeTruthy());
    expect(screen.getByText("Rep One")).toBeTruthy();
    expect(screen.getByText("3000")).toBeTruthy();
    expect(screen.getByText("Rep Two")).toBeTruthy();
    expect(screen.getByText("1500")).toBeTruthy();
  });

  it("shows the Number field team total and the Select field value×count", async () => {
    renderWidget();
    await waitFor(() => expect(screen.getByText("Bid Amount")).toBeTruthy());
    // team-total rollup for the Number field
    expect(screen.getByText("4500")).toBeTruthy();
    // Select field renders its value×count breakdown
    expect(screen.getByText("Outcome")).toBeTruthy();
    expect(screen.getByText(/Replied/)).toBeTruthy();
  });

  it("renders the per-rep table inside a horizontally-scrollable container (overflow-x-auto)", async () => {
    const { container } = renderWidget();
    await waitFor(() => expect(screen.getByText("Bid Amount")).toBeTruthy());
    expect(container.querySelector(".overflow-x-auto")).toBeTruthy();
  });

  it("changing the type picker refetches /field-aggregates for the chosen type", async () => {
    const calls = installFetch();
    renderWidget();
    await waitFor(() => expect(screen.getByText("Bid Amount")).toBeTruthy());

    const picker = screen.getByRole("combobox");
    fireEvent.change(picker, { target: { value: "at2" } });

    // refetch for at2 -> its field renders, and the URL carries activityTypeId=at2
    await waitFor(() => expect(screen.getByText("Messages Sent")).toBeTruthy());
    expect(calls.some((u) => u.includes("/api/dashboard/field-aggregates") && u.includes("activityTypeId=at2"))).toBe(true);
  });

  it("shows an empty state when no activity types are configured", async () => {
    installFetch({ types: [] });
    renderWidget();
    await waitFor(() => expect(screen.getByText(/no activity types configured/i)).toBeTruthy());
  });
});
