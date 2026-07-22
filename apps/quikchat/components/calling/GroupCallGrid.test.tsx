import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupCallGrid, type Participant } from "./GroupCallGrid";

const makeParticipant = (
  id: string,
  name: string,
  overrides?: Partial<Participant>,
): Participant => ({
  id,
  name,
  isSpeaking: false,
  isMuted: false,
  hasVideo: true,
  hasScreenShare: false,
  ...overrides,
});

describe("GroupCallGrid", () => {
  it("renders single participant full-width", () => {
    const participants = [makeParticipant("u1", "Alice")];
    render(<GroupCallGrid participants={participants} localUserId="u1" />);
    expect(screen.getAllByTestId("participant-tile")).toHaveLength(1);
  });

  it("renders two participants side by side", () => {
    const participants = [makeParticipant("u1", "Alice"), makeParticipant("u2", "Bob")];
    render(<GroupCallGrid participants={participants} localUserId="u1" />);
    expect(screen.getAllByTestId("participant-tile")).toHaveLength(2);
  });

  it("renders 3-4 participants in grid", () => {
    const participants = [
      makeParticipant("u1", "Alice"),
      makeParticipant("u2", "Bob"),
      makeParticipant("u3", "Carol"),
    ];
    render(<GroupCallGrid participants={participants} localUserId="u1" />);
    expect(screen.getAllByTestId("participant-tile")).toHaveLength(3);
  });

  it("renders 5+ participants in compact grid", () => {
    const participants = Array.from({ length: 6 }, (_, i) => makeParticipant(`u${i}`, `User ${i}`));
    render(<GroupCallGrid participants={participants} localUserId="u1" />);
    expect(screen.getAllByTestId("participant-tile")).toHaveLength(6);
  });

  it("highlights active speaker", () => {
    const participants = [
      makeParticipant("u1", "Alice", { isSpeaking: true }),
      makeParticipant("u2", "Bob"),
    ];
    render(<GroupCallGrid participants={participants} localUserId="u1" />);
    const tiles = screen.getAllByTestId("participant-tile");
    expect(tiles[0]!.getAttribute("data-speaking")).toBe("true");
  });

  it("shows muted indicator", () => {
    const participants = [makeParticipant("u1", "Alice", { isMuted: true })];
    render(<GroupCallGrid participants={participants} localUserId="u1" />);
    expect(screen.getByLabelText("Muted")).toBeTruthy();
  });

  it("shows avatar for participants without video", () => {
    const participants = [makeParticipant("u1", "Alice", { hasVideo: false })];
    render(<GroupCallGrid participants={participants} localUserId="u1" />);
    expect(screen.getByLabelText("Alice")).toBeTruthy();
  });
});

describe("GroupCallGrid — admin controls", () => {
  const participants = [
    makeParticipant("u1", "Alice"),
    makeParticipant("u2", "Bob"),
    makeParticipant("u3", "Carol"),
  ];

  it("does not show sidebar when showParticipantList is false", () => {
    render(
      <GroupCallGrid participants={participants} localUserId="u1" showParticipantList={false} />,
    );
    expect(screen.queryByTestId("group-call-sidebar")).toBeNull();
  });

  it("shows sidebar when showParticipantList is true", () => {
    render(
      <GroupCallGrid
        participants={participants}
        localUserId="u1"
        showParticipantList={true}
        onToggleMute={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByTestId("group-call-sidebar")).toBeTruthy();
    expect(screen.getByTestId("participant-list")).toBeTruthy();
  });

  it("shows HostControls for admin", () => {
    render(
      <GroupCallGrid
        participants={participants}
        localUserId="u1"
        isAdmin={true}
        showParticipantList={true}
        onMuteAll={vi.fn()}
        onToggleMute={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByTestId("host-controls")).toBeTruthy();
    expect(screen.getByTestId("mute-all-button")).toBeTruthy();
  });

  it("hides HostControls for non-admin", () => {
    render(
      <GroupCallGrid
        participants={participants}
        localUserId="u1"
        isAdmin={false}
        showParticipantList={true}
        onToggleMute={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("host-controls")).toBeNull();
  });

  it("calls onMuteAll when mute all clicked", () => {
    const onMuteAll = vi.fn();
    render(
      <GroupCallGrid
        participants={participants}
        localUserId="u1"
        isAdmin={true}
        showParticipantList={true}
        onMuteAll={onMuteAll}
        onToggleMute={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("mute-all-button"));
    expect(onMuteAll).toHaveBeenCalled();
  });

  it("shows per-participant mute/remove for admin", () => {
    render(
      <GroupCallGrid
        participants={participants}
        localUserId="u1"
        isAdmin={true}
        showParticipantList={true}
        onMuteAll={vi.fn()}
        onToggleMute={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const muteButtons = screen.getAllByTestId("toggle-mute-button");
    const removeButtons = screen.getAllByTestId("remove-button");
    expect(muteButtons).toHaveLength(2);
    expect(removeButtons).toHaveLength(2);
  });

  it("does not show controls for self", () => {
    render(
      <GroupCallGrid
        participants={participants}
        localUserId="u1"
        isAdmin={true}
        showParticipantList={true}
        onMuteAll={vi.fn()}
        onToggleMute={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId("toggle-mute-button")).toHaveLength(2);
  });
});
