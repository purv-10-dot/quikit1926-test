// @vitest-environment jsdom
/**
 * Composer contract for the dedicated "Log activity" page.
 *
 * The composer used to live inside <LogActivityModal>; it now renders on a
 * dedicated route via <LogActivityForm>. The modal wrapper (and its `open` /
 * onClose / onSuccess props) is gone — the form is always mounted and reports
 * completion via onDone. These tests carry over the modal's composer assertions
 * verbatim, only swapping the wrapper.
 *
 * Generic + Lead-log tabs collapsed into ONE type-driven "Activity" composer;
 * the SMB tab was removed. The /api/activities/smb-outreach + lead-log
 * endpoints SURVIVE with their own API tests — only the SMB UI is gone.
 *
 * Fetch is mocked per-test. The composer calls:
 *   GET /api/activities/types            -> list of active types
 *   GET /api/activities/types/[id]/fields -> a chosen type's field defs
 *   POST /api/activities                 -> { activityTypeId, fieldValues, ... }
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LogActivityForm } from "@/components/activities/log-activity-form";

// The real useToast returns a memoized (stable) object; mirror that here with a
// singleton so the composer's toast-dependent effects don't re-run every render.
const toastStub = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock("@/hooks/use-toast", () => ({ useToast: () => toastStub }));

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

function renderForm(props: Partial<React.ComponentProps<typeof LogActivityForm>> = {}) {
  return render(
    <LogActivityForm onDone={() => {}} onCancel={() => {}} {...props} />,
  );
}

beforeEach(() => installFetch());
afterEach(() => cleanup());

describe("<LogActivityForm> — single activity composer (SMB removed)", () => {
  // ---- tab/SMB removal: no tabs at all, no SMB anywhere ----
  it("renders no tabs — the activity composer is shown directly", () => {
    renderForm({ canViewLeads: false });
    // The segmented tab bar was removed along with SMB; there are no tabs.
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("does not render an SMB tab even when canViewLeads is true", () => {
    renderForm({ canViewLeads: true });
    expect(screen.queryByRole("tab", { name: /SMB/i })).toBeNull();
    expect(screen.queryByText(/^SMB$/)).toBeNull();
    // The activity composer itself is present (the record-link prompt shows).
    expect(screen.getByText(/appears on that record/i)).toBeTruthy();
  });

  // ---- record-picker (with types present) ----
  it("reuses the record picker (asserted with types present, not empty-CTA)", async () => {
    renderForm({ canViewLeads: true });
    // types present -> picker UI renders (the reused relatedKind/relatedObjectId selector)
    await waitFor(() => expect(screen.getByText("Link to")).toBeTruthy());
    expect(screen.getByText("Link to")).toBeTruthy();
  });

  // ---- Activity type-picker lists fetched types ----
  it("Activity composer shows a type-picker listing fetched types", async () => {
    renderForm({ canViewLeads: true });
    // the type-picker lists configured types from GET /api/activities/types
    await waitFor(() => expect(screen.getByText("Upwork Connect")).toBeTruthy());
  });

  // ---- pick -> fields render -> submit posts ----
  it("picking a type renders its fields and submitting posts activityTypeId + fieldValues", async () => {
    const calls = installFetch();
    // Pre-link a record via initialRelated so relatedObjectId is set (submit
    // requires a linked record); this keeps the test focused on type→fields→post
    // rather than driving the SearchableSelect.
    renderForm({
      canViewLeads: true,
      initialRelated: { kind: "Lead", id: "L1", label: "ACME" },
    });

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

    renderForm({ canViewLeads: true });

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
    renderForm({ canViewLeads: true });
    await waitFor(() => expect(screen.getByText(/no activity types configured/i)).toBeTruthy());
    // no type-picker in the empty state
    expect(screen.queryByText("Upwork Connect")).toBeNull();
  });

  // ---- SMB-REMOVAL guard: the composer must not surface SMB UI or call its API ----
  it("does not render SMB outreach fields nor fetch the SMB meta endpoint", async () => {
    const calls = installFetch();
    renderForm({ canViewLeads: true });

    // Wait for the activity types to load so all open-time effects have fired.
    await waitFor(() => expect(screen.getByText("Upwork Connect")).toBeTruthy());

    // No SMB-only fields (Disposition hierarchy / Competitor) are rendered.
    expect(screen.queryByText(/SMB outreach/i)).toBeNull();
    expect(screen.queryByText(/Sub-sub-disposition/i)).toBeNull();
    expect(screen.queryByText(/Competitor/i)).toBeNull();

    // And the SMB endpoints are never hit from this composer.
    expect(calls.some((c) => c.url.includes("/api/activities/smb-outreach"))).toBe(false);
  });
});
