import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, colorFromId, initials } from "./Avatar";
import { Badge, EmptyState } from "./misc";
import { Button } from "./Button";

describe("@quikit/ui primitives", () => {
  it("renders a primary Button with the accent class", () => {
    render(<Button variant="primary">Send</Button>);
    const btn = screen.getByRole("button", { name: "Send" });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain("qc-btn--primary");
  });

  it("Avatar shows initials for users and a hash for groups", () => {
    const { rerender } = render(<Avatar name="Alice Acme" />);
    expect(screen.getByText("AA")).toBeInTheDocument();
    rerender(<Avatar name="general" group />);
    expect(screen.getByText("#")).toBeInTheDocument();
  });

  it("colorFromId is deterministic", () => {
    expect(colorFromId("user-1")).toBe(colorFromId("user-1"));
  });

  it("initials handles one- and two-word names", () => {
    expect(initials("Bob")).toBe("BO");
    expect(initials("Carol Globex")).toBe("CG");
  });

  it("Badge clamps to 99+", () => {
    render(<Badge count={150} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("EmptyState shows a title", () => {
    render(<EmptyState title="Pick a conversation" />);
    expect(screen.getByText("Pick a conversation")).toBeInTheDocument();
  });
});
