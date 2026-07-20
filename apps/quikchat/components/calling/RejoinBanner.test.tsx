import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { RejoinBanner } from "./RejoinBanner";

describe("RejoinBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockCall = {
    callId: "call-123",
    channelId: "ch-1",
    channelName: "general",
    type: "video" as const,
    participantCount: 3,
    startedAt: new Date().toISOString(),
  };

  it("renders channel name and participant count", () => {
    render(<RejoinBanner activeCall={mockCall} onRejoin={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText(/#general/)).toBeTruthy();
    expect(screen.getByText(/3 participants/)).toBeTruthy();
  });

  it("renders audio call type", () => {
    render(
      <RejoinBanner
        activeCall={{ ...mockCall, type: "audio" }}
        onRejoin={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText(/audio call/)).toBeTruthy();
  });

  it("calls onRejoin when Rejoin button clicked", () => {
    const onRejoin = vi.fn();
    render(<RejoinBanner activeCall={mockCall} onRejoin={onRejoin} onDismiss={vi.fn()} />);

    screen.getByText("Rejoin").click();
    expect(onRejoin).toHaveBeenCalledWith("call-123");
  });

  it("calls onDismiss when Dismiss button clicked", () => {
    const onDismiss = vi.fn();
    render(<RejoinBanner activeCall={mockCall} onRejoin={vi.fn()} onDismiss={onDismiss} />);

    screen.getByLabelText("Dismiss").click();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("auto-dismisses after 30 seconds", () => {
    const onDismiss = vi.fn();
    render(<RejoinBanner activeCall={mockCall} onRejoin={vi.fn()} onDismiss={onDismiss} />);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(onDismiss).toHaveBeenCalled();
  });

  it("shows countdown timer", () => {
    render(<RejoinBanner activeCall={mockCall} onRejoin={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByText("30s")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(screen.getByText("25s")).toBeTruthy();
  });
});
