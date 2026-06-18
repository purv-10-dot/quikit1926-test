// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormDrawer, TextInput } from "@/components/FormDrawer";

function setup(overrides: Partial<React.ComponentProps<typeof FormDrawer>> = {}) {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  const utils = render(
    <FormDrawer
      open
      onClose={onClose}
      onSubmit={onSubmit}
      title="Create Vendor"
      subtitle="Add a new vendor record"
      {...overrides}
    >
      <div>drawer body content</div>
    </FormDrawer>,
  );
  return { onClose, onSubmit, ...utils };
}

describe("FormDrawer", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <FormDrawer open={false} onClose={() => {}} title="Hidden">
        <div>body</div>
      </FormDrawer>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title, subtitle and children when open", () => {
    setup();
    expect(screen.getByText("Create Vendor")).toBeInTheDocument();
    expect(screen.getByText("Add a new vendor record")).toBeInTheDocument();
    expect(screen.getByText("drawer body content")).toBeInTheDocument();
  });

  it("uses the default Save label and honours submitLabel override", () => {
    const { unmount } = setup();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
    unmount();
    setup({ submitLabel: "Create Now" });
    expect(screen.getByRole("button", { name: /create now/i })).toBeInTheDocument();
  });

  it("fires onSubmit when the primary button is clicked", () => {
    const { onSubmit } = setup({ submitLabel: "Save" });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("fires onClose from the Cancel button", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fires onClose when the backdrop is clicked", () => {
    const { onClose, container } = setup();
    // The backdrop is the first child div with the fixed-inset class.
    const backdrop = container.querySelector("div.fixed.inset-0");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("when loading: shows Saving... and disables the primary button", () => {
    const { onSubmit } = setup({ loading: true });
    const btn = screen.getByRole("button", { name: /saving/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders a custom footer instead of the default Cancel/Save", () => {
    setup({ footer: <button type="button">Custom Footer Action</button> });
    expect(screen.getByRole("button", { name: /custom footer action/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
  });

  it("TextInput field: typing calls onChange with the raw value", () => {
    const onChange = vi.fn();
    render(<TextInput value="" onChange={onChange} placeholder="Vendor name" />);
    const input = screen.getByPlaceholderText("Vendor name");
    fireEvent.change(input, { target: { value: "Acme" } });
    expect(onChange).toHaveBeenCalledWith("Acme");
  });
});
