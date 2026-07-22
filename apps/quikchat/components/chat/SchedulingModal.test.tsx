import type { FreeBusyDto, PublicUser } from "@/lib/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = { fetchFreeBusy: vi.fn(), createMeetingApi: vi.fn() };
vi.mock("@/lib/api", () => ({
  fetchFreeBusy: (...a: unknown[]) => api.fetchFreeBusy(...a),
  createMeetingApi: (...a: unknown[]) => api.createMeetingApi(...a),
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
