import type { FreeBusyDto, PublicUser } from "@/lib/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = {
  fetchFreeBusy: vi.fn(),
  createMeetingApi: vi.fn(),
  fetchCalendarConnection: vi.fn(),
};
vi.mock("@/lib/api", () => ({
  fetchFreeBusy: (...a: unknown[]) => api.fetchFreeBusy(...a),
  createMeetingApi: (...a: unknown[]) => api.createMeetingApi(...a),
  fetchCalendarConnection: (...a: unknown[]) => api.fetchCalendarConnection(...a),
  MICROSOFT_CONNECT_URL: "/api/calendar/microsoft/connect",
}));

import { SchedulingModal } from "./SchedulingModal";

const me: PublicUser = { id: "u-me", displayName: "Me", avatarUrl: null };
const bo: PublicUser = { id: "u-bo", displayName: "Bo", avatarUrl: null };

function freeBusy(): FreeBusyDto {
  return {
    from: "x",
    to: "y",
    unknown: [],
    busy: {
      "u-me": [],
      "u-bo": [
        {
          start: new Date(2026, 5, 20, 10).toISOString(),
          end: new Date(2026, 5, 20, 11).toISOString(),
        },
      ],
    },
  };
}

function renderModal(onClose = vi.fn(), onCreated = vi.fn(), seed = [bo.id]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SchedulingModal
        channelId="c1"
        currentUserId={me.id}
        members={[me, bo]}
        seedAttendeeIds={seed}
        onClose={onClose}
        onCreated={onCreated}
      />
    </QueryClientProvider>,
  );
  return { onClose, onCreated };
}

afterEach(() => {
  vi.clearAllMocks();
});

/** The stub/Google shape: no per-user connect, so no banner is ever shown. */
const NO_CONNECT_NEEDED = {
  provider: "stub",
  requiresUserConnect: false,
  connected: false,
  email: null,
};

beforeEach(() => {
  // Default every test to the stub provider. Without a default, the connection
  // query resolves `undefined` and React Query logs "Query data cannot be
  // undefined" for each of the older tests — noise that would later hide a real
  // failure. Tests that care about the connection override this.
  api.fetchCalendarConnection.mockResolvedValue(NO_CONNECT_NEEDED);
});

describe("SchedulingModal (S15a)", () => {
  it("fetches free/busy for the chosen attendees and renders the grid", async () => {
    api.fetchFreeBusy.mockResolvedValue(freeBusy());
    renderModal();
    await waitFor(() => expect(api.fetchFreeBusy).toHaveBeenCalled());
    // Organizer + seeded attendee → both ids in the request.
    const ids = api.fetchFreeBusy.mock.calls[0]![0] as string[];
    expect(ids).toEqual(expect.arrayContaining(["u-me", "u-bo"]));
    await screen.findByTestId("freebusy-grid");
    await waitFor(() => expect(screen.getAllByTestId("fb-busy-u-bo")).toHaveLength(1));
  });

  it("excludes the assistant bot from the attendee list + free-busy (S15c)", async () => {
    api.fetchFreeBusy.mockResolvedValue(freeBusy());
    const bot: PublicUser = {
      id: "quikchat-assistant-bot",
      displayName: "Assistant",
      avatarUrl: null,
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <SchedulingModal
          channelId="c1"
          currentUserId={me.id}
          members={[me, bo, bot]}
          seedAttendeeIds={[bo.id]}
          onClose={vi.fn()}
          onCreated={vi.fn()}
        />
      </QueryClientProvider>,
    );
    // No attendee chip for the bot.
    expect(screen.queryByText("Assistant")).toBeNull();
    // The free-busy request never includes the bot id.
    await waitFor(() => expect(api.fetchFreeBusy).toHaveBeenCalled());
    const ids = api.fetchFreeBusy.mock.calls[0]![0] as string[];
    expect(ids).not.toContain("quikchat-assistant-bot");
  });

  it("pins the actions in the modal footer, not the scrolling body (S16)", async () => {
    api.fetchFreeBusy.mockResolvedValue(freeBusy());
    renderModal();
    const schedule = screen.getByRole("button", { name: /Schedule/i });
    // Actions live in the pinned modal foot…
    expect(schedule.closest(".qc-modal-foot")).not.toBeNull();
    // …never inside the internally-scrolling attendee/grid region.
    expect(schedule.closest(".qc-schedule__scroll")).toBeNull();
    // The grid sits in the scroll region; the title sits in the fixed top.
    await screen.findByTestId("freebusy-grid");
    expect(screen.getByTestId("freebusy-grid").closest(".qc-schedule__scroll")).not.toBeNull();
    expect(screen.getByLabelText("Meeting title").closest(".qc-schedule__top")).not.toBeNull();
  });

  it("requires a title before submitting", async () => {
    api.fetchFreeBusy.mockResolvedValue(freeBusy());
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /Schedule/i }));
    expect(await screen.findByText("Add a title")).toBeInTheDocument();
    expect(api.createMeetingApi).not.toHaveBeenCalled();
  });

  it("submits a create with the organizer's attendees + conferencing", async () => {
    api.fetchFreeBusy.mockResolvedValue(freeBusy());
    api.createMeetingApi.mockResolvedValue({ meeting: {}, message: {} });
    const { onClose, onCreated } = renderModal();

    fireEvent.change(screen.getByLabelText("Meeting title"), { target: { value: "Sync" } });
    fireEvent.click(screen.getByRole("button", { name: /Schedule/i }));

    await waitFor(() => expect(api.createMeetingApi).toHaveBeenCalled());
    const [channelId, body] = api.createMeetingApi.mock.calls[0]!;
    expect(channelId).toBe("c1");
    expect(body.title).toBe("Sync");
    expect(body.attendeeUserIds).toEqual(["u-bo"]);
    expect(body.conferencing).toBe(true);
    expect(typeof body.start).toBe("string");
    expect(new Date(body.end).getTime()).toBeGreaterThan(new Date(body.start).getTime());
    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

const ana: PublicUser = { id: "u-ana", displayName: "Ana", avatarUrl: null };

/**
 * These are pure DOM concerns — text matching and conditional rendering — with
 * no dependence on layout, so jsdom is genuinely adequate here. (The attendee
 * list lives inside `.qc-schedule__scroll`, whose scrolling jsdom cannot
 * observe; nothing below asserts anything about that.)
 */
function renderWithMembers(members: PublicUser[], seed: string[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SchedulingModal
        channelId="c1"
        currentUserId={me.id}
        members={members}
        seedAttendeeIds={seed}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("SchedulingModal — attendee filter", () => {
  it("narrows the candidate chips to name matches, case-insensitively", async () => {
    api.fetchFreeBusy.mockResolvedValue(freeBusy());
    api.fetchCalendarConnection.mockResolvedValue(NO_CONNECT_NEEDED);
    renderWithMembers([me, bo, ana]);

    expect(screen.getByRole("button", { name: /Bo/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ana/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter attendees"), { target: { value: "an" } });

    expect(screen.getByRole("button", { name: /Ana/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Bo$/ })).toBeNull();
    // The organizer chip is pinned and never filtered out.
    expect(screen.getByText(/Me \(you\)/)).toBeInTheDocument();
  });

  it("keeps an already-selected attendee selected when the filter hides them", async () => {
    // The bug this guards: deriving attendees from the RENDERED chips instead of
    // the selection Set would silently drop people as the organizer types.
    api.fetchFreeBusy.mockResolvedValue(freeBusy());
    api.fetchCalendarConnection.mockResolvedValue(NO_CONNECT_NEEDED);
    api.createMeetingApi.mockResolvedValue({ meeting: {}, message: {} });
    renderWithMembers([me, bo, ana], [bo.id]);

    // Filter Bo out of view entirely.
    fireEvent.change(screen.getByLabelText("Filter attendees"), { target: { value: "ana" } });
    expect(screen.queryByRole("button", { name: /^Bo$/ })).toBeNull();

    fireEvent.change(screen.getByLabelText("Meeting title"), { target: { value: "Sync" } });
    fireEvent.click(screen.getByRole("button", { name: /Schedule/i }));

    await waitFor(() => expect(api.createMeetingApi).toHaveBeenCalled());
    const [, body] = api.createMeetingApi.mock.calls[0]!;
    expect(body.attendeeUserIds).toEqual(["u-bo"]);
  });

  it("says so when nothing matches, rather than rendering an empty row", async () => {
    api.fetchFreeBusy.mockResolvedValue(freeBusy());
    api.fetchCalendarConnection.mockResolvedValue(NO_CONNECT_NEEDED);
    renderWithMembers([me, bo, ana]);

    fireEvent.change(screen.getByLabelText("Filter attendees"), { target: { value: "zzz" } });

    expect(screen.getByTestId("attendee-no-match")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Bo$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Ana$/ })).toBeNull();
  });
});

describe("SchedulingModal — calendar connect precondition", () => {
  it("offers a Connect action when the provider needs a per-user connection", async () => {
    // The CALENDAR_MODE=microsoft regression: without this the submit failed
    // with a relayed provider string ("Organizer has not connected a Microsoft
    // calendar") that told the user nothing they could act on.
    api.fetchFreeBusy.mockResolvedValue(freeBusy());
    api.fetchCalendarConnection.mockResolvedValue({
      provider: "microsoft",
      requiresUserConnect: true,
      connected: false,
      email: null,
    });
    renderWithMembers([me, bo]);

    expect(await screen.findByTestId("calendar-connect-cta")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Connect your Microsoft calendar/i }),
    ).toBeInTheDocument();
    // Non-blocking: scheduling must still be attemptable, because the cached
    // answer can be stale.
    expect(screen.getByRole("button", { name: /Schedule/i })).toBeEnabled();
  });

  it("shows nothing once connected", async () => {
    api.fetchFreeBusy.mockResolvedValue(freeBusy());
    api.fetchCalendarConnection.mockResolvedValue({
      provider: "microsoft",
      requiresUserConnect: true,
      connected: true,
      email: "me@corp.test",
    });
    renderWithMembers([me, bo]);

    await waitFor(() => expect(api.fetchCalendarConnection).toHaveBeenCalled());
    expect(screen.queryByTestId("calendar-connect-cta")).toBeNull();
  });

  it("fails open when the connection probe errors (module-gated 403)", async () => {
    // /api/calendar/connection is gated on moduleKey "calendar" and 403s when
    // the module is off. A failed probe must never assert "not connected" or
    // block scheduling.
    api.fetchFreeBusy.mockResolvedValue(freeBusy());
    api.fetchCalendarConnection.mockRejectedValue(new Error("GET … → 403"));
    renderWithMembers([me, bo]);

    await waitFor(() => expect(api.fetchCalendarConnection).toHaveBeenCalled());
    expect(screen.queryByTestId("calendar-connect-cta")).toBeNull();
    expect(screen.getByRole("button", { name: /Schedule/i })).toBeEnabled();
  });
});
