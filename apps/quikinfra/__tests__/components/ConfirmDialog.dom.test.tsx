// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

function setup(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={onConfirm}
      title="Delete contractor"
      message="This cannot be undone."
      {...overrides}
    />,
  );
  return { onClose, onConfirm };
}

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ConfirmDialog open={false} onClose={() => {}} onConfirm={() => {}} title="X" message="y" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the title and message when open", () => {
    setup();
    expect(screen.getByText("Delete contractor")).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
  });

  it("uses default Confirm/Cancel labels and honours overrides", () => {
    setup({ confirmLabel: "Yes, delete", cancelLabel: "Keep it" });
    expect(screen.getByRole("button", { name: /yes, delete/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep it/i })).toBeInTheDocument();
  });

  it("fires onConfirm when the confirm button is clicked", () => {
    const { onConfirm } = setup({ confirmLabel: "Confirm" });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("fires onClose when the cancel button is clicked", () => {
    const { onClose } = setup({ cancelLabel: "Cancel" });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fires onClose on Escape", () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("when loading: shows the working state and locks the buttons", () => {
    const { onClose, onConfirm } = setup({ loading: true, confirmLabel: "Confirm" });
    // confirm button now reads "Working…" and is disabled
    const working = screen.getByRole("button", { name: /working/i });
    expect(working).toBeDisabled();
    fireEvent.click(working);
    expect(onConfirm).not.toHaveBeenCalled();
    // Escape is ignored mid-confirm
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
