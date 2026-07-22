import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatTypingSentence, TypingIndicator } from "./TypingIndicator";

describe("formatTypingSentence", () => {
  it("humanises 1/2/3/4+ typists", () => {
    expect(formatTypingSentence([])).toBe("");
    expect(formatTypingSentence(["Alice"])).toBe("Alice is typing…");
    expect(formatTypingSentence(["Alice", "Bob"])).toBe("Alice and Bob are typing…");
    expect(formatTypingSentence(["Alice", "Bob", "Carol"])).toBe(
      "Alice, Bob, and Carol are typing…",
    );
    expect(formatTypingSentence(["Alice", "Bob", "Carol", "Dan", "Eve"])).toBe(
      "Alice, Bob, and 3 others are typing…",
    );
  });
});

describe("TypingIndicator", () => {
  it("is collapsed (inactive) when nobody is typing", () => {
    const { container } = render(<TypingIndicator users={[]} />);
    expect(container.querySelector(".qc-typing")?.getAttribute("data-active")).toBe("false");
  });

  it("renders the typing sentence when active", () => {
    render(<TypingIndicator users={[{ id: "u1", displayName: "Alice" }]} />);
    expect(screen.getByText("Alice is typing…")).toBeTruthy();
    const root = document.querySelector(".qc-typing");
    expect(root?.getAttribute("data-active")).toBe("true");
  });
});
