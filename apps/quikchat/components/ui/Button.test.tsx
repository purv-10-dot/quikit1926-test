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

  // THREE-WAY, not two. A private GROUP renders like a person (initials),
  // because a group is its members; only a public CHANNEL gets the hash,
  // because a channel is a place. The old boolean collapsed those two.
  it("Avatar shows initials for people, initials for groups, and a hash only for channels", () => {
    const { rerender } = render(<Avatar name="Alice Acme" />);
    expect(screen.getByText("AA")).toBeInTheDocument();

    rerender(<Avatar name="Design Team" variant="group" />);
    expect(screen.getByText("DT")).toBeInTheDocument();
    expect(screen.queryByText("#")).not.toBeInTheDocument();

    rerender(<Avatar name="general" variant="channel" />);
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
