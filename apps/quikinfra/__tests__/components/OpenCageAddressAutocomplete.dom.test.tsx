// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OpenCageAddressAutocomplete } from "@/components/OpenCageAddressAutocomplete";

// NOTE: OpenCage autocomplete is currently DISABLED in the source — the
// component renders a plain controlled text input and never fetches
// suggestions (see the file's header comment). Tests cover the input
// behaviour that ships today: render value, fire onChange, honour disabled.

describe("OpenCageAddressAutocomplete", () => {
  it("renders the current value in the input", () => {
    render(<OpenCageAddressAutocomplete value="12 MG Road" onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("12 MG Road");
  });

  it("renders the placeholder when value is null/undefined", () => {
    render(
      <OpenCageAddressAutocomplete
        value={null}
        onChange={() => {}}
        placeholder="Type address…"
      />,
    );
    const input = screen.getByPlaceholderText("Type address…");
    expect(input).toHaveValue("");
  });

  it("fires onChange with the typed text", () => {
    const onChange = vi.fn();
    render(<OpenCageAddressAutocomplete value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "New Delhi" },
    });
    expect(onChange).toHaveBeenCalledWith("New Delhi");
  });

  it("disables the input when disabled is set", () => {
    render(<OpenCageAddressAutocomplete value="" onChange={() => {}} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("does not render any suggestion list (autocomplete disabled)", () => {
    render(<OpenCageAddressAutocomplete value="Mum" onChange={() => {}} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Mumbai" } });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});
