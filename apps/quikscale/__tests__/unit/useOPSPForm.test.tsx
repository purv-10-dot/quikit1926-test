// @vitest-environment jsdom
/**
 * Tests for useOPSPForm — the central OPSP editor hook.
 *
 * These lock in the extraction from page.tsx (Phase 2 of the OPSP decomp):
 *   - Initial load hits /api/opsp/config then /api/opsp?year=&quarter=
 *   - 1.5s debounced autosave with skipNextSave guard
 *   - Cascade Targets→Goals→Actions keeps category/projected in sync
 *   - completeSetup seeds plan range + form then re-fetches
 *   - loadForPeriod re-fetches for a new year/quarter
 *
 * Autosave is a data-persistence path. Changes to debounce timing or the
 * skipNextSave semantics should be paired with a matching test update here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useOPSPForm, defaultForm } from "../../app/(dashboard)/opsp/hooks/useOPSPForm";

/* ── localStorage polyfill ─────────────────────────────────────────────
 * Vitest 4 under jsdom-environment exposes `localStorage` as an object but
 * leaves `setItem`/`getItem` undefined (the runtime emits a
 * `--localstorage-file` warning). Install a minimal in-memory implementation
 * so the offline-draft code paths in useOPSPForm can be exercised.
 */
(() => {
  const store = new Map<string, string>();
  const polyfill = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis, "localStorage", { value: polyfill, configurable: true, writable: true });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", { value: polyfill, configurable: true, writable: true });
  }
})();

/* ── Fetch helpers ─────────────────────────────────────────────────────── */

type FetchCall = { url: string; init?: RequestInit };
let fetchCalls: FetchCall[];

function setupFetch(handlers: Array<(url: string, init?: RequestInit) => Response | Promise<Response>>) {
  let i = 0;
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    const h = handlers[Math.min(i, handlers.length - 1)];
    i++;
    return h(url, init);
  });
  // @ts-expect-error — vitest jsdom global fetch override
  globalThis.fetch = fn;
  return fn;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchCalls = [];
  // Default: config says hasSetup=true, data returns null.
  setupFetch([
    async () => jsonResponse({ success: true, hasSetup: true, fiscalYearStart: 1, startYear: 2025, endYear: 2029, startQuarter: "Q1" }),
    async () => jsonResponse({ data: null, fiscalYearStart: 1 }),
  ]);
  // clear any localStorage leakage between tests
  try { localStorage.clear(); } catch {}
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useOPSPForm — initial render + default shape", () => {
  it("returns defaultForm shape before load resolves", () => {
    const { result } = renderHook(() => useOPSPForm());
    expect(result.current.loading).toBe(true);
    expect(result.current.saveState).toBe("idle");
    // Form mirrors defaultForm scaffolding — 5 target rows, 6 goal rows, etc.
    expect(result.current.form.targetRows).toHaveLength(5);
    expect(result.current.form.goalRows).toHaveLength(6);
    expect(result.current.form.actionsQtr).toHaveLength(6);
    expect(result.current.form.rocks).toHaveLength(5);
    expect(result.current.form.trends).toHaveLength(6);
    expect(result.current.form.status).toBe("draft");
    expect(result.current.form.targetYears).toBe(5);
  });

  it("seeds year from urlYear and quarter from urlQuarter", () => {
    const { result } = renderHook(() => useOPSPForm({ urlYear: "2027", urlQuarter: "Q3" }));
    expect(result.current.form.year).toBe(2027);
    expect(result.current.form.quarter).toBe("Q3");
  });

  it("ignores invalid urlQuarter but still parses urlYear", () => {
    const { result } = renderHook(() => useOPSPForm({ urlYear: "2028", urlQuarter: "Bogus" }));
    expect(result.current.form.year).toBe(2028);
    expect(result.current.form.quarter).not.toBe("Bogus");
  });
});

describe("useOPSPForm — initial load", () => {
  it("fetches /api/opsp/config then /api/opsp?year=&quarter=", async () => {
    const { result } = renderHook(() => useOPSPForm({ urlYear: "2026", urlQuarter: "Q2" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchCalls[0]?.url).toBe("/api/opsp/config");
    expect(fetchCalls[1]?.url).toBe("/api/opsp?year=2026&quarter=Q2");
  });

  it("stores plan year range + start quarter + fiscalYearStart from config", async () => {
    setupFetch([
      async () => jsonResponse({ success: true, hasSetup: true, fiscalYearStart: 4, startYear: 2024, endYear: 2028, startQuarter: "Q2" }),
      async () => jsonResponse({ data: null }),
    ]);
    const { result } = renderHook(() => useOPSPForm());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fiscalYearStart).toBe(4);
    expect(result.current.planStartYear).toBe(2024);
    expect(result.current.planEndYear).toBe(2028);
    expect(result.current.planStartQuarter).toBe("Q2");
    expect(result.current.showSetupWizard).toBe(false);
  });

  it("short-circuits to setup wizard when config.hasSetup=false", async () => {
    setupFetch([
      async () => jsonResponse({ success: true, hasSetup: false, fiscalYearStart: 1 }),
      // second fetch should NOT be called
      async () => { throw new Error("should not reach /api/opsp"); },
    ]);
    const { result } = renderHook(() => useOPSPForm());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.showSetupWizard).toBe(true);
    expect(fetchCalls).toHaveLength(1); // only /api/opsp/config
  });

  it("hydrates form from server data when /api/opsp returns { data }", async () => {
    setupFetch([
      async () => jsonResponse({ success: true, hasSetup: true, fiscalYearStart: 1 }),
      async () => jsonResponse({
        fiscalYearStart: 1,
        data: {
          year: 2026,
          quarter: "Q3",
          coreValues: "<p>Be honest</p>",
          purpose: "<p>Help teams ship</p>",
          status: "draft",
        },
      }),
    ]);
    const { result } = renderHook(() => useOPSPForm({ urlYear: "2026", urlQuarter: "Q3" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.form.year).toBe(2026);
    expect(result.current.form.quarter).toBe("Q3");
    expect(result.current.form.coreValues).toContain("Be honest");
    expect(result.current.form.purpose).toContain("Help teams ship");
  });

  it("falls back to empty defaults when /api/opsp returns { data: null }", async () => {
    const { result } = renderHook(() => useOPSPForm({ urlYear: "2026", urlQuarter: "Q1" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // defaultForm values persist (purpose is ""); no crash, no throw.
    expect(result.current.form.purpose).toBe("");
  });

  it("on 401 from /api/opsp, loads draft from localStorage if present", async () => {
    localStorage.setItem(
      "opsp_draft_2026_Q2",
      JSON.stringify({ year: 2026, quarter: "Q2", coreValues: "<p>From cache</p>" }),
    );
    setupFetch([
      async () => jsonResponse({ success: true, hasSetup: true, fiscalYearStart: 1 }),
      async () => new Response("", { status: 401 }),
    ]);
    const { result } = renderHook(() => useOPSPForm({ urlYear: "2026", urlQuarter: "Q2" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.form.coreValues).toContain("From cache");
  });

  it("does not throw when the network rejects during initial load", async () => {
    setupFetch([
      async () => { throw new Error("network down"); },
    ]);
    const { result } = renderHook(() => useOPSPForm());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.form.status).toBe("draft");
  });
});

describe("useOPSPForm — autosave", () => {
  it("does NOT autosave the hydrated form that came from the initial load", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useOPSPForm({ urlYear: "2026", urlQuarter: "Q1" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Initial load completed — the two fetches we expect are /api/opsp/config
    // and /api/opsp. No PUT yet. Advance debounce window.
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    const putCalls = fetchCalls.filter(c => c.init?.method === "PUT");
    expect(putCalls).toHaveLength(0);
  });

  it("autosaves via PUT /api/opsp 1.5s after a user edit", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useOPSPForm({ urlYear: "2026", urlQuarter: "Q1" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Queue a response for the PUT.
    setupFetch([
      async () => jsonResponse({ success: true }),
    ]);

    // User edits a field.
    act(() => {
      result.current.setForm(prev => ({ ...prev, coreValues: "<p>new value</p>" }));
    });

    // Not yet — before 1500ms.
    await act(async () => {
      vi.advanceTimersByTime(1499);
      await Promise.resolve();
    });
    expect(fetchCalls.filter(c => c.init?.method === "PUT")).toHaveLength(0);

    // Cross the debounce boundary.
    await act(async () => {
      vi.advanceTimersByTime(2);
      await Promise.resolve();
    });

    await waitFor(() => {
      const puts = fetchCalls.filter(c => c.init?.method === "PUT");
      expect(puts.length).toBeGreaterThanOrEqual(1);
      expect(puts[0].url).toBe("/api/opsp");
    });
  });

  it("sets saveState=error when PUT returns 500", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useOPSPForm());
    await waitFor(() => expect(result.current.loading).toBe(false));

    setupFetch([
      async () => new Response("boom", { status: 500 }),
    ]);

    act(() => {
      result.current.setForm(prev => ({ ...prev, purpose: "edit" }));
    });

    await act(async () => {
      vi.advanceTimersByTime(1600);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.saveState).toBe("error"));
  });

  it("on 401 PUT response, persists draft to localStorage and sets saveState=saved", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useOPSPForm({ urlYear: "2030", urlQuarter: "Q4" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    setupFetch([
      async () => new Response("", { status: 401 }),
    ]);

    act(() => {
      result.current.setForm(prev => ({ ...prev, purpose: "offline-edit" }));
    });
    await act(async () => {
      vi.advanceTimersByTime(1600);
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.saveState).toBe("saved"));

    const draft = localStorage.getItem("opsp_draft_2030_Q4");
    expect(draft).toBeTruthy();
    const parsed = JSON.parse(draft!);
    expect(parsed.purpose).toBe("offline-edit");
  });
});

describe("useOPSPForm — cascade effects", () => {
  it("propagates targetRows[i] → goalRows[i] category + projected when fully populated", async () => {
    const { result } = renderHook(() => useOPSPForm());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setForm(prev => {
        const next = [...prev.targetRows];
        next[0] = { category: "Revenue", projected: "$10M", y1: "$2M", y2: "", y3: "", y4: "", y5: "" };
        return { ...prev, targetRows: next };
      });
    });

    await waitFor(() => {
      expect(result.current.form.goalRows[0].category).toBe("Revenue");
      expect(result.current.form.goalRows[0].projected).toBe("$2M");
    });
  });

  it("resets goalRows[i] when the source target is cleared", async () => {
    const { result } = renderHook(() => useOPSPForm());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // First: seed target row and manually fill the goal row's quarter values.
    act(() => {
      result.current.setForm(prev => {
        const t = [...prev.targetRows];
        t[0] = { category: "Rev", projected: "10", y1: "1", y2: "", y3: "", y4: "", y5: "" };
        const g = [...prev.goalRows];
        g[0] = { ...g[0], q1: "0.25", q2: "0.25", q3: "0.25", q4: "0.25" };
        return { ...prev, targetRows: t, goalRows: g };
      });
    });
    await waitFor(() => expect(result.current.form.goalRows[0].category).toBe("Rev"));

    // Now clear the target — goal row should wipe entirely, including q1–q4.
    act(() => {
      result.current.setForm(prev => {
        const t = [...prev.targetRows];
        t[0] = { category: "", projected: "", y1: "", y2: "", y3: "", y4: "", y5: "" };
        return { ...prev, targetRows: t };
      });
    });
    await waitFor(() => {
      const g = result.current.form.goalRows[0];
      expect(g.category).toBe("");
      expect(g.projected).toBe("");
      expect(g.q1).toBe("");
      expect(g.q2).toBe("");
      expect(g.q3).toBe("");
      expect(g.q4).toBe("");
    });
  });

  it("propagates goalRows → actionsQtr using the current quarter column", async () => {
    const { result } = renderHook(() => useOPSPForm({ urlYear: "2026", urlQuarter: "Q2" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setForm(prev => {
        const g = [...prev.goalRows];
        g[0] = { category: "NPS", projected: "80", q1: "70", q2: "75", q3: "78", q4: "80" };
        return { ...prev, goalRows: g };
      });
    });

    // Quarter is Q2 → actionsQtr[0].projected should be "75".
    await waitFor(() => {
      expect(result.current.form.actionsQtr[0].category).toBe("NPS");
      expect(result.current.form.actionsQtr[0].projected).toBe("75");
    });
  });
});

describe("useOPSPForm — loadForPeriod + completeSetup", () => {
  it("loadForPeriod re-fetches /api/opsp for the new period", async () => {
    const { result } = renderHook(() => useOPSPForm({ urlYear: "2026", urlQuarter: "Q1" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Reset fetch for the period reload.
    setupFetch([
      async () => jsonResponse({ data: { year: 2027, quarter: "Q4", coreValues: "<p>new period</p>" } }),
    ]);

    await act(async () => {
      await result.current.loadForPeriod(2027, "Q4");
    });

    expect(fetchCalls.some(c => c.url === "/api/opsp?year=2027&quarter=Q4")).toBe(true);
    expect(result.current.form.year).toBe(2027);
    expect(result.current.form.quarter).toBe("Q4");
    expect(result.current.form.coreValues).toContain("new period");
  });

  it("completeSetup stores plan range, seeds form, and re-fetches", async () => {
    // Start with hasSetup=false so the wizard path is active.
    setupFetch([
      async () => jsonResponse({ success: true, hasSetup: false, fiscalYearStart: 1 }),
    ]);
    const { result } = renderHook(() => useOPSPForm());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.showSetupWizard).toBe(true);

    // Arm the post-wizard fetch.
    setupFetch([
      async () => jsonResponse({ data: { year: 2026, quarter: "Q1", purpose: "<p>seeded</p>" } }),
    ]);

    await act(async () => {
      result.current.completeSetup({ year: 2026, quarter: "Q1", targetYears: 5 });
    });

    await waitFor(() => {
      expect(result.current.showSetupWizard).toBe(false);
      expect(result.current.planStartYear).toBe(2026);
      expect(result.current.planEndYear).toBe(2030);
      expect(result.current.planStartQuarter).toBe("Q1");
      expect(result.current.form.year).toBe(2026);
      expect(result.current.form.quarter).toBe("Q1");
      expect(result.current.form.targetYears).toBe(5);
      expect(result.current.form.purpose).toContain("seeded");
    });
  });
});

describe("defaultForm", () => {
  it("produces a fresh object each call (no shared array refs)", () => {
    const a = defaultForm();
    const b = defaultForm();
    expect(a).not.toBe(b);
    expect(a.targetRows).not.toBe(b.targetRows);
    a.targetRows[0].category = "mutated";
    expect(b.targetRows[0].category).toBe("");
  });
});
