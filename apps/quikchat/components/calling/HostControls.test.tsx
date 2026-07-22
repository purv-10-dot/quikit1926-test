import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HostControls } from "./HostControls";

describe("HostControls", () => {
  it("renders nothing when not admin", () => {
    const { container } = render(<HostControls isAdmin={false} onMuteAll={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders mute all button when admin", () => {
    render(<HostControls isAdmin={true} onMuteAll={vi.fn()} />);
    expect(screen.getByTestId("mute-all-button")).toBeTruthy();
    expect(screen.getByText("Mute All")).toBeTruthy();
  });

  it("calls onMuteAll when button clicked", () => {
    const onMuteAll = vi.fn();
    render(<HostControls isAdmin={true} onMuteAll={onMuteAll} />);
    fireEvent.click(screen.getByTestId("mute-all-button"));
    expect(onMuteAll).toHaveBeenCalled();
  });

  it("has correct aria-label", () => {
    render(<HostControls isAdmin={true} onMuteAll={vi.fn()} />);
    expect(screen.getByLabelText("Mute all participants")).toBeTruthy();
  });
});
