import { describe, expect, it } from "vitest";
import {
  groupByLifecycle,
  PROGRESS_ORDER,
  progressSegments,
  runLifecycle,
} from "@/lib/test/runLifecycle";

/**
 * QUIKTR-338 — run lifecycle grouping and the segmented progress bar.
 *
 * "Completion Pending" is derived, not stored, so these rules are the whole
 * feature. The dangerous case is an EMPTY run: zero untested out of zero total is
 * vacuously "all executed", and calling that ready for sign-off would invite
 * closing a run that never tested anything.
 */

describe("runLifecycle", () => {
  it("is open while tests are untested", () => {
    expect(runLifecycle({ state: "open", counts: { passed: 2, untested: 3 } })).toBe(
      "open",
    );
  });

  it("is completion_pending when every test has a result", () => {
    expect(runLifecycle({ state: "open", counts: { passed: 4, failed: 1 } })).toBe(
      "completion_pending",
    );
  });

  it("is completed once closed", () => {
    expect(runLifecycle({ state: "closed", counts: { passed: 5 } })).toBe(
      "completed",
    );
  });

  it("is completed when closed even with untested tests left", () => {
    // Closing is an explicit human act — "we stopped here" is legitimate and must
    // not be re-labelled as pending.
    expect(
      runLifecycle({ state: "closed", counts: { passed: 1, untested: 9 } }),
    ).toBe("completed");
  });

  it("treats an EMPTY run as open, never completion_pending", () => {
    expect(runLifecycle({ state: "open", counts: {} })).toBe("open");
    expect(runLifecycle({ state: "open", counts: {}, testCount: 0 })).toBe("open");
  });

  it("counts retest as executed, so it does not block completion", () => {
    // A retest carries a result: someone ran it and asked for another pass. The
    // run is still the reviewer's to close.
    expect(runLifecycle({ state: "open", counts: { passed: 2, retest: 1 } })).toBe(
      "completion_pending",
    );
  });

  it("uses testCount over the count map when they disagree", () => {
    // testCount comes from the materialised rows; an empty count map with tests
    // present means the counts have not loaded, which is not "complete".
    expect(runLifecycle({ state: "open", counts: {}, testCount: 5 })).toBe(
      "completion_pending",
    );
  });
});

describe("groupByLifecycle", () => {
  it("splits runs into the three sections and preserves order", () => {
    const runs = [
      { id: "a", state: "open", counts: { untested: 1 } },
      { id: "b", state: "open", counts: { passed: 1 } },
      { id: "c", state: "closed", counts: { passed: 1 } },
      { id: "d", state: "open", counts: { untested: 2 } },
    ];
    const g = groupByLifecycle(runs);
    expect(g.open.map((r) => r.id)).toEqual(["a", "d"]);
    expect(g.completion_pending.map((r) => r.id)).toEqual(["b"]);
    expect(g.completed.map((r) => r.id)).toEqual(["c"]);
  });

  it("returns all three keys even when empty", () => {
    const g = groupByLifecycle([]);
    expect(Object.keys(g).sort()).toEqual([
      "completed",
      "completion_pending",
      "open",
    ]);
  });
});

describe("progressSegments", () => {
  it("returns nothing for an empty run", () => {
    expect(progressSegments({}, PROGRESS_ORDER)).toEqual([]);
  });

  it("omits zero-count statuses", () => {
    const s = progressSegments({ passed: 2, failed: 0 }, PROGRESS_ORDER);
    expect(s.map((x) => x.key)).toEqual(["passed"]);
  });

  it("fills exactly 100% so no sliver of background remains", () => {
    // Three equal thirds would each round to 33.3 and leave 0.1% unaccounted,
    // which reads as work nobody owns.
    const s = progressSegments({ passed: 1, failed: 1, untested: 1 }, PROGRESS_ORDER);
    expect(s.reduce((sum, x) => sum + x.percent, 0)).toBe(100);
  });

  it("still totals 100% for awkward divisions", () => {
    for (const n of [3, 6, 7, 9, 11, 13]) {
      const counts = { passed: 1, failed: 1, untested: n - 2 };
      const total = progressSegments(counts, PROGRESS_ORDER).reduce(
        (sum, x) => sum + x.percent,
        0,
      );
      expect(total).toBe(100);
    }
  });

  it("orders outcomes before unexecuted", () => {
    const s = progressSegments(
      { untested: 1, passed: 1, failed: 1 },
      PROGRESS_ORDER,
    );
    expect(s.map((x) => x.key)).toEqual(["passed", "failed", "untested"]);
  });

  it("gives a single full segment when one status holds everything", () => {
    const s = progressSegments({ untested: 8 }, PROGRESS_ORDER);
    expect(s).toHaveLength(1);
    expect(s[0].percent).toBe(100);
  });
});
