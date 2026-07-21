import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Phase-1 guard for the Asset Identity Bridge (`AstEmployee.userId → auth.User`,
 * see apps/quikasset/docs/ASSET_IDENTITY_BRIDGE_PROPOSAL.md).
 *
 * Schema/migration phases have no route logic to exercise, so this pins the
 * schema *contract* the rest of the merge (Member "my assets" scoping, the
 * merged user/employee page, the unified Add-User flow) depends on. If a later
 * refactor drops the FK, the reverse relation, or weakens the delete semantics,
 * these fail loudly instead of silently breaking scoping.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../.."); // unit → __tests__ → quikasset → apps → repo
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

/** First `model <name> { … }` block from a Prisma schema string. */
function modelBlock(src: string, name: string): string {
  const m = src.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  if (!m) throw new Error(`model ${name} not found in schema`);
  return m[0];
}

describe("identity bridge — schema contract", () => {
  const schema = read("packages/database/prisma/schema.prisma");
  const employee = modelBlock(schema, "AstEmployee");
  const user = modelBlock(schema, "User");

  it("AstEmployee.userId is a nullable scalar (contractors/seed rows stay unlinked)", () => {
    expect(employee).toMatch(/\buserId\s+String\?/);
  });

  it("AstEmployee.user is the optional relation on userId", () => {
    expect(employee).toMatch(
      /\buser\s+User\?\s+@relation\(fields:\s*\[userId\],\s*references:\s*\[id\]\)/,
    );
  });

  it("one platform user maps to at most one employee per org", () => {
    expect(employee).toMatch(/@@unique\(\[orgId,\s*userId\]\)/);
  });

  it("userId is indexed", () => {
    expect(employee).toMatch(/@@index\(\[userId\]\)/);
  });

  it("User has the reverse astEmployees relation (required by Prisma)", () => {
    expect(user).toMatch(/\bastEmployees\s+AstEmployee\[\]/);
  });
});

describe("identity bridge — migration", () => {
  const sql = read(
    "packages/database/prisma/migrations/20260714120000_add_ast_employee_user_link/migration.sql",
  );

  it("adds a nullable userId column to app_quikasset.employees", () => {
    expect(sql).toMatch(/ALTER TABLE "app_quikasset"\."employees" ADD COLUMN\s+"userId" TEXT;/);
  });

  it("links to auth.User with ON DELETE SET NULL — deleting a login unlinks, never deletes the employee", () => {
    expect(sql).toContain(
      'REFERENCES "auth"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE',
    );
  });
});
