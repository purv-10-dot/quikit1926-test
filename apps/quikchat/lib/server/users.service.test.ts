import { db as prisma } from "@quikit/database";
import type { OrgContext } from "@/lib/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/auth/src/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../../../packages/auth/src/nextauth", () => ({ authOptions: {} }));

import { listOrgUsers } from "./users.service";

let orgAId = "";
let orgBId = "";
let aliceId = "";
let bobId = "";
let carolId = "";
let channelId = "";

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  orgBId = (await prisma.org.findUniqueOrThrow({ where: { slug: "globex" } })).id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  bobId = (await prisma.user.findUniqueOrThrow({ where: { email: "bob@acme.test" } })).id;
  carolId = (await prisma.user.findUniqueOrThrow({ where: { email: "carol@globex.test" } })).id;

  const channel = await prisma.qcChannel.create({
    data: { orgId: orgAId, type: "group", visibility: "private", name: "users-test" },
  });
  channelId = channel.id;
  await prisma.qcChannelMember.create({
    data: { orgId: orgAId, channelId, userId: bobId, role: "admin" },
  });
});

afterAll(async () => {
  await prisma.qcChannelMember.deleteMany({ where: { channelId } });
  await prisma.qcChannel.deleteMany({ where: { id: channelId } });
  await prisma.$disconnect();
});

const ctxAlice = (): OrgContext => ({ userId: aliceId, orgId: orgAId });
const ctxCarol = (): OrgContext => ({ userId: carolId, orgId: orgBId });

describe("listOrgUsers", () => {
  it("lists the caller's org members and never other orgs (tenant isolation)", async () => {
    const acme = await listOrgUsers(ctxAlice());
    const ids = acme.map((u) => u.id);
    expect(ids).toContain(aliceId);
    expect(ids).toContain(bobId);
    expect(ids).not.toContain(carolId);

    const globex = await listOrgUsers(ctxCarol());
    const gids = globex.map((u) => u.id);
    expect(gids).toContain(carolId);
    expect(gids).not.toContain(aliceId);
    expect(gids).not.toContain(bobId);
  });

  it("excludeSelf drops the caller", async () => {
    const ids = (await listOrgUsers(ctxAlice(), { excludeSelf: true })).map((u) => u.id);
    expect(ids).not.toContain(aliceId);
    expect(ids).toContain(bobId);
  });

  it("excludeChannelId drops existing members of that channel", async () => {
    const ids = (await listOrgUsers(ctxAlice(), { excludeChannelId: channelId })).map((u) => u.id);
    expect(ids).not.toContain(bobId); // bob is a member of users-test
    expect(ids).toContain(aliceId);
  });

  it("filters by q (name/email)", async () => {
    const ids = (await listOrgUsers(ctxAlice(), { q: "bob" })).map((u) => u.id);
    expect(ids).toContain(bobId);
    expect(ids).not.toContain(aliceId);
  });
});
