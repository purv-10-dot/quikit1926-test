// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchSelect, type SearchSelectOption } from "@/components/SearchSelect";

const OPTIONS: SearchSelectOption[] = [
  { value: "cement", label: "Cement OPC 53", sublabel: "BAG" },
  { value: "sand", label: "River Sand", sublabel: "CUM" },
  { value: "steel", label: "TMT Steel Bar", sublabel: "KG", badge: "HOT" },
];

function open() {
  // Trigger is the only button when closed.
  fireEvent.click(screen.getByRole("button"));
}

describe("SearchSelect", () => {
  it("shows the placeholder when nothing is selected", () => {
    render(<SearchSelect value="" onChange={() => {}} options={OPTIONS} placeholder="Pick a material" />);
    expect(screen.getByText("Pick a material")).toBeInTheDocument();
  });

  it("renders the selected value's label in the trigger", () => {
    render(<SearchSelect value="steel" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByText("TMT Steel Bar")).toBeInTheDocument();
  });

  it("renders all options once opened", () => {
    render(<SearchSelect value="" onChange={() => {}} options={OPTIONS} />);
    open();
    expect(screen.getByText("Cement OPC 53")).toBeInTheDocument();
    expect(screen.getByText("River Sand")).toBeInTheDocument();
    expect(screen.getByText("TMT Steel Bar")).toBeInTheDocument();
  });

  it("fires onChange with the option value when an option is clicked", () => {
    const onChange = vi.fn();
    render(<SearchSelect value="" onChange={onChange} options={OPTIONS} />);
    open();
    fireEvent.click(screen.getByText("River Sand"));
    expect(onChange).toHaveBeenCalledWith("sand");
  });

  it("filters visible options as the user types", () => {
    render(<SearchSelect value="" onChange={() => {}} options={OPTIONS} />);
    open();
    fireEvent.change(screen.getByPlaceholderText("Type to search…"), { target: { value: "steel" } });
    expect(screen.getByText("TMT Steel Bar")).toBeInTheDocument();
    expect(screen.queryByText("River Sand")).not.toBeInTheDocument();
  });

  it("shows the empty-state text when nothing matches the search", () => {
    render(<SearchSelect value="" onChange={() => {}} options={OPTIONS} emptyText="No materials" />);
    open();
    fireEvent.change(screen.getByPlaceholderText("Type to search…"), { target: { value: "zzz" } });
    expect(screen.getByText("No materials")).toBeInTheDocument();
  });

  it("clears the selection via the clear affordance", () => {
    const onChange = vi.fn();
    render(<SearchSelect value="cement" onChange={onChange} options={OPTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: /clear selection/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
