import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { auditEnvSecurity, scanForCardData, CARD_DATA_PATTERNS } from "../pci";

describe("PCI env security audit", () => {
  it("flags missing/weak secrets as critical in production", () => {
    const v = auditEnvSecurity({}, "production");
    const keys = v.filter((x) => x.severity === "critical").map((x) => x.key);
    expect(keys).toContain("AUTH_SECRET");
    expect(keys).toContain("DATABASE_URL");
    expect(keys).toContain("CONTACT_ENCRYPTION_KEY");
  });

  it("passes when production secrets are strong and HTTPS", () => {
    const v = auditEnvSecurity(
      {
        AUTH_SECRET: "x".repeat(40),
        DATABASE_URL: "postgresql://u:p@db:5432/app",
        CONTACT_ENCRYPTION_KEY: "y".repeat(24),
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
        CRON_SECRET: "z".repeat(20)
      },
      "production"
    );
    expect(v.filter((x) => x.severity === "critical")).toHaveLength(0);
  });

  it("rejects non-HTTPS app URL in production", () => {
    const v = auditEnvSecurity({ AUTH_SECRET: "x".repeat(40), DATABASE_URL: "d", CONTACT_ENCRYPTION_KEY: "y".repeat(24), NEXT_PUBLIC_APP_URL: "http://app" }, "production");
    expect(v.some((x) => x.key === "APP_URL" && x.severity === "critical")).toBe(true);
  });

  it("does not require secrets in development", () => {
    expect(auditEnvSecurity({}, "development").filter((x) => x.severity === "critical")).toHaveLength(0);
  });
});

describe("cardholder-data detector", () => {
  it("matches card fields but NOT the Indian tax PAN", () => {
    expect(scanForCardData("card_number text")).toContain("card_number");
    expect(scanForCardData("cvv int")).toContain("cvv/cvc");
    expect(scanForCardData("pan text, tax_id text")).toHaveLength(0); // tax PAN is fine
  });
});

// ---- SAQ A scope guard: the codebase must never introduce CHD/SAD storage ----
const ROOTS = ["app", "lib", "components", "prisma", "supabase"];
const EXT = /\.(ts|tsx|sql|prisma)$/;
const SELF = "pci.ts"; // this module defines the patterns; skip it

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".next" || e === "__tests__") continue;
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (EXT.test(e) && !p.endsWith(SELF)) out.push(p);
  }
  return out;
}

describe("SAQ A scope guard", () => {
  it("no cardholder-data fields exist anywhere in the codebase", () => {
    const root = process.cwd();
    const offenders: { file: string; hits: string[] }[] = [];
    for (const r of ROOTS) {
      for (const file of walk(join(root, r))) {
        const hits = scanForCardData(readFileSync(file, "utf8"));
        if (hits.length) offenders.push({ file: file.replace(root, ""), hits });
      }
    }
    expect(CARD_DATA_PATTERNS.length).toBeGreaterThan(0);
    expect(offenders, `Cardholder data fields detected — this breaks SAQ A scope:\n${JSON.stringify(offenders, null, 2)}`).toEqual([]);
  });
});
