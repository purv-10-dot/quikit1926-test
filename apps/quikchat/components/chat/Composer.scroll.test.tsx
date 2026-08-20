// @vitest-environment jsdom
/**
 * Regression: Shift+Enter must scroll the composer to the line it just opened.
 *
 * The bug, measured in Chromium against this component: once the box reached its
 * 4-line cap (`max-height: 4lh; overflow-y: auto` on `.qc-composer__editor`, which
 * makes the editable ITSELF the scroll container), a Shift+Enter grew the content
 * but left `scrollTop` where it was — 0 against a maxScroll of 21, then 21 against
 * 43 on the next break. The caret sat on a line below the fold and stayed invisible
 * until the next character was typed, which is what pulled the view down.
 *
 * Cause: `@tiptap/extension-hard-break`'s `setHardBreak` never calls
 * `tr.scrollIntoView()`, while `splitBlock` (plain Enter) does.
 *
 * WHAT THIS FILE CAN AND CANNOT ASSERT. jsdom performs no layout, so every scroll
 * metric in it is 0 and the visible symptom is unobservable here. What IS
 * observable is the mechanism: whether the dispatched transaction is MARKED to
 * scroll (`Transaction.scrolledIntoView`). That is the exact bit that was missing,
 * so asserting it fails before the fix and passes after — and the negative control
 * below proves the assertion has teeth by showing stock StarterKit failing it.
 * The rendered outcome is covered by the browser harness, not by jsdom.
 */
import { describe, expect, it } from "vitest";
import { Editor, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { HardBreakScrollIntoView } from "./Composer";

/** Composer.tsx's StarterKit options, so the keymap under test is the real one. */
const STARTER_KIT = StarterKit.configure({
  heading: false,
  blockquote: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
  codeBlock: false,
  horizontalRule: false,
});

/**
 * Run one hard-break shortcut and report whether ANY transaction it produced was
 * marked to scroll. `setHardBreak` runs a nested chain, so the flag can land on a
 * later transaction than the first — hence `.some`, not a check of one.
 */
function scrollsOnShiftEnter(extensions: Extensions) {
  const editor = new Editor({ extensions, content: "<p>first line</p>" });
  const marked: boolean[] = [];
  editor.on("transaction", ({ transaction }) => marked.push(transaction.scrolledIntoView));
  try {
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    // Straight at the view's own handler, which is what a real keypress reaches.
    // NOT `editor.commands.keyboardShortcut()`: that routes through
    // `editor.captureTransaction()` and replays only the captured `steps` onto its
    // own transaction. `scrolledIntoView` is an `updated` bitflag, not a step, so
    // it is discarded by construction — that helper can never observe the thing
    // this test is about, and reports a false negative for every extension.
    editor.view.someProp("handleKeyDown", (f) => f(editor.view, event));
    return { scrolled: marked.some(Boolean), html: editor.getHTML() };
  } finally {
    editor.destroy();
  }
}

describe("composer hard-break scrolling", () => {
  it("marks the Shift+Enter transaction to scroll, so the new line is followed", () => {
    const { scrolled, html } = scrollsOnShiftEnter([STARTER_KIT, HardBreakScrollIntoView]);
    expect(scrolled).toBe(true);
    // The break must still actually be inserted — a shortcut that scrolls but
    // swallows the newline would pass the assertion above and break the feature.
    expect(html).toContain("<br>");
  });

  it("negative control: stock StarterKit does not (the upstream gap being patched)", () => {
    const { scrolled, html } = scrollsOnShiftEnter([STARTER_KIT]);
    expect(scrolled).toBe(false);
    expect(html).toContain("<br>");
  });

  it("outranks StarterKit's own binding rather than racing it", () => {
    // Order reversed: the fix must win on priority, not on array position.
    const { scrolled } = scrollsOnShiftEnter([HardBreakScrollIntoView, STARTER_KIT]);
    expect(scrolled).toBe(true);
  });
});
