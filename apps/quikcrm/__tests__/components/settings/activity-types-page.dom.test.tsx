// @vitest-environment jsdom
/**
 * T6 — RED-first jsdom component test for the activity-types settings page.
 *
 * Written BEFORE components/settings/activity-types-page.tsx exists → RED at
 * import. Pins ONLY the jsdom-provable component logic (per the agreed
 * jsdom/browser split). The rendered-page look, modal feel, nav slot, and
 * end-to-end-against-a-real-DB are Rishabh's browser checks — NOT asserted here.
 *
 * jsdom-provable behaviors locked:
 *   1. Empty-state CTA renders when the types fetch returns [].
 *   2. The types table renders rows from a mocked fetch.
 *   3. The adapted FieldEditorModal HIDES the showInList toggle (decision #8:
 *      the page passes showListColumnToggle={false}; state/payload/type stay
 *      intact, only the toggle is not rendered).
 *   4. Deleting a type calls DELETE on the right endpoint (mocked fetch).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ActivityTypesPageClient } from "@/components/settings/activity-types-page";

// Stable reference — mirrors the real useToast (context value built from
// useCallbacks). A fresh object per render would break the page's
// useCallback([toast]) memoization and create a render→effect→render loop.
const toastStub = { success: vi.fn(), error: vi.fn() };
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => toastStub,
}));

// jsdom has no window.confirm by default for delete flows.
vi.stubGlobal("confirm", vi.fn(() => true));

type FetchResult = { ok: boolean; json: () => Promise<unknown> };
let fetchMock: ReturnType<typeof vi.fn>;

function jsonOk(body: unknown): FetchResult {
  return { ok: true, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActivityTypesPageClient", () => {
  it("renders the empty-state CTA when no activity types exist", async () => {
    fetchMock.mockResolvedValue(jsonOk({ success: true, data: [] }));

    render(<ActivityTypesPageClient />);

    // Empty-state copy + a primary "New activity type" affordance. The page
    // intentionally shows this button twice (header + empty-state CTA), so
    // assert at least one is present rather than a single unique match.
    await waitFor(() =>
      expect(screen.getByText(/no activity types yet/i)).toBeTruthy(),
    );
    expect(
      screen.getAllByRole("button", { name: /new activity type/i }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("renders a row per activity type returned by the fetch", async () => {
    fetchMock.mockResolvedValue(
      jsonOk({
        success: true,
        data: [
          { id: "at1", code: "upwork_connect", label: "Upwork Connect", isActive: true, sortOrder: 0 },
          { id: "at2", code: "linkedin_dm", label: "LinkedIn DM", isActive: true, sortOrder: 10 },
        ],
      }),
    );

    render(<ActivityTypesPageClient />);

    await waitFor(() => expect(screen.getByText("Upwork Connect")).toBeTruthy());
    expect(screen.getByText("LinkedIn DM")).toBeTruthy();
  });

  it("opens the field editor with the showInList toggle HIDDEN (decision #8 adaptation)", async () => {
    // One type exists; selecting it reveals its fields + an add-field action.
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/fields")) return Promise.resolve(jsonOk({ success: true, data: [] }));
      return Promise.resolve(
        jsonOk({
          success: true,
          data: [{ id: "at1", code: "upwork_connect", label: "Upwork Connect", isActive: true, sortOrder: 0 }],
        }),
      );
    });

    render(<ActivityTypesPageClient />);
    await waitFor(() => expect(screen.getByText("Upwork Connect")).toBeTruthy());

    // Select the type to reveal its fields panel, then open the field editor.
    fireEvent.click(screen.getByText("Upwork Connect"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /new (custom )?field/i })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /new (custom )?field/i }));

    // The shared modal is open; the lead-only "Show as column in leads list"
    // toggle must NOT be rendered for activity fields.
    await waitFor(() => expect(screen.getByText(/new custom field/i)).toBeTruthy());
    expect(screen.queryByText(/show as column in leads list/i)).toBeNull();
  });

  it("calls DELETE on the correct endpoint when a type is deleted", async () => {
    fetchMock.mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === "DELETE") return Promise.resolve(jsonOk({ success: true, data: { id: "at1" } }));
      if (url.includes("/fields")) return Promise.resolve(jsonOk({ success: true, data: [] }));
      return Promise.resolve(
        jsonOk({
          success: true,
          data: [{ id: "at1", code: "upwork_connect", label: "Upwork Connect", isActive: true, sortOrder: 0 }],
        }),
      );
    });

    render(<ActivityTypesPageClient />);
    await waitFor(() => expect(screen.getByText("Upwork Connect")).toBeTruthy());

    // The type row exposes a Delete action.
    const row = screen.getByText("Upwork Connect").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /delete/i }));

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        ([, opts]) => (opts as { method?: string } | undefined)?.method === "DELETE",
      );
      expect(deleteCall).toBeTruthy();
      expect(String(deleteCall?.[0])).toContain("/api/settings/activity-types/at1");
    });
  });
});
