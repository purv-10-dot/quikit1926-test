import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CallControls } from "./CallControls";

describe("CallControls", () => {
  it("renders mute, camera, and end call buttons", () => {
    render(
      <CallControls
        isMuted={false}
        isCameraOff={false}
        onToggleMute={vi.fn()}
        onToggleCamera={vi.fn()}
        onEndCall={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Mute microphone")).toBeTruthy();
    expect(screen.getByLabelText("Turn off camera")).toBeTruthy();
    expect(screen.getByLabelText("End call")).toBeTruthy();
  });

  it("shows unmute label when muted", () => {
    render(
      <CallControls
        isMuted={true}
        isCameraOff={false}
        onToggleMute={vi.fn()}
        onToggleCamera={vi.fn()}
        onEndCall={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Unmute microphone")).toBeTruthy();
  });

  it("shows turn-on-camera label when camera is off", () => {
    render(
      <CallControls
        isMuted={false}
        isCameraOff={true}
        onToggleMute={vi.fn()}
        onToggleCamera={vi.fn()}
        onEndCall={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Turn on camera")).toBeTruthy();
  });

  it("calls onToggleMute when mute button clicked", () => {
    const onToggleMute = vi.fn();
    render(
      <CallControls
        isMuted={false}
        isCameraOff={false}
        onToggleMute={onToggleMute}
        onToggleCamera={vi.fn()}
        onEndCall={vi.fn()}
      />,
    );

    screen.getByLabelText("Mute microphone").click();
    expect(onToggleMute).toHaveBeenCalledOnce();
  });

  it("calls onToggleCamera when camera button clicked", () => {
    const onToggleCamera = vi.fn();
    render(
      <CallControls
        isMuted={false}
        isCameraOff={false}
        onToggleMute={vi.fn()}
        onToggleCamera={onToggleCamera}
        onEndCall={vi.fn()}
      />,
    );

    screen.getByLabelText("Turn off camera").click();
    expect(onToggleCamera).toHaveBeenCalledOnce();
  });

  it("calls onEndCall when end button clicked", () => {
    const onEndCall = vi.fn();
    render(
      <CallControls
        isMuted={false}
        isCameraOff={false}
        onToggleMute={vi.fn()}
        onToggleCamera={vi.fn()}
        onEndCall={onEndCall}
      />,
    );

    screen.getByLabelText("End call").click();
    expect(onEndCall).toHaveBeenCalledOnce();
  });
});
