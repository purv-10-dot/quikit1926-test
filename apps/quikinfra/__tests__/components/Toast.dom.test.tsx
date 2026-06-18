// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useToast } from "@/components/ui/Toast";

// A tiny harness that exposes the singleton toast API as buttons. Calling
// useToast() also mounts the singleton host portal onto document.body.
function Harness() {
  const t = useToast();
  return (
    <div>
      <button onClick={() => t.success("Saved")}>fire success</button>
      <button onClick={() => t.error("Boom")}>fire error</button>
      <button onClick={() => t.info("FYI")}>fire info</button>
    </div>
  );
}

describe("useToast / ToastHost", () => {
  it("renders the trigger harness without crashing", () => {
    render(<Harness />);
    expect(
      screen.getByRole("button", { name: /fire success/i }),
    ).toBeInTheDocument();
  });

  it("shows a success toast after the singleton host mounts", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /fire success/i }));
    // host mounts via a dynamic import("react-dom/client") — wait for it.
    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error toast and dismisses it on the close button", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /fire error/i }));
    await waitFor(() => {
      expect(screen.getByText("Boom")).toBeInTheDocument();
    });
    // dismiss the error toast specifically
    const card = screen.getByText("Boom").closest('[role="status"]') as HTMLElement;
    const close = card.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement;
    fireEvent.click(close);
    await waitFor(() => {
      expect(screen.queryByText("Boom")).not.toBeInTheDocument();
    });
  });
});
