import type { MeetingDto } from "@/lib/shared";
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
    start: new Date(2026, 5, 20, 10, 0).toISOString(),
    end: new Date(2026, 5, 20, 10, 30).toISOString(),
    joinUrl: "https://meet.stub/abc",
    status: "scheduled",
    attendees: [
      { user: { id: "u-me", displayName: "Me", avatarUrl: null }, email: "me@x", rsvp: "accepted" },
      {
        user: { id: "u-bo", displayName: "Bo", avatarUrl: null },
        email: "bo@x",
        rsvp: "needs_action",
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
    const join = screen.getByRole("link", { name: /Join meeting/i });
    expect(join).toHaveAttribute("href", "https://meet.stub/abc");
    expect(screen.getByTestId("meeting-attendees").querySelectorAll("button")).toHaveLength(2);
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
