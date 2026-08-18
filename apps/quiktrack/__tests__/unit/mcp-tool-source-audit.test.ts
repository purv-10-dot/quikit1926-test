import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * QUIKTR-118 (layer 1) — static guardrail. If any future edit to the MCP
 * tool file ever introduces a real delete/raw-SQL call, this test fails
 * before it ships, without needing to re-audit every tool by hand. The
 * runtime guard in lib/mcp/guardedDb.ts (see mcp-no-delete-guardrail.test.ts)
 * is the primary defense; this is a second, independent check on the
 * source text itself.
 */
const SOURCE_PATH = join(__dirname, "..", "..", "lib", "mcp", "server.ts");

describe("lib/mcp/server.ts source audit (QUIKTR-118)", () => {
  const source = readFileSync(SOURCE_PATH, "utf8");

  it("contains no .delete( or .deleteMany( calls", () => {
    expect(source).not.toMatch(/\.delete\(/);
    expect(source).not.toMatch(/\.deleteMany\(/);
  });

  it("contains no raw SQL execution", () => {
    expect(source).not.toMatch(/\$executeRaw/);
    expect(source).not.toMatch(/\$queryRaw/);
    expect(source).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("imports the guarded db client, not the raw one", () => {
    expect(source).toMatch(/import\s*{\s*mcpDb as db\s*}\s*from\s*"@\/lib\/mcp\/guardedDb"/);
    expect(source).not.toMatch(/import\s*{\s*db\s*}\s*from\s*"@\/lib\/db"/);
  });
});
