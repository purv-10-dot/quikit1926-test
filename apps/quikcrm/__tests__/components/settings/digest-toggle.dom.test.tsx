// @vitest-environment jsdom
/**
 * Stage 4 — RED-first jsdom test for the "Daily Digest" toggle (Settings→Users).
 *
 * Written BEFORE components/settings/digest-toggle.tsx exists → RED at import.
 * Pins ONLY jsdom-provable component logic. The rendered look, column placement
 * in the Users table, and end-to-end (toggle → real PATCH → real digest send)
 * are BROWSER checks — OWED, NOT asserted here.
 *
 * HONEST LABEL: jsdom-verified, BROWSER-OWED (same standing rule as FR-4.5).
 *
 * jsdom-provable behaviors:
 *   1. Eligible + enabled  → toggle is ON, enabled (interactive).
 *   2. Eligible + disabled → toggle is OFF, enabled.
 *   3. Ineligible "no-team"          → toggle DISABLED + tooltip "No team to manage".
 *   4. Ineligible "not-eligible-role"→ toggle DISABLED + tooltip "Role not eligible…".
 *   5. Toggling fires PATCH /api/settings/digest-recipients { userId, enabled:<new> }.
 *   6. An ineligible toggle does NOT fire a PATCH (can't be interacted).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DigestToggle } from "@/components/settings/digest-toggle";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: { enabled: true, recipientUserIds: ["u1"] } }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const baseProps = {
  userId: "u1",
  digestEligible: true,
  digestEnabled: false,
  digestReason: undefined as string | undefined,
};

describe("<DigestToggle> — Settings→Users daily-digest toggle (Stage 4)", () => {
  it("eligible + enabled → toggle is ON and interactive", () => {
    render(<DigestToggle {...baseProps} digestEnabled />);
    const toggle = screen.getByRole("switch");
    expect(toggle.hasAttribute("disabled")).toBe(false);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("eligible + disabled → toggle is OFF and interactive", () => {
    render(<DigestToggle {...baseProps} digestEnabled={false} />);
    const toggle = screen.getByRole("switch");
    expect(toggle.hasAttribute("disabled")).toBe(false);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("ineligible 'no-team' → disabled + 'No team to manage' tooltip", () => {
    render(<DigestToggle {...baseProps} digestEligible={false} digestReason="no-team" />);
    const toggle = screen.getByRole("switch");
    expect(toggle.hasAttribute("disabled")).toBe(true);
    expect(toggle.getAttribute("title")).toMatch(/no team to manage/i);
  });

  it("ineligible 'not-eligible-role' → disabled + 'Role not eligible' tooltip", () => {
    render(<DigestToggle {...baseProps} digestEligible={false} digestReason="not-eligible-role" />);
    const toggle = screen.getByRole("switch");
    expect(toggle.hasAttribute("disabled")).toBe(true);
    expect(toggle.getAttribute("title")).toMatch(/role not eligible/i);
  });

  it("toggling fires PATCH /api/settings/digest-recipients with { userId, enabled:<new> }", async () => {
    render(<DigestToggle {...baseProps} digestEnabled={false} />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/settings/digest-recipients");
    expect(opts.method).toBe("PATCH");
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ userId: "u1", enabled: true }); // was off → toggling sends enabled:true
  });

  it("an ineligible toggle does NOT fire a PATCH", () => {
    render(<DigestToggle {...baseProps} digestEligible={false} digestReason="no-team" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
