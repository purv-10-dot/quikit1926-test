import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ParticipantList, type Participant } from "./ParticipantList";

const mockParticipants: Participant[] = [
  { id: "1", identity: "user-1", name: "Alice", isMuted: false },
  { id: "2", identity: "user-2", name: "Bob", isMuted: true },
  { id: "3", identity: "user-3", name: "Carol", isMuted: false },
];

describe("ParticipantList", () => {
  it("renders all participants", () => {
    render(
      <ParticipantList
        participants={mockParticipants}
        currentUserId="user-1"
        isAdmin={false}
        onToggleMute={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId("participant-item")).toHaveLength(3);
    expect(screen.getByText("Alice (You)")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("Carol")).toBeTruthy();
  });

  it("shows muted indicator for muted participants", () => {
    render(
      <ParticipantList
        participants={mockParticipants}
        currentUserId="user-1"
        isAdmin={false}
        onToggleMute={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Muted")).toBeTruthy();
  });

  it("does not show admin controls for non-admins", () => {
    render(
      <ParticipantList
        participants={mockParticipants}
        currentUserId="user-1"
        isAdmin={false}
        onToggleMute={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("toggle-mute-button")).toBeNull();
    expect(screen.queryByTestId("remove-button")).toBeNull();
  });

  it("shows admin controls for admins", () => {
    render(
      <ParticipantList
        participants={mockParticipants}
        currentUserId="user-1"
        isAdmin={true}
        onToggleMute={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    // user-1 is self, so no controls for them
    // user-2 and user-3 should have controls
    expect(screen.getAllByTestId("toggle-mute-button")).toHaveLength(2);
    expect(screen.getAllByTestId("remove-button")).toHaveLength(2);
  });

  it("calls onToggleMute with correct args", () => {
    const onToggleMute = vi.fn();
    render(
      <ParticipantList
        participants={mockParticipants}
        currentUserId="user-1"
        isAdmin={true}
        onToggleMute={onToggleMute}
        onRemove={vi.fn()}
      />,
    );
    // Click unmute for Bob (muted) - should pass false to unmute
    const muteButtons = screen.getAllByTestId("toggle-mute-button");
    fireEvent.click(muteButtons[0]!);
    expect(onToggleMute).toHaveBeenCalledWith("user-2", false);
  });

  it("calls onRemove with correct identity", () => {
    const onRemove = vi.fn();
    render(
      <ParticipantList
        participants={mockParticipants}
        currentUserId="user-1"
        isAdmin={true}
        onToggleMute={vi.fn()}
        onRemove={onRemove}
      />,
    );
    const removeButtons = screen.getAllByTestId("remove-button");
    fireEvent.click(removeButtons[0]!);
    expect(onRemove).toHaveBeenCalledWith("user-2");
  });

  it("does not show controls for current user even if admin", () => {
    render(
      <ParticipantList
        participants={mockParticipants}
        currentUserId="user-2"
        isAdmin={true}
        onToggleMute={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    // user-2 is self, should not have mute/remove buttons
    // user-1 and user-3 should have controls
    expect(screen.getAllByTestId("toggle-mute-button")).toHaveLength(2);
  });
});
