import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { EncryptJWT } from "jose";
import hkdf from "@panva/hkdf";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/projects/[id]/summary/route";

/**
 * `GET /api/projects/[id]/summary` enforces `ProjectSummary:view`.
 *
 * The manifest declares that permission for `summarize_project`, but the route
 * gated on project MEMBERSHIP only — so any member could read the summary
 * regardless of the grant, while the Summary tab's client gate hid it from
 * them. This suite pins the enforcement.
 *
 * Both identity sources are covered at both outcomes — four cases, not two.
 * `requirePermission` is evaluated inside `withProjectAccess` after identity
 * resolution, so a session caller and an agent-JWT caller structurally cannot
 * diverge. That is exactly why it is asserted: "structurally cannot diverge"
 * is the kind of claim that quietly stops being true after a refactor.
 */

const ORG = "org_1";
const USER = "user_1";
const PROJECT = "proj_1";
const AGENT_NEXTAUTH_SECRET = "test-nextauth-secret-for-agent-jwt";

async function mintAgentJwt(): Promise<string> {
  const key = await hkdf(
    "sha256",
    AGENT_NEXTAUTH_SECRET,
    "",
    "NextAuth.js Generated Encryption Key",
    32,
  );
  const now = Math.floor(Date.now() / 1000);
  return new EncryptJWT({
    sub: USER,
    orgId: ORG,
    actingAs: "ai_agent",
    actingAgentId: "ai-runtime",
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .encrypt(key);
}

function request(token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/summary`, { headers });
}

const call = (req: NextRequest) => GET(req, { params: { id: PROJECT } });

/** Project resolves, caller is a plain member, and the aggregate the handler
 *  runs once the gate passes returns empty — so a 200 here means the gate
 *  allowed, not that the dashboard had data. */
function arrangeCommon() {
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  // No App row → isQuikTrackAppAdmin() is false without needing an appId.
  mockDb.app.findUnique.mockResolvedValue(null as never);
  mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
  mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null as never);
  // Handler body — reached only when the gate passes.
  // groupBy's generic overload signature is too complex for vitest-mock-extended
  // to expose as a plain mock fn — cast to set its result (same convention as
  // board-columns.test.ts / workflow-publish.test.ts).
  (mockDb.qtIssue.groupBy as unknown as { mockResolvedValue: (v: unknown) => void })
    .mockResolvedValue([]);
  mockDb.qtIssue.count.mockResolvedValue(0 as never);
  mockDb.qtIssue.findMany.mockResolvedValue([] as never);
  mockDb.qtIssueStatus.findMany.mockResolvedValue([] as never);
  mockDb.user.findMany.mockResolvedValue([] as never);
}

/** The caller's org tier. "member" keeps withProjectAccess's fullAccess bypass
 *  shut so the permission gate is actually exercised. */
function setOrgRole(role: string) {
  mockDb.orgMember.findFirst.mockResolvedValue({ role } as never);
}

/** Give the caller a non-Space-Admin project role that either holds
 *  ProjectSummary:view or does not. */
function setProjectGrant(granted: boolean) {
  mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
    projectRoleId: "prole_1",
    projectRole: { name: "Contributor" },
  } as never);
  mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(
    granted ? ({ id: "grant_1" } as never) : (null as never),
  );
}

beforeEach(() => {
  resetMockDb();
  arrangeCommon();
  setOrgRole("member");
  process.env.NEXTAUTH_SECRET = AGENT_NEXTAUTH_SECRET;
});

afterEach(() => {
  delete process.env.NEXTAUTH_SECRET;
});

describe("session identity", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: ORG, role: "member" });
  });

  it("403s a project member whose role does not grant ProjectSummary:view", async () => {
    setProjectGrant(false);
    const res = await call(request());
    expect(res.status).toBe(403);
  });

  it("200s a project member whose role grants ProjectSummary:view", async () => {
    setProjectGrant(true);
    const res = await call(request());
    expect(res.status).toBe(200);
  });
});

describe("agent-JWT identity", () => {
  beforeEach(() => {
    // Present but must never be consulted — the agent-JWT branch never falls
    // back to a cookie session. If it did, these cases would pass for the
    // wrong reason.
    setSession({ id: USER, orgId: ORG, role: "owner" });
  });

  it("403s an agent JWT for a member whose role does not grant ProjectSummary:view", async () => {
    setProjectGrant(false);
    const res = await call(request(await mintAgentJwt()));
    expect(res.status).toBe(403);
  });

  it("200s an agent JWT for a member whose role grants ProjectSummary:view", async () => {
    setProjectGrant(true);
    const res = await call(request(await mintAgentJwt()));
    expect(res.status).toBe(200);
  });
});

describe("admin bypass — unchanged by the new gate", () => {
  it("200s an org admin with no project role at all", async () => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    setOrgRole("admin"); // withProjectAccess's fullAccess short-circuit
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue(null as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null as never);
    const res = await call(request());
    expect(res.status).toBe(200);
  });

  it("200s a Space Admin whose project role carries no explicit grant row", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    // Space Admin is allowed by userCanInProject's own name check, NOT by
    // withProjectAccess's fullAccess — so a missing grant row must not deny.
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "prole_sa",
      projectRole: { name: "Space Admin" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null as never);
    const res = await call(request());
    expect(res.status).toBe(200);
  });
});
