// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { UserSelect, type PickerUser } from "@quikit/ui";

/**
 * Regression: on short (13") screens the member dropdown used to be
 * absolutely-positioned INSIDE the form's `overflow-y-auto` body, so it was
 * clipped by the scroll container and the lower options were unreachable. The
 * fix renders the menu in a `position: fixed` portal on document.body with a
 * viewport-aware max-height + internal scroll. These tests lock that in.
 */

const USERS: PickerUser[] = Array.from({ length: 12 }, (_, i) => ({
  id: `u${i}`,
  firstName: `Member${i}`,
  lastName: "Test",
  email: `member${i}@example.com`,
}));

describe("UserSelect dropdown (small-screen scroll fix)", () => {
  it("renders the open menu in a portal on document.body, not inside the clipping wrapper", () => {
    const { container } = render(
      <UserSelect mode="multi" values={[]} onChange={() => {}} users={USERS} placeholder="Select members…" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /select members/i }));

    // The search box marks the open menu. It must NOT live inside the
    // component's own wrapper (which is the thing that gets clipped) — it
    // should be portaled out to document.body.
    const search = screen.getByPlaceholderText("Search…");
    expect(container.contains(search)).toBe(false);
    expect(document.body.contains(search)).toBe(true);
  });

  it("positions the menu with fixed positioning and a bounded max-height", () => {
    render(<UserSelect mode="multi" values={[]} onChange={() => {}} users={USERS} />);
    fireEvent.click(screen.getByRole("button"));

    const menu = screen.getByPlaceholderText("Search…").closest("div[style]") as HTMLElement;
    expect(menu).toBeTruthy();
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.maxHeight).not.toBe(""); // a height cap is always set
  });

  it("keeps the options in an internally-scrolling region", () => {
    render(<UserSelect mode="multi" values={[]} onChange={() => {}} users={USERS} />);
    fireEvent.click(screen.getByRole("button"));

    const menu = screen.getByPlaceholderText("Search…").closest("div[style]") as HTMLElement;
    // All 12 options are present (none dropped), inside an overflow-y-auto area.
    const options = within(menu).getAllByRole("button").filter(b => /Member\d+ Test/.test(b.textContent ?? ""));
    expect(options).toHaveLength(12);
    const scrollArea = menu.querySelector(".overflow-y-auto");
    expect(scrollArea).toBeTruthy();
  });

  it("still selects a member when an option is clicked (portal click path works)", () => {
    const onChange = vi.fn();
    render(<UserSelect mode="multi" values={[]} onChange={onChange} users={USERS} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Member3 Test"));
    expect(onChange).toHaveBeenCalledWith(["u3"]);
  });

  it("closes when clicking outside both the trigger and the portaled menu", () => {
    render(<UserSelect mode="single" value="" onChange={() => {}} users={USERS} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
  });
});
