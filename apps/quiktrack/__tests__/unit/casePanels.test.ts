import { describe, expect, it } from "vitest";

/**
 * QUIKTR-336 — the read → edit → back handoff between the case detail panel and
 * the case editor.
 *
 * `useCasePanels` is a hook, and there is no DOM test environment available in
 * this workspace, so the transitions are asserted against a pure reducer that
 * MIRRORS the hook. Keep the two in step: if `use-case-panels.ts` changes, change
 * these transitions with it.
 *
 * This is not a formality — writing it caught a real bug. `openCreate` cleared the
 * "came from detail" flag but left the detail sheet OPEN, so clicking
 * "New test case" while viewing a case left the old case's panel behind the form,
 * and it reappeared on close with `caseId` already null.
 */

interface PanelState {
  caseId: string | null;
  detail: boolean;
  editor: boolean;
  cameFromDetail: boolean;
}

const initial: PanelState = {
  caseId: null,
  detail: false,
  editor: false,
  cameFromDetail: false,
};

const openDetail = (s: PanelState, id: string): PanelState => ({
  ...s,
  caseId: id,
  cameFromDetail: false,
  detail: true,
});

const openCreate = (s: PanelState): PanelState => ({
  ...s,
  caseId: null,
  cameFromDetail: false,
  detail: false,
  editor: true,
});

const editFromDetail = (s: PanelState): PanelState => ({
  ...s,
  detail: false,
  cameFromDetail: true,
  editor: true,
});

const closeDetail = (s: PanelState): PanelState => ({ ...s, detail: false });

const closeEditor = (s: PanelState): PanelState =>
  s.cameFromDetail
    ? { ...s, editor: false, cameFromDetail: false, detail: true }
    : { ...s, editor: false };

describe("case panel handoff", () => {
  it("a row click reads the case rather than editing it", () => {
    const s = openDetail(initial, "c1");
    expect(s.detail).toBe(true);
    expect(s.editor).toBe(false);
    expect(s.caseId).toBe("c1");
  });

  it("Edit swaps detail for the editor without stacking sheets", () => {
    const s = editFromDetail(openDetail(initial, "c1"));
    expect(s.detail).toBe(false);
    expect(s.editor).toBe(true);
    expect(s.caseId).toBe("c1");
  });

  it("closing the editor returns to the same case's detail view", () => {
    const s = closeEditor(editFromDetail(openDetail(initial, "c1")));
    expect(s.detail).toBe(true);
    expect(s.editor).toBe(false);
    expect(s.caseId).toBe("c1");
  });

  it("closing the detail panel ends the flow", () => {
    const s = closeDetail(closeEditor(editFromDetail(openDetail(initial, "c1"))));
    expect(s.detail).toBe(false);
    expect(s.editor).toBe(false);
  });

  it("creating a case while viewing one leaves no stale panel behind", () => {
    // The regression. Both the flag reset AND closing the detail sheet are needed.
    const s = closeEditor(openCreate(openDetail(initial, "c1")));
    expect(s.detail).toBe(false);
    expect(s.caseId).toBeNull();
  });

  it("never has both sheets open at once", () => {
    const paths: PanelState[] = [
      openDetail(initial, "c1"),
      editFromDetail(openDetail(initial, "c1")),
      openCreate(openDetail(initial, "c1")),
      closeEditor(editFromDetail(openDetail(initial, "c1"))),
      openCreate(initial),
    ];
    for (const s of paths) expect(s.detail && s.editor).toBe(false);
  });

  it("creating straight from the list closes cleanly", () => {
    const s = closeEditor(openCreate(initial));
    expect([s.detail, s.editor, s.caseId]).toEqual([false, false, null]);
  });

  it("survives a second edit round trip", () => {
    let s = openDetail(initial, "c2");
    s = closeEditor(editFromDetail(s));
    s = editFromDetail(s);
    expect([s.detail, s.editor, s.caseId]).toEqual([false, true, "c2"]);
  });
});
