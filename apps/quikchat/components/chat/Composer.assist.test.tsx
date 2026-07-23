import { describe, expect, it } from "vitest";
import { parseAssistCommand } from "./Composer";

// The former "Composer assist trigger" describe (routing a typed `/ai` command
// to onAssist vs. onSend) was removed in WYSIWYG Stage 1b-iii: it drove text
// into the editor via fireEvent.change, which throws against TipTap's
// contenteditable in jsdom (no value setter). That behavior is now owned by the
// Playwright e2e suite (Stage 3) — see the TODO(e2e) checklist in
// Composer.media.test.tsx. This file keeps the pure, render-free unit below.

describe("parseAssistCommand", () => {
  it("matches /ai and /ask, stripping the prefix", () => {
    expect(parseAssistCommand("/ai summarize the thread")).toBe("summarize the thread");
    expect(parseAssistCommand("/ask what did Bob say?")).toBe("what did Bob say?");
    expect(parseAssistCommand("  /AI  hello ")).toBe("hello");
  });
  it("returns null for non-commands", () => {
    expect(parseAssistCommand("just a message")).toBeNull();
    expect(parseAssistCommand("/ai")).toBeNull(); // no prompt
    expect(parseAssistCommand("/aimless wandering")).toBeNull();
  });
});
