import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Segmented, Switch, TimeInput } from "./Forms";

const LEVELS = [
  { label: "All", value: "all" },
  { label: "Mentions", value: "mentions" },
  { label: "None", value: "none" },
];

describe("Segmented", () => {
  it("is a radiogroup with the current value checked", () => {
    render(<Segmented label="Level" options={LEVELS} value="mentions" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Level" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Mentions" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "All" })).toHaveAttribute("aria-checked", "false");
  });

  it("fires onChange on click", () => {
    const onChange = vi.fn();
    render(<Segmented options={LEVELS} value="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "None" }));
    expect(onChange).toHaveBeenCalledWith("none");
  });

  it("moves selection with arrow keys", () => {
    const onChange = vi.fn();
    render(<Segmented label="Level" options={LEVELS} value="all" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("mentions");
    onChange.mockClear();
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("none"); // wraps from "all" backwards
  });
});

describe("Switch", () => {
  it("exposes role=switch + aria-checked and toggles", () => {
    const onChange = vi.fn();
    render(<Switch label="Sound" checked={false} onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "Sound" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not fire when disabled", () => {
    const onChange = vi.fn();
    render(<Switch label="Sound" checked disabled onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("TimeInput", () => {
  it("renders an HH:MM input and reports changes", () => {
    const onChange = vi.fn();
    render(<TimeInput label="Start" value="22:00" onChange={onChange} />);
    const input = screen.getByLabelText("Start") as HTMLInputElement;
    expect(input.type).toBe("time");
    expect(input.value).toBe("22:00");
    fireEvent.change(input, { target: { value: "07:30" } });
    expect(onChange).toHaveBeenCalledWith("07:30");
  });
});
