// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ProjectPicker } from "@/components/timesheet/project-picker";

const projects = [
  { id: "p1", name: "Degree 360 Cloud", icon: "rocket", color: null },
  { id: "p2", name: "AI/ML Internal", icon: null, color: "#7c3aed" },
];

function open() {
  const utils = render(
    <ProjectPicker projects={projects} value="" onChange={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /pick a project/i }));
  return utils;
}

describe("<ProjectPicker />", () => {
  it("shows an icon tile next to every project name", () => {
    open();
    for (const p of projects) {
      const option = screen.getByRole("button", { name: new RegExp(p.name, "i") });
      // SpaceIcon renders a sized <span> tile — gradient glyph for a known icon
      // key, colored initial otherwise.
      const tile = option.querySelector("span[style*='width']");
      expect(tile).not.toBeNull();
    }
  });

  it("falls back to a colored initial when the project has no icon", () => {
    open();
    const option = screen.getByRole("button", { name: /AI\/ML Internal/i });
    expect(within(option).getByText("A")).toBeInTheDocument();
  });

  it("shows the selected project's icon on the trigger", () => {
    render(<ProjectPicker projects={projects} value="p2" onChange={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: /AI\/ML Internal/i });
    expect(within(trigger).getByText("A")).toBeInTheDocument();
  });
});
