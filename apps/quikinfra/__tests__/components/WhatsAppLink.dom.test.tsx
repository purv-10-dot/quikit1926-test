// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WhatsAppLink } from "@/components/WhatsAppLink";

describe("WhatsAppLink", () => {
  it("renders an anchor with a wa.me href for a valid 10-digit mobile", () => {
    render(<WhatsAppLink phone="9876543210" />);
    const link = screen.getByRole("link", { name: /chat on whatsapp/i });
    expect(link).toHaveAttribute("href", "https://wa.me/919876543210");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("encodes the message into the href when provided", () => {
    render(<WhatsAppLink phone="9876543210" message="Hi there" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(
      "https://wa.me/919876543210?text=Hi%20there",
    );
  });

  it("uses a custom title as the accessible label", () => {
    render(<WhatsAppLink phone="9876543210" title="Message vendor" />);
    expect(
      screen.getByRole("link", { name: /message vendor/i }),
    ).toBeInTheDocument();
  });

  it("renders nothing when the phone cannot be normalized", () => {
    const { container } = render(<WhatsAppLink phone="abc" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stops click propagation so row-click handlers don't fire", () => {
    const rowClick = vi.fn();
    render(
      <div onClick={rowClick}>
        <WhatsAppLink phone="9876543210" />
      </div>,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(rowClick).not.toHaveBeenCalled();
  });

  it("renders the WhatsApp svg icon", () => {
    render(<WhatsAppLink phone="9876543210" />);
    expect(screen.getByRole("link").querySelector("svg")).toBeInTheDocument();
  });
});
