import { describe, it, expect } from "vitest";
import { wordAtCursor, replaceWord } from "@/app/(dashboard)/filters/[id]/_components/tql-word-at-cursor";

describe("wordAtCursor", () => {
  it("finds the word when cursor is at its end", () => {
    expect(wordAtCursor("assig", 5)).toEqual({ word: "assig", start: 0, end: 5 });
  });

  it("finds the word when cursor is in the middle", () => {
    expect(wordAtCursor("assignee", 3)).toEqual({ word: "assignee", start: 0, end: 8 });
  });

  it("finds the word among other tokens", () => {
    const text = 'status = "Done" AND assig';
    expect(wordAtCursor(text, text.length)).toEqual({ word: "assig", start: 20, end: 25 });
  });

  it("returns an empty word when the cursor sits on whitespace/punctuation", () => {
    expect(wordAtCursor("status = ", 9)).toEqual({ word: "", start: 9, end: 9 });
  });

  it("stops at an operator boundary", () => {
    const text = "priority>";
    expect(wordAtCursor(text, 8)).toEqual({ word: "priority", start: 0, end: 8 });
  });

  it("does not cross a quote boundary", () => {
    const text = '"Done" assig';
    expect(wordAtCursor(text, text.length)).toEqual({ word: "assig", start: 7, end: 12 });
  });
});

describe("replaceWord", () => {
  it("replaces the word and places the cursor after the inserted text", () => {
    const result = replaceWord("status = assig", 9, 14, "assignee");
    expect(result.text).toBe("status = assignee");
    expect(result.cursor).toBe(17);
  });

  it("replaces an empty word (pure insertion) at the cursor position", () => {
    const result = replaceWord("status = ", 9, 9, "assignee");
    expect(result.text).toBe("status = assignee");
    expect(result.cursor).toBe(17);
  });

  it('inserts a cf["..."] reference in place of a partial word', () => {
    const text = 'priority = "x" AND cf';
    const result = replaceWord(text, 19, 21, 'cf["Customer Tier"]');
    expect(result.text).toBe('priority = "x" AND cf["Customer Tier"]');
  });
});
