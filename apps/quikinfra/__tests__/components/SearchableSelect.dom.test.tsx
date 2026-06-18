// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchableSelect, type Option } from "@/components/SearchableSelect";

const OPTIONS: Option[] = [
  { value: "MH", label: "Maharashtra" },
  { value: "GJ", label: "Gujarat" },
  { value: "KA", label: "Karnataka" },
];

function open() {
  fireEvent.click(screen.getByRole("button"));
}

describe("SearchableSelect", () => {
  it("shows the placeholder when no value is selected", () => {
    render(<SearchableSelect value="" onChange={() => {}} options={OPTIONS} placeholder="Select state…" />);
    expect(screen.getByText("Select state…")).toBeInTheDocument();
  });

  it("renders the selected option label in the trigger", () => {
    render(<SearchableSelect value="GJ" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByText("Gujarat")).toBeInTheDocument();
  });

  it("renders all options once opened", () => {
    render(<SearchableSelect value="" onChange={() => {}} options={OPTIONS} />);
    open();
    expect(screen.getByText("Maharashtra")).toBeInTheDocument();
    expect(screen.getByText("Karnataka")).toBeInTheDocument();
  });

  it("commits the value via onChange when an option is clicked", () => {
    const onChange = vi.fn();
    render(<SearchableSelect value="" onChange={onChange} options={OPTIONS} />);
    open();
    fireEvent.click(screen.getByText("Karnataka"));
    expect(onChange).toHaveBeenCalledWith("KA");
  });

  it("filters options as the user types in the search box", () => {
    render(<SearchableSelect value="" onChange={() => {}} options={OPTIONS} />);
    open();
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "guj" } });
    expect(screen.getByText("Gujarat")).toBeInTheDocument();
    expect(screen.queryByText("Maharashtra")).not.toBeInTheDocument();
  });

  it("shows the empty-state text when no option matches", () => {
    render(<SearchableSelect value="" onChange={() => {}} options={OPTIONS} emptyText="Nothing here" />);
    open();
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "xyz" } });
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("clears the selection via the clear button when clearable", () => {
    const onChange = vi.fn();
    render(<SearchableSelect value="MH" onChange={onChange} options={OPTIONS} clearable />);
    fireEvent.click(screen.getByTitle("Clear"));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
