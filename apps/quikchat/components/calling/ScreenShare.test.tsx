import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ScreenShare } from "./ScreenShare";

describe("ScreenShare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders share button when not sharing", () => {
    render(<ScreenShare isSharing={false} onToggle={vi.fn()} />);
    expect(screen.getByText("Share Screen")).toBeTruthy();
  });

  it("renders stop button when sharing", () => {
    render(<ScreenShare isSharing={true} onToggle={vi.fn()} />);
    expect(screen.getByText("Stop Share")).toBeTruthy();
  });

  it("calls onToggle with null when stopping share", () => {
    const onToggle = vi.fn();
    render(<ScreenShare isSharing={true} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId("screen-share-btn"));
    expect(onToggle).toHaveBeenCalledWith(null);
  });

  it("calls onToggle with stream when starting share", async () => {
    const onToggle = vi.fn();
    const fakeStream = new MediaStream();
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getDisplayMedia: vi.fn().mockResolvedValue(fakeStream),
      },
      writable: true,
    });

    render(<ScreenShare isSharing={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId("screen-share-btn"));

    // Wait for the async operation
    await vi.waitFor(() => {
      expect(onToggle).toHaveBeenCalledWith(fakeStream);
    });
  });

  it("shows correct aria-label", () => {
    render(<ScreenShare isSharing={false} onToggle={vi.fn()} />);
    expect(screen.getByLabelText("Share screen")).toBeTruthy();

    render(<ScreenShare isSharing={true} onToggle={vi.fn()} />);
    expect(screen.getByLabelText("Stop screen share")).toBeTruthy();
  });
});
