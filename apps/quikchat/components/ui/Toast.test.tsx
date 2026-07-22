import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./Toast";

function Trigger() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success({ title: "Saved", body: "All good" })}>ok</button>
      <button onClick={() => toast.error({ title: "Nope" })}>err</button>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("useToast / ToastProvider", () => {
  it("shows a success toast and auto-dismisses after the duration", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText("ok"));
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("All good")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3300);
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("supports manual close", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText("err"));
    });
    expect(screen.getByText("Nope")).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByLabelText("Dismiss"));
    });
    expect(screen.queryByText("Nope")).not.toBeInTheDocument();
  });

  it("renders the error kind with the danger accent bar", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText("err"));
    });
    const toast = document.querySelector(".qc-toast");
    expect(toast?.getAttribute("data-kind")).toBe("error");
  });

  it("useToast is a no-op without a provider (does not throw)", () => {
    render(<Trigger />);
    expect(() => fireEvent.click(screen.getByText("ok"))).not.toThrow();
  });
});
