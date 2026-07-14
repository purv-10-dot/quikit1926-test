import { describe, expect, it } from "vitest";
import { serializeToMarkdown, type TiptapNode } from "./tiptap-markdown";

/** A paragraph block wrapping the given inline nodes. */
function para(...content: TiptapNode[]): TiptapNode {
  return { type: "paragraph", content };
}
/** A text run with optional mark types. */
function text(value: string, ...marks: string[]): TiptapNode {
  return { type: "text", text: value, marks: marks.map((type) => ({ type })) };
}
function doc(...content: TiptapNode[]): TiptapNode {
  return { type: "doc", content };
}

describe("serializeToMarkdown", () => {
  it("returns '' for null / undefined / no content", () => {
    expect(serializeToMarkdown(null)).toBe("");
    expect(serializeToMarkdown(undefined)).toBe("");
    expect(serializeToMarkdown({ type: "doc" })).toBe("");
  });

  it("serializes a plain paragraph", () => {
    expect(serializeToMarkdown(doc(para(text("hello"))))).toBe("hello");
  });

  it("wraps single marks", () => {
    expect(serializeToMarkdown(doc(para(text("x", "bold"))))).toBe("**x**");
    expect(serializeToMarkdown(doc(para(text("x", "italic"))))).toBe("*x*");
    expect(serializeToMarkdown(doc(para(text("x", "strike"))))).toBe("~x~");
    expect(serializeToMarkdown(doc(para(text("x", "code"))))).toBe("`x`");
  });

  it("serializes a mixed run in one paragraph", () => {
    expect(serializeToMarkdown(doc(para(text("hi "), text("there", "bold"))))).toBe("hi **there**");
  });

  it("joins two paragraphs with a newline", () => {
    expect(serializeToMarkdown(doc(para(text("a")), para(text("b"))))).toBe("a\nb");
  });

  it("treats a hard break inside a paragraph as a newline", () => {
    expect(serializeToMarkdown(doc(para(text("a"), { type: "hardBreak" }, text("b"))))).toBe(
      "a\nb",
    );
  });

  it("treats code as terminal (ignores other marks)", () => {
    expect(serializeToMarkdown(doc(para(text("x", "code", "bold"))))).toBe("`x`");
  });
});
