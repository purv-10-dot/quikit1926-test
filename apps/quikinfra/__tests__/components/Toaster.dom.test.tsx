// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Toaster } from "@/components/Toaster";
import { toast, clearToasts } from "@/lib/toast";

afterEach(() => {
  clearToasts();
});

describe("Toaster", () => {
  it("renders nothing when there are no toasts", () => {
    const { container } = render(<Toaster />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a toast pushed via the toast emitter", () => {
    render(<Toaster />);
    act(() => {
      toast.success("Vendor created");
    });
    expect(screen.getByText("Vendor created")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders a title above the message when provided", () => {
    render(<Toaster />);
    act(() => {
      toast.error("Try again", { title: "Save failed" });
    });
    expect(screen.getByText("Save failed")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("dismisses a toast when the dismiss button is clicked", () => {
    render(<Toaster />);
    act(() => {
      toast.info("Heads up", { duration: 0 });
    });
    expect(screen.getByText("Heads up")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dismiss notification/i }));
    expect(screen.queryByText("Heads up")).not.toBeInTheDocument();
  });

  it("stacks multiple toasts", () => {
    render(<Toaster />);
    act(() => {
      toast.success("One", { duration: 0 });
      toast.warning("Two", { duration: 0 });
    });
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });
});
