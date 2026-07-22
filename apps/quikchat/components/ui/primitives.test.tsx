import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmojiPicker } from "./EmojiPicker";
import { Modal } from "./Modal";
import { Popover } from "./Popover";

describe("EmojiPicker", () => {
  it("renders labelled emoji buttons and reports selection", () => {
    const onSelect = vi.fn();
    render(
      <EmojiPicker
        emojis={["👍", "🎉"]}
        nameOf={(e) => (e === "👍" ? "Thumbs up" : "Party")}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Party" }));
    expect(onSelect).toHaveBeenCalledWith("🎉");
  });
});

describe("Modal", () => {
  it("renders when open and closes via the close button", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Forward message">
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Forward message" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="X">
        <p>body</p>
      </Modal>,
    );
    expect(screen.queryByText("body")).toBeNull();
  });
});

describe("Popover", () => {
  it("toggles its panel on trigger click", () => {
    render(
      <Popover trigger={<button>open</button>} label="panel">
        <span>panel-content</span>
      </Popover>,
    );
    expect(screen.queryByText("panel-content")).toBeNull();
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByText("panel-content")).toBeInTheDocument();
  });
});
