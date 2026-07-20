import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActiveSpeaker } from "./ActiveSpeaker";

describe("ActiveSpeaker", () => {
  it("renders speaker name", () => {
    render(<ActiveSpeaker id="u1" name="Alice" isMuted={false} hasVideo={false} isLocal={false} />);
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("renders local user with (You) suffix", () => {
    render(<ActiveSpeaker id="u1" name="Alice" isMuted={false} hasVideo={false} isLocal={true} />);
    expect(screen.getByText("Alice (You)")).toBeTruthy();
  });

  it("shows muted indicator when muted", () => {
    render(<ActiveSpeaker id="u1" name="Alice" isMuted={true} hasVideo={false} isLocal={false} />);
    expect(screen.getByLabelText("Muted")).toBeTruthy();
  });

  it("has data-speaking attribute", () => {
    render(<ActiveSpeaker id="u1" name="Alice" isMuted={false} hasVideo={false} isLocal={false} />);
    expect(screen.getByTestId("active-speaker").getAttribute("data-speaking")).toBe("true");
  });

  it("renders video when hasVideo is true with stream", () => {
    const fakeStream = new MediaStream();
    render(
      <ActiveSpeaker
        id="u1"
        name="Alice"
        isMuted={false}
        hasVideo={true}
        videoStream={fakeStream}
        isLocal={false}
      />,
    );
    expect(screen.getByTestId("active-speaker").querySelector("video")).toBeTruthy();
  });

  it("renders avatar when no video", () => {
    render(<ActiveSpeaker id="u1" name="Alice" isMuted={false} hasVideo={false} isLocal={false} />);
    expect(screen.getByLabelText("Alice")).toBeTruthy();
  });
});
