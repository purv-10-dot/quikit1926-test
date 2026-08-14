import type { MeetingAttendeeDto, MeetingDto } from "@/lib/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = { rsvpMeetingApi: vi.fn() };
vi.mock("@/lib/api", () => ({
  rsvpMeetingApi: (...a: unknown[]) => api.rsvpMeetingApi(...a),
}));

import { ProfileProvider } from "@/components/profile/ProfileProvider";
import { MeetingCard } from "./MeetingCard";

function meeting(over: Partial<MeetingDto> = {}): MeetingDto {
  return {
    id: "m1",
    channelId: "c1",
    organizerId: "u-me",
    title: "Roadmap sync",
    description: "Q3 planning",
    location: null,
    allDay: false,
    start: new Date(2026, 5, 20, 10, 0).toISOString(),
    end: new Date(2026, 5, 20, 10, 30).toISOString(),
    joinUrl: "https://meet.stub/abc",
    status: "scheduled",
    attendees: [
      { user: { id: "u-me", displayName: "Me", avatarUrl: null }, email: "me@x", rsvp: "accepted", optional: false },
      {
        user: { id: "u-bo", displayName: "Bo", avatarUrl: null },
        email: "bo@x",
        rsvp: "needs_action", optional: false,
      },
    ],
    ...over,
  };
}

function renderCard(m: MeetingDto, currentUserId = "u-bo") {
  return render(
    <ProfileProvider currentUserId={currentUserId}>
      <MeetingCard meeting={m} currentUserId={currentUserId} />
    </ProfileProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("MeetingCard (S15a)", () => {
  it("renders title, description, join link, and attendee avatars", () => {
    renderCard(meeting());
    expect(screen.getByText("Roadmap sync")).toBeInTheDocument();
    expect(screen.getByText("Q3 planning")).toBeInTheDocument();
    // Two join links, and the ORDER matters. `meeting.joinUrl` is a Teams link
    // by construction (Graph answers `isOnlineMeeting` with Teams), so leading
    // with it sent users out of the product and into the competitor. The
    // QuikChat one must come first in the DOM and point at the stable
    // meeting-scoped address that is safe to paste into a calendar invite.
    const links = screen.getAllByRole("link", { name: /^Join in/ });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/meeting/m1/join",
      "https://meet.stub/abc",
    ]);
    expect(screen.getByRole("link", { name: "Join in QuikChat" })).toHaveAttribute(
      "href",
      "/meeting/m1/join",
    );
    expect(screen.getByTestId("meeting-attendees").querySelectorAll("button")).toHaveLength(2);
  });

  it("still offers the QuikChat join when the provider returned no Teams link", () => {
    // Dropping `isOnlineMeeting` in microsoft.ts (Option A, later) makes
    // joinUrl null. The in-product join must not depend on it.
    renderCard(meeting({ joinUrl: null }));
    expect(screen.getByRole("link", { name: "Join in QuikChat" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Join in Teams" })).toBeNull();
  });

  it("RSVP buttons patch the server and reflect the selection optimistically", async () => {
    api.rsvpMeetingApi.mockResolvedValue(meeting());
    renderCard(meeting());
    const accept = screen.getByRole("button", { name: "Accept" });
    fireEvent.click(accept);
    await waitFor(() => expect(api.rsvpMeetingApi).toHaveBeenCalledWith("m1", "accepted"));
    // Selected option becomes the primary (active) button.
    expect(screen.getByRole("button", { name: "Accept" }).className).toMatch(/primary/);
  });

  it("hides RSVP controls for a non-attendee viewer", () => {
    renderCard(meeting(), "u-stranger");
    expect(screen.queryByRole("group", { name: "Your RSVP" })).toBeNull();
  });

  it("shows a cancelled state and hides the join link", () => {
    renderCard(meeting({ status: "cancelled" }), "u-me");
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Join meeting/i })).toBeNull();
  });
});

describe("MeetingCard — location, all-day, optional attendees", () => {
  const att = (id: string, over: Partial<MeetingAttendeeDto> = {}): MeetingAttendeeDto => ({
    user: { id, displayName: id, avatarUrl: null },
    email: `${id}@x.com`,
    rsvp: "accepted",
    optional: false,
    ...over,
  });

  it("renders a location line only when there is one", () => {
    const { rerender } = render(
      <ProfileProvider currentUserId="u-me">
        <MeetingCard meeting={meeting({ location: "Room 4" })} currentUserId="u-me" />
      </ProfileProvider>,
    );
    expect(screen.getByText("Room 4")).toBeInTheDocument();

    rerender(
      <ProfileProvider currentUserId="u-me">
        <MeetingCard meeting={meeting({ location: null })} currentUserId="u-me" />
      </ProfileProvider>,
    );
    expect(screen.queryByText("Room 4")).toBeNull();
  });

  /**
   * The rendering half of the all-day fix. `MeetingDto.end` is INCLUSIVE, so a
   * one-day event on the 14th arrives as 14th → 14th and must read as a single
   * date — never "14 – 15", and never the 13th (which is what a local-zone
   * render shows a UTC−5 viewer).
   */
  it("renders an all-day meeting as a whole date, not a time range", () => {
    render(
      <ProfileProvider currentUserId="u-me">
        <MeetingCard
          meeting={meeting({
            allDay: true,
            start: "2026-08-14T00:00:00.000Z",
            end: "2026-08-14T00:00:00.000Z",
          })}
          currentUserId="u-me"
        />
      </ProfileProvider>,
    );
    const card = screen.getByTestId("meeting-card");
    expect(card.textContent).toContain("All day");
    expect(card.textContent).toContain("14");
    expect(card.textContent).not.toContain("13");
    // No clock times for an all-day event.
    expect(card.textContent).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("still renders times for a timed meeting", () => {
    render(
      <ProfileProvider currentUserId="u-me">
        <MeetingCard meeting={meeting({ allDay: false })} currentUserId="u-me" />
      </ProfileProvider>,
    );
    expect(screen.getByTestId("meeting-card").textContent).not.toContain("All day");
  });

  it("sorts optional attendees after required ones and labels them", () => {
    render(
      <ProfileProvider currentUserId="u-me">
        <MeetingCard
          meeting={meeting({
            attendees: [att("opt-a", { optional: true }), att("req-b"), att("req-c")],
          })}
          currentUserId="u-me"
        />
      </ProfileProvider>,
    );
    const names = Array.from(
      screen.getByTestId("meeting-attendees").querySelectorAll("button"),
    ).map((b) => b.getAttribute("aria-label"));

    // Required first — position carries the distinction.
    expect(names[0]).toContain("req-b");
    expect(names[2]).toContain("opt-a");
    expect(names[2]).toContain("Optional");
    expect(names[0]).not.toContain("Optional");
  });

  it("shows the required/optional counts ONLY when someone is optional", () => {
    const { rerender } = render(
      <ProfileProvider currentUserId="u-me">
        <MeetingCard
          meeting={meeting({ attendees: [att("a"), att("b", { optional: true })] })}
          currentUserId="u-me"
        />
      </ProfileProvider>,
    );
    expect(screen.getByText("1 required · 1 optional")).toBeInTheDocument();

    // Nothing new renders for the common case.
    rerender(
      <ProfileProvider currentUserId="u-me">
        <MeetingCard
          meeting={meeting({ attendees: [att("a"), att("b")] })}
          currentUserId="u-me"
        />
      </ProfileProvider>,
    );
    expect(screen.queryByText(/required ·/)).toBeNull();
  });
});
