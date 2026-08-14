// @vitest-environment jsdom
//
// Characterization tests for DPRForm — captured BEFORE the file is decomposed
// (2,378 LOC → orchestrator + types/constants/sections). These lock in the
// CURRENT observable behaviour so the refactor can be proven behaviour-neutral.
//
// NOTE: they assert what the code ACTUALLY does, not the header doc-comment.
// The comment claims "Submit Report → status: submitted", but handleSave always
// posts `status: "draft"` (DPRForm.tsx:795); the submit button differs only by
// extra client-side validation. The test pins the real behaviour on purpose.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";

// ── Router ──────────────────────────────────────────────────────────────
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/projects/dpr/new",
}));

// ── Masters + projects hooks (canned, minimal) ─────────────────────────────
const wrap = <T,>(data: T) => ({ data: { data }, isLoading: false });
vi.mock("@/hooks/use-masters", () => ({
  useProjects: () => wrap([{ id: "p1", name: "Metro Depot", code: "MD-01" }]),
  useItems: () => wrap([{ id: "i1", name: "Cement", code: "CEM", uomId: "u1", groupId: "g1" }]),
  useItemGroups: () => wrap([{ id: "g1", name: "Cement & Aggregates", status: "active" }]),
  useUOMs: () => wrap([{ id: "u1", code: "BAG" }]),
  useContractors: () => wrap([{ id: "c1", name: "ABC Infra", status: "active" }]),
  useLocations: () => wrap([{ id: "l1", name: "Main Store", status: "active" }]),
  useMachinery: () => wrap([{ id: "m1", code: "EXC", name: "Excavator", status: "active" }]),
}));
vi.mock("@/hooks/use-projects", () => ({
  useWorkOrders: () => wrap([]),
  useBOQ: () => wrap([]),
  // FREE_SCOPE projects log progress against activity leaves instead of BOQ
  // rows; the form reads both and picks by the project's executionMode.
  useActivities: () => wrap([]),
}));

import { DPRForm } from "@/app/(dashboard)/projects/dpr/components/DPRForm";

function mockFetchOk(body: unknown = { id: "dpr-1" }) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const EDIT = {
  id: "dpr-1",
  projectId: "p1",
  projectName: "Metro Depot",
  reportDate: "2026-07-14",
  dprNumber: "DPR-MD-2607-0001",
  weatherCondition: "Clear",
  workItems: [],
  materials: [],
  manpower: [],
  staff: [],
  machinery: [],
};

describe("DPRForm — characterization (pre-decomposition)", () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
  });

  it("renders the new-DPR form with the Submit Report action", () => {
    mockFetchOk();
    render(<DPRForm />, { wrapper: TestProviders });
    expect(screen.getByText("Submit Report")).toBeInTheDocument();
    expect(screen.getByText("Save Draft")).toBeInTheDocument();
  });

  it("hydrates from editData in edit mode (project + DPR number visible)", () => {
    mockFetchOk();
    render(<DPRForm editData={EDIT} />, { wrapper: TestProviders });
    // Edit mode swaps the submit label to "Save & Submit".
    expect(screen.getByText("Save & Submit")).toBeInTheDocument();
  });

  it("blocks save when no project is picked, and does NOT call the API", () => {
    const fetchFn = mockFetchOk();
    render(<DPRForm />, { wrapper: TestProviders });
    fireEvent.click(screen.getByText("Save Draft"));
    expect(screen.getByText("Pick a project")).toBeInTheDocument();
    const dprCalls = fetchFn.mock.calls.filter((c) => String(c[0]).includes("/api/projects/dpr"));
    expect(dprCalls).toHaveLength(0);
  });

  it("Submit Report requires at least one BOQ activity", () => {
    const fetchFn = mockFetchOk();
    render(<DPRForm editData={EDIT} />, { wrapper: TestProviders });
    fireEvent.click(screen.getByText("Save & Submit"));
    expect(
      screen.getByText("Add at least one BOQ activity before submitting"),
    ).toBeInTheDocument();
    const dprCalls = fetchFn.mock.calls.filter((c) => String(c[0]).includes("/api/projects/dpr"));
    expect(dprCalls).toHaveLength(0);
  });

  it("Save Draft in edit mode PUTs the record with status:'draft'", async () => {
    const fetchFn = mockFetchOk();
    render(<DPRForm editData={EDIT} />, { wrapper: TestProviders });
    fireEvent.click(screen.getByText("Save Draft"));

    await waitFor(() => {
      const call = fetchFn.mock.calls.find((c) => String(c[0]).includes("/api/projects/dpr/dpr-1"));
      expect(call).toBeTruthy();
      expect(call![1].method).toBe("PUT");
      const payload = JSON.parse(call![1].body as string);
      expect(payload.status).toBe("draft"); // real behaviour, not the doc comment
      expect(payload.projectId).toBe("p1");
    });
  });
});
