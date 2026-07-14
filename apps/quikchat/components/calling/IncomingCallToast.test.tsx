import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IncomingCallToast } from "./IncomingCallToast";

describe("IncomingCallToast", () => {
  it("renders caller name and call type", () => {
    render(
      <IncomingCallToast
        callerName="Alice"
        callType="video"
        callId="call-1"
        onAccept={vi.fn()}
        onDecline={vi.fn()}
      />,
    );

    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Video call")).toBeTruthy();
  });

  it("renders audio call type", () => {
    render(
      <IncomingCallToast
        callerName="Bob"
        callType="audio"
        callId="call-2"
        onAccept={vi.fn()}
        onDecline={vi.fn()}
      />,
    );

    expect(screen.getByText("Audio call")).toBeTruthy();
  });

  it("calls onAccept when accept button clicked", () => {
    const onAccept = vi.fn();
    render(
      <IncomingCallToast
        callerName="Alice"
        callType="video"
        callId="call-1"
        onAccept={onAccept}
        onDecline={vi.fn()}
      />,
    );

    screen.getByLabelText("Accept call").click();
    expect(onAccept).toHaveBeenCalledWith("call-1");
  });

  it("calls onDecline when decline button clicked", () => {
    const onDecline = vi.fn();
    render(
      <IncomingCallToast
        callerName="Alice"
        callType="video"
        callId="call-1"
        onAccept={vi.fn()}
        onDecline={onDecline}
      />,
    );

    screen.getByLabelText("Decline call").click();
    expect(onDecline).toHaveBeenCalledWith("call-1");
  });

  it("auto-declines after 30s timeout", () => {
    vi.useFakeTimers();
    const onDecline = vi.fn();
    render(
      <IncomingCallToast
        callerName="Alice"
        callType="video"
        callId="call-1"
        onAccept={vi.fn()}
        onDecline={onDecline}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(onDecline).toHaveBeenCalledWith("call-1");
    vi.useRealTimers();
  });
});
