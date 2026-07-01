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

describe("<LogActivityModal> — single activity composer (SMB removed)", () => {
  // ---- tab/SMB removal: no tabs at all, no SMB anywhere ----
  it("renders no tabs — the activity composer is shown directly", () => {
    render(<LogActivityModal open canViewLeads={false} onClose={() => {}} onSuccess={() => {}} />);
    // The segmented tab bar was removed along with SMB; there are no tabs.
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("does not render an SMB tab even when canViewLeads is true", () => {
    render(<LogActivityModal open canViewLeads onClose={() => {}} onSuccess={() => {}} />);
    expect(screen.queryByRole("tab", { name: /SMB/i })).toBeNull();
    expect(screen.queryByText(/^SMB$/)).toBeNull();
    // The activity composer itself is present (the record-link prompt shows).
    expect(screen.getByText(/Link to a record/i)).toBeTruthy();
  });

  // ---- record-picker (with types present) ----
  it("reuses the record picker (asserted with types present, not empty-CTA)", async () => {
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

  // ---- DYNAMIC SWAP: changing the selected type swaps the rendered fields ----
  it("changing the Activity Type re-fetches and swaps the rendered fields (Call → Meeting)", async () => {
    // Two types with DISTINCT fields, routed per type id by the fetch mock.
    const CALL = { id: "call", code: "call", label: "Call", isActive: true, sortOrder: 0 };
    const MEETING = { id: "meeting", code: "meeting", label: "Meeting", isActive: true, sortOrder: 1 };
    const CALL_FIELDS = [
      { id: "f_dir", activityTypeId: "call", key: "direction", label: "Direction", fieldType: "Select", requirement: "Required", options: ["Incoming", "Outgoing"], visible: true, sortOrder: 0 },
    ];
    const MEETING_FIELDS = [
      { id: "f_loc", activityTypeId: "meeting", key: "location", label: "Location", fieldType: "Text", requirement: "Optional", options: null, visible: true, sortOrder: 0 },
    ];
    const fetchMock = vi.fn(async (url: string) => {
      const ok = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) }) as Response;
      if (url.includes("/types/call/fields")) return ok(CALL_FIELDS);
      if (url.includes("/types/meeting/fields")) return ok(MEETING_FIELDS);
      if (url.endsWith("/api/activities/types")) return ok([CALL, MEETING]);
      if (url.includes("picker")) return ok({ items: [] });
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LogActivityModal open canViewLeads onClose={() => {}} onSuccess={() => {}} />);

    const typeSelect = (await screen.findByLabelText("Type")) as HTMLSelectElement;

    // Select Call → its Direction field renders, Location does not.
    fireEvent.change(typeSelect, { target: { value: "call" } });
    await waitFor(() => expect(screen.getByText("Direction")).toBeTruthy());
    expect(screen.queryByText("Location")).toBeNull();

    // Switch to Meeting → fields swap: Location appears, Direction is gone.
    fireEvent.change(typeSelect, { target: { value: "meeting" } });
    await waitFor(() => expect(screen.getByText("Location")).toBeTruthy());
    expect(screen.queryByText("Direction")).toBeNull();
  });

  // ---- empty list -> CTA (UI half of the locked empty-state) ----
  it("renders the empty-state CTA when no activity types are configured", async () => {
    installFetch({ types: [] });
    render(<LogActivityModal open canViewLeads onClose={() => {}} onSuccess={() => {}} />);
    await waitFor(() => expect(screen.getByText(/no activity types configured/i)).toBeTruthy());
    // no type-picker in the empty state
    expect(screen.queryByText("Upwork Connect")).toBeNull();
  });

  // ---- SMB-REMOVAL guard: the modal must not surface SMB UI or call its API ----
  it("does not render SMB outreach fields nor fetch the SMB meta endpoint", async () => {
    const calls = installFetch();
    render(<LogActivityModal open canViewLeads onClose={() => {}} onSuccess={() => {}} />);

    // Wait for the activity types to load so all open-time effects have fired.
    await waitFor(() => expect(screen.getByText("Upwork Connect")).toBeTruthy());

    // No SMB-only fields (Disposition hierarchy / Competitor) are rendered.
    expect(screen.queryByText(/SMB outreach/i)).toBeNull();
    expect(screen.queryByText(/Sub-sub-disposition/i)).toBeNull();
    expect(screen.queryByText(/Competitor/i)).toBeNull();

    // And the SMB endpoints are never hit from this modal.
    expect(calls.some((c) => c.url.includes("/api/activities/smb-outreach"))).toBe(false);
  });
});
