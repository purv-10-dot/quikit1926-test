import { db as prisma } from "@quikit/database";
import type { OrgContext } from "@/lib/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/auth/src/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../../../packages/auth/src/nextauth", () => ({ authOptions: {} }));

import { getUiPrefs, setUiPrefs } from "./ui-prefs.service";

let orgAId = "";
let userId = "";

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  userId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
});

afterAll(async () => {
  await prisma.qcUserUiPrefs.deleteMany({ where: { userId } });
  await prisma.$disconnect();
});

const ctx = (): OrgContext => ({ userId, orgId: orgAId });

describe("ui-prefs service (S14b)", () => {
  it("get-or-creates with the system default", async () => {
    await prisma.qcUserUiPrefs.deleteMany({ where: { userId } });
    expect(await getUiPrefs(ctx())).toEqual({ theme: "system" });
  });

  it("patches the theme and persists it", async () => {
    const updated = await setUiPrefs(ctx(), { theme: "dark" });
    expect(updated).toEqual({ theme: "dark" });
    expect(await getUiPrefs(ctx())).toEqual({ theme: "dark" });
  });

  it("ignores an unknown theme value", async () => {
    await setUiPrefs(ctx(), { theme: "light" });
    const after = await setUiPrefs(ctx(), { theme: "purple" as never });
    expect(after.theme).toBe("light"); // unchanged
  });
});
