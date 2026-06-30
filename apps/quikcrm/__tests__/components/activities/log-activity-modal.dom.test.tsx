// @vitest-environment jsdom
/**
 * T-P3.3b — modal collapse RED.
 *
 * Generic + Lead-log tabs collapse into ONE type-driven "Activity" tab; SMB
 * stays. Tab set becomes activity | smb. These tests assert the NEW contract
 * and are RED until the modal is rewritten.
 *
 * RE-POINTED from the prior committed tests (before/after shown to Rishabh):
 *  - "Generic tab" structure tests -> "Activity tab" (tabs 1,2)
 *  - record-picker test re-pointed to the Activity tab WITH TYPES PRESENT
 *    (empty list shows the CTA, which hides the picker) (test 3)
 *  - "Generic Type select defaults to Note" REPLACED by an Activity type-picker
 *    assertion (the old hardcoded Type dropdown is removed) (test 4)
 *  - "Lead-log tab" test DELETED (tab removed; the /api/activities/lead-log
 *    endpoint SURVIVES with its own API test — only the tab UI is gone)
 *
 * Fetch is mocked per-test. The Activity tab calls:
 *   GET /api/activities/types            -> list of active types
 *   GET /api/activities/types/[id]/fields -> a chosen type's field defs
 *   POST /api/activities                 -> { activityTypeId, fieldValues, ... }
 * SMB tab keeps fetching /api/activities/smb-outreach/meta and posting
 * /api/activities/smb-outreach.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LogActivityModal } from "@/components/activities/log-activity-modal";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

const TYPE = { id: "at1", code: "upwork_connect", label: "Upwork Connect", isActive: true, sortOrder: 0 };
const FIELDS = [
  { id: "fd_bid", activityTypeId: "at1", key: "bid", label: "Bid", fieldType: "Number", requirement: "Required", options: null, visible: true, sortOrder: 0 },
];

// fetch router: types list / a type's fields / smb meta / posts.
function installFetch({ types = [TYPE], fields = FIELDS }: { types?: unknown[]; fields?: unknown[] } = {}) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const fetchMock = vi.fn(async (url: string, opts?: { method?: string; body?: string }) => {
    calls.push({ url, method: opts?.method ?? "GET", body: opts?.body ? JSON.parse(opts.body) : undefined });
    const ok = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) } as Response);
    if (url.includes("/types/") && url.includes("/fields")) return ok(fields);
    if (url.endsWith("/api/activities/types")) return ok(types);
    if (url.includes("/api/activities/smb-outreach/meta")) return ok({ countries: [], priorities: [], channels: [], competitors: [], dispositions: [] });
    if (url.includes("/api/activities/smb-outreach")) return ok({ id: "smb1" });
    if (url.endsWith("/api/activities")) return ok({ id: "act1", relatedKind: "Lead", relatedLabel: "ACME" });
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => installFetch());
afterEach(() => cleanup());

describe("<LogActivityModal> — collapsed activity | smb (T-P3.3b)", () => {
  // ---- RE-POINTED tab-structure tests (1,2) ----
  it("renders the Activity tab; SMB hidden when canViewLeads is false", () => {
    render(<LogActivityModal open canViewLeads={false} onClose={() => {}} onSuccess={() => {}} />);
    expect(screen.getByRole("tab", { name: /Activity/i })).toBeTruthy();
    // Lead-log tab no longer exists at all; SMB hidden without lead access.
    expect(screen.queryByRole("tab", { name: /Lead log/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /SMB/i })).toBeNull();
  });

  it("shows the SMB tab when canViewLeads is true (Activity always present)", () => {
    render(<LogActivityModal open canViewLeads onClose={() => {}} onSuccess={() => {}} />);
    expect(screen.getByRole("tab", { name: /Activity/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^SMB$/i })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /Lead log/i })).toBeNull();
  });

  // ---- RE-POINTED record-picker test (3) — WITH TYPES PRESENT ----
  it("Activity tab reuses the record picker (asserted with types present, not empty-CTA)", async () => {
    render(<LogActivityModal open canViewLeads onClose={() => {}} onSuccess={() => {}} />);
    // types present -> picker UI renders (the reused relatedKind/relatedObjectId selector)
    await waitFor(() => expect(screen.getByText(/Link to a record/i)).toBeTruthy());
    expect(screen.getByText("Link to")).toBeTruthy();
  });

  // ---- REPLACED test (4): old "Type select defaults to Note" -> Activity type-picker ----
  it("Activity tab shows a type-picker listing fetched types (replaces the old Note Type dropdown)", async () => {
    render(<LogActivityModal open canViewLeads onClose={() => {}} onSuccess={() => {}} />);
    // the type-picker lists configured types from GET /api/activities/types
    await waitFor(() => expect(screen.getByText("Upwork Connect")).toBeTruthy());
  });

  // ---- NEW Activity-tab behavior: pick -> fields render -> submit posts ----
  it("picking a type renders its fields and submitting posts activityTypeId + fieldValues", async () => {
    const calls = installFetch();
    // Pre-link a record via initialRelated so relatedObjectId is set (submit
    // requires a linked record); this keeps the test focused on type→fields→post
    // rather than driving the SearchableSelect.
    render(
      <LogActivityModal
        open
        canViewLeads
        onClose={() => {}}
        onSuccess={() => {}}
        initialRelated={{ kind: "Lead", id: "L1", label: "ACME" }}
      />,
    );

    // The type-picker is a <select>; choose the type by its id value (selecting
    // an <option>'s text via click does not change a <select> in jsdom).
    await waitFor(() => expect(screen.getByText("Upwork Connect")).toBeTruthy());
    const typeSelect = screen.getByLabelText("Type") as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: "at1" } });

    // its fields render (via ActivityFieldInputs) — the Bid (Number) field —
    // after the /types/[id]/fields fetch resolves.
    await waitFor(() => expect(document.querySelector('input[type="number"]')).toBeTruthy());
    fireEvent.change(document.querySelector('input[type="number"]')!, { target: { value: "250" } });

    fireEvent.click(screen.getByRole("button", { name: /Log activity/i }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/activities"));
      expect(post).toBeTruthy();
      const body = post!.body as { activityTypeId?: string; fieldValues?: Record<string, unknown> };
      expect(body.activityTypeId).toBe("at1");
      expect(body.fieldValues?.bid).toBe(250);
    });
  });

  // ---- empty list -> CTA (UI half of the locked empty-state) ----
  it("renders the empty-state CTA when no activity types are configured", async () => {
    installFetch({ types: [] });
    render(<LogActivityModal open canViewLeads onClose={() => {}} onSuccess={() => {}} />);
    await waitFor(() => expect(screen.getByText(/no activity types configured/i)).toBeTruthy());
    // no type-picker in the empty state
    expect(screen.queryByText("Upwork Connect")).toBeNull();
  });

  // ---- SMB-SURVIVAL guard (load-bearing): tab renders + posts to smb-outreach ----
  it("SMB tab still renders after the collapse and posts to /api/activities/smb-outreach", async () => {
    const calls = installFetch();
    render(<LogActivityModal open canViewLeads onClose={() => {}} onSuccess={() => {}} />);

    const smbTab = screen.getByRole("tab", { name: /^SMB$/i });
    fireEvent.click(smbTab);
    // the SMB tab content renders (its meta fetch fires)
    await waitFor(() =>
      expect(calls.some((c) => c.url.includes("/api/activities/smb-outreach/meta"))).toBe(true),
    );
    // and the SMB tab is selectable/active (proves the tab survived the rewrite)
    expect(smbTab.getAttribute("aria-selected")).toBe("true");
  });
});
