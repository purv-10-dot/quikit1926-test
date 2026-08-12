import { render, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CallWindow } from "./CallWindow";

// Mute/camera are controlled props (LiveKit owns the source of truth) — every
// render passes them explicitly rather than relying on internal state.
function baseProps() {
  return {
    callId: "test-call",
    remoteName: "Alice",
    remoteUserId: "alice-id",
    onEndCall: vi.fn(),
    isMuted: false,
    onToggleMute: vi.fn(),
    isCameraOff: false,
    onToggleCamera: vi.fn(),
  };
}

describe("CallWindow", () => {
  it("renders connecting state when no streams", () => {
    const { getByText } = render(
      <CallWindow {...baseProps()} localStream={null} remoteStream={null} />,
    );

    expect(getByText("Connecting...")).toBeTruthy();
  });

  it("renders participant tiles when streams provided", () => {
    const fakeStream = new MediaStream();
    const { getAllByTestId } = render(
      <CallWindow
        {...baseProps()}
        localStream={fakeStream}
        remoteStream={fakeStream}
        isRemoteSpeaking={true}
      />,
    );

    // Remote participant uses ActiveSpeaker when speaking, local uses ParticipantTile
    const tiles = getAllByTestId("participant-tile");
    const speakers = getAllByTestId("active-speaker");
    expect(tiles).toHaveLength(1);
    expect(speakers).toHaveLength(1);
  });

  it("renders remote name on tile", () => {
    const fakeStream = new MediaStream();
    const { getByText } = render(
      <CallWindow {...baseProps()} localStream={fakeStream} remoteStream={fakeStream} />,
    );

    expect(getByText("Alice")).toBeTruthy();
  });

  it("renders controls reflecting the controlled mute state", () => {
    const fakeStream = new MediaStream();
    const { getByLabelText, rerender } = render(
      <CallWindow {...baseProps()} localStream={fakeStream} remoteStream={fakeStream} />,
    );

    expect(getByLabelText("Mute microphone")).toBeTruthy();
    expect(getByLabelText("End call")).toBeTruthy();

    rerender(
      <CallWindow
        {...baseProps()}
        localStream={fakeStream}
        remoteStream={fakeStream}
        isMuted={true}
      />,
    );
    expect(getByLabelText("Unmute microphone")).toBeTruthy();
  });

  it("Space key calls onToggleMute", () => {
    const onToggleMute = vi.fn();
    const fakeStream = new MediaStream();
    render(
      <CallWindow
        {...baseProps()}
        localStream={fakeStream}
        remoteStream={fakeStream}
        onToggleMute={onToggleMute}
      />,
    );

    fireEvent.keyDown(window, { key: " " });
    expect(onToggleMute).toHaveBeenCalledOnce();
  });

  it("V key calls onToggleCamera", () => {
    const onToggleCamera = vi.fn();
    const fakeStream = new MediaStream();
    render(
      <CallWindow
        {...baseProps()}
        localStream={fakeStream}
        remoteStream={fakeStream}
        onToggleCamera={onToggleCamera}
      />,
    );

    fireEvent.keyDown(window, { key: "v" });
    expect(onToggleCamera).toHaveBeenCalledOnce();
  });

  it("H key ends call", () => {
    const onEndCall = vi.fn();
    const fakeStream = new MediaStream();
    render(
      <CallWindow
        {...baseProps()}
        localStream={fakeStream}
        remoteStream={fakeStream}
        onEndCall={onEndCall}
      />,
    );

    fireEvent.keyDown(window, { key: "h" });
    expect(onEndCall).toHaveBeenCalledOnce();
  });
});
