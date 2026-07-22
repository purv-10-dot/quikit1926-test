import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { RemovedFromCallToast } from "./RemovedFromCallToast";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RemovedFromCallToast", () => {
  it("renders removal message with channel name", () => {
    render(<RemovedFromCallToast channelName="general" onDismiss={vi.fn()} />);
    expect(screen.getByText(/You were removed from the call in #general/)).toBeTruthy();
  });

  it("renders with alert role", () => {
    render(<RemovedFromCallToast channelName="general" onDismiss={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("calls onDismiss when close button clicked", () => {
    const onDismiss = vi.fn();
    render(<RemovedFromCallToast channelName="general" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId("removed-toast-dismiss"));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("auto-dismisses after specified duration", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <RemovedFromCallToast channelName="general" onDismiss={onDismiss} autoDismissMs={3000} />,
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onDismiss).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not auto-dismiss before duration", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <RemovedFromCallToast channelName="general" onDismiss={onDismiss} autoDismissMs={5000} />,
    );
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByTestId("removed-from-call-toast")).toBeTruthy();
    vi.useRealTimers();
  });

  it("hides after dismiss", () => {
    const onDismiss = vi.fn();
    render(<RemovedFromCallToast channelName="general" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId("removed-toast-dismiss"));
    expect(screen.queryByTestId("removed-from-call-toast")).toBeNull();
  });
});
