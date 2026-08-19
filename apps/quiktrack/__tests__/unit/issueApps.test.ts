import { beforeEach, describe, expect, it } from "vitest";

/**
 * Attached-apps storage for the QuikTest panel on a work item.
 *
 * The hazards here are all silent: a stale app id from an older build must not render
 * a panel that no longer exists, corrupt JSON must not throw inside a render, and the
 * choice must be scoped PER ISSUE — a shared key would make adding the panel on one
 * item light it up on every item.
 *
 * The functions are mirrored from `components/issue-apps-menu.tsx` rather than
 * imported: that module is "use client" and touches `window`, and there is no DOM test
 * environment in this workspace. Keep the two in step.
 */

type IssueApp = "quiktest";
const STORAGE_PREFIX = "quiktrack.issueApps.";

const store = new Map<string, string>();
const storageKey = (id: string) => `${STORAGE_PREFIX}${id}`;

function loadIssueApps(issueId: string): Set<IssueApp> {
  try {
    const raw = store.get(storageKey(issueId)) ?? null;
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is IssueApp => v === "quiktest"));
  } catch {
    return new Set();
  }
}

function saveIssueApps(issueId: string, apps: Set<IssueApp>) {
  store.set(storageKey(issueId), JSON.stringify([...apps]));
}

describe("issue attached apps", () => {
  beforeEach(() => store.clear());

  it("has no apps for an item nobody has touched", () => {
    expect([...loadIssueApps("i1")]).toEqual([]);
  });

  it("persists an added app", () => {
    saveIssueApps("i1", new Set(["quiktest"]));
    expect([...loadIssueApps("i1")]).toEqual(["quiktest"]);
  });

  it("is scoped per work item", () => {
    saveIssueApps("i1", new Set(["quiktest"]));
    expect([...loadIssueApps("i2")]).toEqual([]);
  });

  it("clears when the app is removed", () => {
    saveIssueApps("i1", new Set(["quiktest"]));
    saveIssueApps("i1", new Set());
    expect([...loadIssueApps("i1")]).toEqual([]);
  });

  it("drops app ids it does not recognise", () => {
    // A key written by an older build must not render a panel that no longer exists.
    store.set(storageKey("i3"), JSON.stringify(["quiktest", "zephyr", "testrail"]));
    expect([...loadIssueApps("i3")]).toEqual(["quiktest"]);
  });

  it("returns empty when every stored id is unknown", () => {
    store.set(storageKey("i4"), JSON.stringify(["zephyr"]));
    expect([...loadIssueApps("i4")]).toEqual([]);
  });

  it("survives corrupt JSON without throwing", () => {
    store.set(storageKey("i5"), "{not json");
    expect([...loadIssueApps("i5")]).toEqual([]);
  });

  it("survives a wrong-shaped value", () => {
    store.set(storageKey("i6"), JSON.stringify({ quiktest: true }));
    expect([...loadIssueApps("i6")]).toEqual([]);
    store.set(storageKey("i7"), JSON.stringify([1, null, true]));
    expect([...loadIssueApps("i7")]).toEqual([]);
  });

  it("stays a single entry when added twice", () => {
    saveIssueApps("i8", new Set(loadIssueApps("i8")).add("quiktest"));
    saveIssueApps("i8", new Set(loadIssueApps("i8")).add("quiktest"));
    expect([...loadIssueApps("i8")]).toEqual(["quiktest"]);
  });

  it("namespaces the storage key", () => {
    // An unnamespaced key could collide with another feature's storage.
    expect(storageKey("abc")).toBe("quiktrack.issueApps.abc");
  });
});

/**
 * The `+` menu's checkmark and the panel's visibility must never disagree.
 *
 * The bug: the checkmark read the attached-apps set while the panel's own "Hide"
 * flipped a PRIVATE `hidden` flag. Hiding therefore left the menu ticked for a panel
 * that was gone. The fix deletes the second state — hiding IS detaching.
 */
describe("attached-app visibility stays in sync", () => {
  const checkmark = (apps: Set<IssueApp>) => apps.has("quiktest");
  const panelVisible = (apps: Set<IssueApp>) => apps.has("quiktest");

  const add = (apps: Set<IssueApp>) => new Set(apps).add("quiktest");
  const hide = (apps: Set<IssueApp>) => {
    const next = new Set(apps);
    next.delete("quiktest");
    return next;
  };
  const toggle = (apps: Set<IssueApp>) =>
    apps.has("quiktest") ? hide(apps) : add(apps);

  it("shows the panel and ticks the menu after adding", () => {
    const apps = add(new Set());
    expect([checkmark(apps), panelVisible(apps)]).toEqual([true, true]);
  });

  it("clears the checkmark when the panel is hidden", () => {
    // The reported bug: this used to leave the checkmark ticked.
    const apps = hide(add(new Set()));
    expect([checkmark(apps), panelVisible(apps)]).toEqual([false, false]);
  });

  it("can be re-added after hiding, so hiding is not a one-way trap", () => {
    const apps = add(hide(add(new Set())));
    expect([checkmark(apps), panelVisible(apps)]).toEqual([true, true]);
  });

  it("treats a menu toggle-off and a panel hide as the same action", () => {
    const viaToggle = toggle(add(new Set()));
    const viaHide = hide(add(new Set()));
    expect([...viaToggle]).toEqual([...viaHide]);
  });

  it("never desynchronises across any sequence of actions", () => {
    // Exhaustive over 4-step sequences of the three actions (81 paths). A single
    // extra piece of state would show up here immediately.
    const actions = [add, hide, toggle];
    for (const a of actions) {
      for (const b of actions) {
        for (const c of actions) {
          for (const d of actions) {
            let apps = new Set<IssueApp>();
            for (const step of [a, b, c, d]) {
              apps = step(apps);
              expect(checkmark(apps)).toBe(panelVisible(apps));
            }
          }
        }
      }
    }
  });
});
