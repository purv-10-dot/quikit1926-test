import { render, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CallWindow } from "./CallWindow";

describe("CallWindow", () => {
  it("renders connecting state when no streams", () => {
    const { getByText } = render(
      <CallWindow
        callId="test-call"
        localStream={null}
        remoteStream={null}
        remoteName="Alice"
        remoteUserId="alice-id"
        onEndCall={vi.fn()}
      />,
    );

    expect(getByText("Connecting...")).toBeTruthy();
  });

  it("renders participant tiles when streams provided", () => {
    const fakeStream = new MediaStream();
    const { getAllByTestId } = render(
      <CallWindow
        callId="test-call"
        localStream={fakeStream}
        remoteStream={fakeStream}
        remoteName="Alice"
        remoteUserId="alice-id"
        isRemoteSpeaking={true}
        onEndCall={vi.fn()}
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
      <CallWindow
        callId="test-call"
        localStream={fakeStream}
        remoteStream={fakeStream}
        remoteName="Alice"
        remoteUserId="alice-id"
        onEndCall={vi.fn()}
      />,
    );

    expect(getByText("Alice")).toBeTruthy();
  });

  it("renders controls", () => {
    const fakeStream = new MediaStream();
    const { getByLabelText } = render(
      <CallWindow
        callId="test-call"
        localStream={fakeStream}
        remoteStream={fakeStream}
        remoteName="Alice"
        remoteUserId="alice-id"
        onEndCall={vi.fn()}
      />,
    );

    expect(getByLabelText("Mute microphone")).toBeTruthy();
    expect(getByLabelText("End call")).toBeTruthy();
  });

  it("Space key toggles mute", () => {
    const fakeStream = new MediaStream();
    const { getByLabelText } = render(
      <CallWindow
        callId="test-call"
        localStream={fakeStream}
        remoteStream={fakeStream}
        remoteName="Alice"
        remoteUserId="alice-id"
        onEndCall={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: " " });
    expect(getByLabelText("Unmute microphone")).toBeTruthy();

    fireEvent.keyDown(window, { key: " " });
    expect(getByLabelText("Mute microphone")).toBeTruthy();
  });

  it("H key ends call", () => {
    const onEndCall = vi.fn();
    const fakeStream = new MediaStream();
    render(
      <CallWindow
        callId="test-call"
        localStream={fakeStream}
        remoteStream={fakeStream}
        remoteName="Alice"
        remoteUserId="alice-id"
        onEndCall={onEndCall}
      />,
    );

    fireEvent.keyDown(window, { key: "h" });
    expect(onEndCall).toHaveBeenCalledOnce();
  });
});
