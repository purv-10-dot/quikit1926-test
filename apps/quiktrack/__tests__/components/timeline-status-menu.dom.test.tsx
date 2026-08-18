// @vitest-environment jsdom
/**
 * Timeline's inline Status menu is portaled to <body> with fixed positioning.
 * It used to pin to the trigger's bottom edge unconditionally, so opening it on
 * one of the last rows pushed the options below the window — only the first two
 * were reachable. It must flip above the row when there isn't room below.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatusEditor } from "@/app/(dashboard)/spaces/[id]/timeline/_components/timeline-inline-edit";

const STATUSES = [
  { id: "s1", name: "To Do", category: "TODO", color: null },
  { id: "s2", name: "In Progress", category: "IN_PROGRESS", color: null },
  { id: "s3", name: "Ready for UAT", category: "IN_PROGRESS", color: null },
  { id: "s4", name: "Done", category: "DONE", color: null },
];

const MENU_H = 220;

beforeEach(() => {
  window.innerHeight = 900;
  window.innerWidth = 1500;
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => MENU_H,
  });
});

/** Open the menu with the trigger placed at `top` on screen. */
function openAt(top: number) {
  render(
    <StatusEditor
      issueId="issue_1"
      projectId="proj_1"
      value="s1"
      statuses={STATUSES}
      onSelect={vi.fn()}
    />,
  );
  const trigger = screen.getByRole("button", { name: /to do/i });
  trigger.getBoundingClientRect = () =>
    ({ left: 500, top, bottom: top + 22, right: 590, width: 90, height: 22 }) as DOMRect;
  fireEvent.click(trigger);
  // The portaled menu is the container holding the option rows.
  return screen.getByText("Ready for UAT").closest("[data-timeline-menu]") as HTMLElement;
}

describe("Timeline <StatusEditor /> menu placement", () => {
  it("opens below the trigger when there is room", () => {
    const menu = openAt(200);

    expect(menu.style.position).toBe("fixed");
    expect(Number.parseInt(menu.style.top, 10)).toBe(226); // bottom + 4
  });

  it("flips above the trigger on the last rows so every option is reachable", () => {
    const menu = openAt(860); // 18px below the trigger, ~860 above

    // Flipped: pinned by its bottom edge at the trigger's top.
    expect(menu.style.top).toBe("");
    const bottom = Number.parseInt(menu.style.bottom, 10);
    expect(bottom).toBe(window.innerHeight - 856);
    expect(bottom + MENU_H).toBeLessThanOrEqual(window.innerHeight);
  });

  it("caps the menu height to the space available", () => {
    const menu = openAt(860);

    expect(menu.style.overflowY).toBe("auto");
    const maxHeight = Number.parseInt(menu.style.maxHeight, 10);
    expect(maxHeight).toBeGreaterThan(0);
    expect(
      Number.parseInt(menu.style.bottom, 10) + maxHeight,
    ).toBeLessThanOrEqual(window.innerHeight);
  });

  it("renders every status option", () => {
    const menu = openAt(200);

    for (const s of STATUSES) {
      // "To Do" is also the trigger label — scope the lookup to the menu.
      expect(menu.textContent).toContain(s.name);
    }
  });
});
