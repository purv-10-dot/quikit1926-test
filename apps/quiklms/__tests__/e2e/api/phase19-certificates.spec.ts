/**
 * PHASE 19 — Certificates: the `/api/certificates/*` surface plus the PUBLIC
 * `/api/verify-certificate/*` pair.
 *
 * Templates (authoring + approval workflow)
 *   POST|GET            /api/certificates
 *   GET|PUT|DELETE      /api/certificates/[id]
 *   POST                /api/certificates/[id]/approve        (SUPER_ADMIN)
 *   POST                /api/certificates/[id]/reject         (SUPER_ADMIN)
 *   GET                 /api/certificates/pending-approvals   (SUPER_ADMIN)
 *   GET                 /api/certificates/all-approval-items  (SUPER_ADMIN)
 *   GET                 /api/certificates/my-submissions      (TENANT_ADMIN|SUB_ADMIN)
 *   POST                /api/certificates/upload-{background,logo,signature}
 *   DELETE              /api/certificates/bulk/delete-all     (SUPER_ADMIN)
 *   POST                /api/certificates/cleanup-duplicates  (SUPER_ADMIN)
 *
 * Issuance + delivery
 *   POST                /api/certificates/generate
 *   GET                 /api/certificates/my-certificates
 *   GET                 /api/certificates/tenant/issued-certificates
 *   GET                 /api/certificates/[id]/download        (PDF bytes)
 *   GET                 /api/certificates/[id]/download-url    (presigned S3)
 *   POST                /api/certificates/track-download
 *
 * Public
 *   GET                 /api/verify-certificate/[certificateId]
 *   GET                 /api/verify-certificate/[certificateId]/download
 *
 * DELIBERATELY NOT EXERCISED ON THE HAPPY PATH:
 * `DELETE /api/certificates/bulk/delete-all` calls
 * `prisma.lmsCertificate.deleteMany({})` with NO filter — every template in
 * EVERY tenant (lib/services/certificates-service.ts:490-493). Running it would
 * destroy the fixture org's data and any other org sharing the database. Only
 * its authorization gate is asserted; the destructive path is left alone on
 * purpose.
 */

import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { apiAs, apiAnon, safeJson } from "../fixtures/api";
import { loadManifest, mintSessionToken } from "../fixtures/auth";

const m = loadManifest();
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3020";
const MISSING = "00000000-0000-0000-0000-000000000000";
const RUN = `AUDIT19-${Date.now()}`;
const LEARNER_B_EMAIL = "e2e-learner-b@quiklms.test";

/** See phase14: dev-server cold compiles blow the 15s actionTimeout. */
const CEIL = 60_000;
const GET = (a: APIRequestContext, p: string) => a.get(p, { timeout: CEIL });
const POST = (a: APIRequestContext, p: string, data?: unknown) =>
  a.post(p, { timeout: CEIL, ...(data !== undefined ? { data } : {}) });
const PUT = (a: APIRequestContext, p: string, data: unknown) => a.put(p, { timeout: CEIL, data });
const DELETE = (a: APIRequestContext, p: string) => a.delete(p, { timeout: CEIL });

interface Envelope<T> {
  success?: boolean;
  data?: T;
  message?: string;
  statusCode?: number;
  count?: number;
}
interface Template {
  id: string;
  _id?: string;
  name: string;
  backgroundImageUrl: string;
  designation: string | null;
  signatoryName: string | null;
  isActive: boolean;
  approvalStatus: string;
  submittedBy: string | null;
  submittedByTenantId: string | null;
  rejectionReason: string | null;
  approvedBy: string | null;
}
interface Issued {
  id: string;
  certificateId: string;
  learnerId: string | { id: string; email: string; name?: string };
  courseId: string | { _id: string; title: string };
  courseName: string;
  learnerName: string;
  certificateTemplateId: string | { _id: string; name: string };
  score: number | null;
  passingScore: number | null;
  passed: boolean | null;
  verificationUrl: string;
}

async function provisionLearnerB(): Promise<{ id: string; api: APIRequestContext }> {
  const admin = await apiAs("tenantAdmin");
  const res = await POST(admin, "/api/auth/register", {
    email: LEARNER_B_EMAIL,
    firstName: "E2E",
    lastName: "LearnerB",
    role: "LEARNER",
  });
  expect(res.status()).toBe(201);
  const id = ((await safeJson(res)) as Envelope<{ id: string }>).data!.id;
  await admin.dispose();
  const token = await mintSessionToken("learner", { id, sub: id, email: LEARNER_B_EMAIL });
  const api = await request.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Cookie: `next-auth.session-token=${token}` },
  });
  return { id, api };
}

/**
 * `backgroundImageUrl` is REQUIRED and non-nullable
 * (packages/database/prisma/schema.prisma, model LmsCertificate), and the route
 * body is `z.object({}).passthrough()` — so omitting it 500s rather than 400s.
 * See the dedicated test in the guards describe.
 */
function templatePayload(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    backgroundImageUrl: "https://example.test/audit-bg.png",
    designation: "Head of Audit",
    signatoryName: "E2E Signatory",
    ...extra,
  };
}

// ── Template authoring + approval workflow ───────────────────────────────────

test.describe("Phase 19 — template CRUD and approval", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  let admin: APIRequestContext;
  let superAdmin: APIRequestContext;
  let approvedId: string;
  let rejectedId: string;

  test.beforeAll(async () => {
    // Hooks do NOT inherit `test.setTimeout()` from the describe body — they keep
    // the 45s default (playwright.config.ts:19). This fixture makes several
    // sequential round-trips against dev routes, which exceeds that on a loaded
    // server and fails as an opaque hook timeout that skips the whole describe.
    test.setTimeout(180_000);
    admin = await apiAs("tenantAdmin");
    superAdmin = await apiAs("superAdmin");
  });
  test.afterAll(async () => {
    await admin.dispose();
    await superAdmin.dispose();
  });

  test("a tenant admin's new template lands in pending_approval and INACTIVE", async () => {
    const res = await POST(admin, "/api/certificates", templatePayload(`${RUN} Approved`));
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<Template>;
    approvedId = body.data!.id;
    // app/api/certificates/route.ts:35-42 — a tenant admin cannot self-approve.
    expect(body.data!.approvalStatus).toBe("pending_approval");
    expect(body.data!.isActive).toBe(false);
    expect(body.data!.submittedBy).toBe(m.users.tenantAdmin.lmsUserId);
    expect(body.data!.submittedByTenantId).toBe(m.orgId);
    expect(body.message).toContain("submitted for approval");
  });

  test("the pending template is visible to its submitter and to the approver queue", async () => {
    const mine = (await safeJson(await GET(admin, "/api/certificates/my-submissions"))) as Envelope<
      Template[]
    >;
    expect(mine.data!.some((t) => t.id === approvedId)).toBe(true);

    const pending = (await safeJson(
      await GET(superAdmin, "/api/certificates/pending-approvals"),
    )) as Envelope<Template[]>;
    expect(pending.data!.some((t) => t.id === approvedId)).toBe(true);

    const all = (await safeJson(
      await GET(superAdmin, "/api/certificates/all-approval-items"),
    )) as Envelope<Template[]>;
    expect(all.data!.some((t) => t.id === approvedId)).toBe(true);
  });

  test("GET by id returns the template with the Mongo-parity _id alias", async () => {
    const res = await GET(admin, `/api/certificates/${approvedId}`);
    expect(res.status()).toBe(200);
    const t = ((await safeJson(res)) as Envelope<Template>).data!;
    expect(t.name).toBe(`${RUN} Approved`);
    expect(t._id, "shapeTemplate exposes _id for the ported UI").toBe(approvedId);
    expect(t.designation).toBe("Head of Audit");
  });

  test("approve activates the template and records the approver", async () => {
    const res = await POST(superAdmin, `/api/certificates/${approvedId}/approve`);
    expect(res.status()).toBe(200);

    const t = ((await safeJson(await GET(admin, `/api/certificates/${approvedId}`))) as Envelope<Template>)
      .data!;
    expect(t.approvalStatus).toBe("approved");
    expect(t.isActive).toBe(true);
    expect(t.approvedBy).toBe(m.users.superAdmin.lmsUserId);
    expect(t.rejectionReason).toBeNull();
  });

  test("approving a template that is no longer pending is refused", async () => {
    const res = await POST(superAdmin, `/api/certificates/${approvedId}/approve`);
    expect(res.status(), "certificates-service.ts:405 — only pending may be approved").toBe(404);
  });

  test("reject records the reason and leaves the template inactive", async () => {
    const created = (await safeJson(
      await POST(admin, "/api/certificates", templatePayload(`${RUN} Rejected`)),
    )) as Envelope<Template>;
    rejectedId = created.data!.id;

    const res = await POST(superAdmin, `/api/certificates/${rejectedId}/reject`, {
      reason: `${RUN} not on brand`,
    });
    expect(res.status()).toBe(200);

    const t = ((await safeJson(await GET(admin, `/api/certificates/${rejectedId}`))) as Envelope<Template>)
      .data!;
    expect(t.approvalStatus).toBe("rejected");
    expect(t.isActive).toBe(false);
    expect(t.rejectionReason).toBe(`${RUN} not on brand`);
  });

  test("a rejected template is NOT silently resurrected by the tenant listing", async () => {
    // DELIBERATE DEVIATION from the legacy, documented at
    // certificates-service.ts:295-305: the original's "last resort" branch
    // rescued templates of ANY status — including ones a super admin had just
    // rejected — flipping them back to `approved` and putting them live, which
    // bypassed the approval workflow entirely.
    const list = (await safeJson(await GET(admin, "/api/certificates"))) as Envelope<Template[]>;
    const resurrected = list.data!.find((t) => t.id === rejectedId);
    expect(
      resurrected,
      "APPROVAL BYPASS: a rejected template reappeared in the tenant's active list",
    ).toBeFalsy();

    const t = ((await safeJson(await GET(admin, `/api/certificates/${rejectedId}`))) as Envelope<Template>)
      .data!;
    expect(t.approvalStatus, "a rejected template was flipped back to approved").toBe("rejected");
  });

  test("an edit by a tenant admin sends the template BACK for approval", async () => {
    const res = await PUT(admin, `/api/certificates/${approvedId}`, {
      name: `${RUN} Approved EDITED`,
      signatoryName: "New Signatory",
    });
    expect(res.status()).toBe(200);

    const t = ((await safeJson(await GET(admin, `/api/certificates/${approvedId}`))) as Envelope<Template>)
      .data!;
    expect(t.name).toBe(`${RUN} Approved EDITED`);
    expect(t.signatoryName).toBe("New Signatory");
    // app/api/certificates/[id]/route.ts:37-44 — editing an approved design
    // must not leave it live unreviewed.
    expect(t.approvalStatus, "an edited template stayed approved without re-review").toBe(
      "pending_approval",
    );
    expect(t.isActive).toBe(false);
  });

  test("unknown fields in a template payload are dropped, not persisted", async () => {
    // `pickTemplateFields` allow-lists the writable columns
    // (certificates-service.ts:254-258); Prisma would otherwise 500 on an
    // unknown argument, which is what the designer UI's stray state used to do.
    const res = await PUT(admin, `/api/certificates/${approvedId}`, {
      name: `${RUN} Approved EDITED`,
      someUiState: { scrollTop: 42 },
      createdAt: "1999-01-01T00:00:00.000Z",
      id: MISSING,
    });
    expect(res.status(), "a stray field must not 500 the save").toBe(200);
    const t = ((await safeJson(await GET(admin, `/api/certificates/${approvedId}`))) as Envelope<Template>)
      .data!;
    expect(t.id, "the id must not be rewritable").toBe(approvedId);
  });

  test("DELETE removes a template the tenant owns", async () => {
    const res = await DELETE(admin, `/api/certificates/${rejectedId}`);
    expect(res.status()).toBe(200);
    expect(((await safeJson(res)) as Envelope<never>).message).toContain("deleted");
    expect((await GET(admin, `/api/certificates/${rejectedId}`)).status()).toBe(404);
  });

  test("re-submitting for approval clears the previous approval provenance", async () => {
    /**
     * FAILING BY DESIGN — verified.
     *
     * The route explicitly clears the old decision when an edit sends a
     * template back for review:
     *
     *   app/api/certificates/[id]/route.ts:36
     *     updateData.approvalDate = null; updateData.approvedBy = null;
     *     updateData.rejectionReason = null;
     *
     * but `updateTemplate` funnels the payload through `pickTemplateFields`,
     * whose allow-list `TEMPLATE_WRITABLE`
     * (lib/services/certificates-service.ts:248-258) contains neither
     * `approvedBy`, `approvalDate` nor `rejectionReason`. All three are
     * silently dropped, so only `approvalStatus` and `isActive` — which ARE on
     * the list — take effect.
     *
     * Observed on the template edited in the previous test: `approvalStatus`
     * is back to `pending_approval` while `approvedBy` still names the super
     * admin who approved the PREVIOUS revision, and `approvalDate` still holds
     * that decision's timestamp. A reviewer opening the queue sees a template
     * marked as awaiting approval that also claims to have been approved, by
     * someone who never saw this revision. The same gap leaves a stale
     * `rejectionReason` on a template that has since been edited.
     *
     * Severity: Low — no access-control impact, but it corrupts the audit
     * trail of an approval workflow, which is the one thing that workflow
     * exists to produce.
     */
    const t = ((await safeJson(await GET(admin, `/api/certificates/${approvedId}`))) as Envelope<Template>)
      .data!;
    expect(t.approvalStatus).toBe("pending_approval");
    expect(
      t.approvedBy,
      "STALE APPROVAL PROVENANCE: the route nulls approvedBy/approvalDate/rejectionReason " +
        "(app/api/certificates/[id]/route.ts:36) but certificates-service.ts:248-258 drops all " +
        "three — they are absent from TEMPLATE_WRITABLE — so a template awaiting re-review " +
        "still names its previous approver.",
    ).toBeNull();
  });
});

// ── Issuance, delivery and public verification ───────────────────────────────

test.describe("Phase 19 — issuance and delivery", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  let admin: APIRequestContext;
  let superAdmin: APIRequestContext;
  let learner: APIRequestContext;
  let templateId: string;
  let issued: Issued;

  test.beforeAll(async () => {
    // Hooks do NOT inherit `test.setTimeout()` from the describe body — they keep
    // the 45s default (playwright.config.ts:19). This fixture makes several
    // sequential round-trips against dev routes, which exceeds that on a loaded
    // server and fails as an opaque hook timeout that skips the whole describe.
    test.setTimeout(180_000);
    admin = await apiAs("tenantAdmin");
    superAdmin = await apiAs("superAdmin");
    learner = await apiAs("learner");

    const created = (await safeJson(
      await POST(admin, "/api/certificates", templatePayload(`${RUN} Issue`)),
    )) as Envelope<Template>;
    templateId = created.data!.id;
    expect((await POST(superAdmin, `/api/certificates/${templateId}/approve`)).status()).toBe(200);
  });
  test.afterAll(async () => {
    await admin.dispose();
    await superAdmin.dispose();
    await learner.dispose();
  });

  test("generate issues a certificate with a public certificateId", async () => {
    const res = await POST(admin, "/api/certificates/generate", {
      certificateTemplateId: templateId,
      learnerId: m.users.learner.lmsUserId,
      courseId: m.courses.published,
      userName: "E2E Learner",
      courseName: "E2E Published Course",
      score: 90,
      passingScore: 50,
      passed: true,
    });
    expect(res.status()).toBe(200);
    issued = ((await safeJson(res)) as Envelope<Issued>).data!;
    expect(issued.id).toBeTruthy();
    expect(issued.certificateId).toMatch(/^CERT-/);
    expect(issued.verificationUrl).toContain(issued.certificateId);
    expect(issued.passed).toBe(true);
  });

  test("the learner sees it in my-certificates with the course populated", async () => {
    const res = await GET(learner, "/api/certificates/my-certificates");
    expect(res.status()).toBe(200);
    const rows = ((await safeJson(res)) as Envelope<Issued[]>).data!;
    const row = rows.find((c) => c.id === issued.id);
    expect(row, "the issued certificate must reach the learner").toBeTruthy();
    expect(typeof row!.courseId, "courseId must be the populated course").toBe("object");
    expect((row!.courseId as { title: string }).title).toBeTruthy();
  });

  test("the tenant issued-certificates report includes it with the learner populated", async () => {
    const res = await GET(admin, "/api/certificates/tenant/issued-certificates");
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<Issued[]>;
    const row = body.data!.find((c) => c.id === issued.id);
    expect(row).toBeTruthy();
    expect((row!.learnerId as { email: string }).email).toBe(m.users.learner.email.toLowerCase());
    expect(body.count).toBe(body.data!.length);
  });

  test("re-generating for the same (learner, course) does not duplicate", async () => {
    const res = await POST(admin, "/api/certificates/generate", {
      certificateTemplateId: templateId,
      learnerId: m.users.learner.lmsUserId,
      courseId: m.courses.published,
      userName: "E2E Learner",
      courseName: "E2E Published Course",
    });
    expect(res.status()).toBe(200);
    const again = ((await safeJson(res)) as Envelope<Issued>).data!;
    expect(again.certificateId, "a second issue must reuse the existing record").toBe(
      issued.certificateId,
    );
  });

  test("the owner can download a real PDF", async () => {
    const res = await GET(learner, `/api/certificates/${issued.id}/download`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    const body = await res.body();
    // A genuine PDF, not a JSON error rendered with the wrong content type.
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(body.length).toBeGreaterThan(1000);
  });

  test("track-download accepts a best-effort ping", async () => {
    const res = await POST(learner, "/api/certificates/track-download", {
      certificateId: issued.certificateId,
    });
    expect(res.status()).toBe(200);
    expect(((await safeJson(res)) as Envelope<never>).success).toBe(true);
  });

  test("download-url is ownership-scoped and never 500s", async () => {
    // `getPresignedDownloadUrl` enforces ownership IN THE QUERY
    // (`{id, orgId, learnerId}`, certificates-service.ts:1291) and throws
    // NotFound when the PDF has never been uploaded — which is the case
    // wherever S3 is not configured, as in a local audit environment.
    const res = await GET(learner, `/api/certificates/${issued.id}/download-url`);
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = (await safeJson(res)) as Envelope<{ url: string }>;
      expect(body.data!.url).toContain("http");
    } else {
      expect(((await safeJson(res)) as Envelope<never>).message).toMatch(/not found/i);
    }
  });

  test("public verification resolves the certificate without a session", async () => {
    const anon = await apiAnon();
    const res = await GET(anon, `/api/verify-certificate/${issued.certificateId}`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<Issued>;
    expect(body.success).toBe(true);
    // The populate parity that stops the public trust page printing "N/A"
    // everywhere (certificates-service.ts:812-822).
    expect(typeof body.data!.learnerId).toBe("object");
    expect((body.data!.learnerId as { name: string }).name).toBeTruthy();
    expect((body.data!.courseId as { title: string }).title).toBeTruthy();
    expect((body.data!.certificateTemplateId as { name: string }).name).toBeTruthy();
    await anon.dispose();
  });

  test("the public download returns a PDF without a session", async () => {
    const anon = await apiAnon();
    const res = await GET(anon, `/api/verify-certificate/${issued.certificateId}/download`);
    expect(res.status()).toBe(200);
    expect((await res.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    await anon.dispose();
  });

  test("public verification of an unknown certificate does not leak an error", async () => {
    const anon = await apiAnon();
    const res = await GET(anon, "/api/verify-certificate/CERT-does-not-exist-000");
    const body = (await safeJson(res)) as Envelope<never>;
    expect(body.success).toBe(false);
    expect(body.message).toContain("not found");
    await anon.dispose();
  });

  test("the public download of an unknown certificate is a clean 404", async () => {
    const anon = await apiAnon();
    const res = await GET(anon, `/api/verify-certificate/CERT-does-not-exist-000/download`);
    expect(res.status()).toBe(404);
    await anon.dispose();
  });

  test("cleanup-duplicates runs for a super admin and reports a count", async () => {
    const res = await POST(superAdmin, "/api/certificates/cleanup-duplicates");
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<never> & { removed?: number };
    expect(body.success).toBe(true);
    expect(typeof body.removed).toBe("number");

    // The certificate issued above must survive a duplicate sweep.
    const still = (await safeJson(
      await GET(admin, "/api/certificates/tenant/issued-certificates"),
    )) as Envelope<Issued[]>;
    expect(
      still.data!.some((c) => c.certificateId === issued.certificateId),
      "cleanup-duplicates removed a certificate that had no duplicate",
    ).toBe(true);
  });
});

// ── Ownership of issued certificates ─────────────────────────────────────────

test.describe("Phase 19 — a learner cannot download another learner's certificate", () => {
  test.setTimeout(180_000);

  let admin: APIRequestContext;
  let superAdmin: APIRequestContext;
  let learnerB: APIRequestContext;
  let learnerBId: string;
  let issuedToA: Issued;

  test.beforeAll(async () => {
    // Hooks do NOT inherit `test.setTimeout()` from the describe body — they keep
    // the 45s default (playwright.config.ts:19). This fixture makes several
    // sequential round-trips against dev routes, which exceeds that on a loaded
    // server and fails as an opaque hook timeout that skips the whole describe.
    test.setTimeout(180_000);
    admin = await apiAs("tenantAdmin");
    superAdmin = await apiAs("superAdmin");
    ({ id: learnerBId, api: learnerB } = await provisionLearnerB());

    const created = (await safeJson(
      await POST(admin, "/api/certificates", templatePayload(`${RUN} Cross`)),
    )) as Envelope<Template>;
    await POST(superAdmin, `/api/certificates/${created.data!.id}/approve`);

    const gen = await POST(admin, "/api/certificates/generate", {
      certificateTemplateId: created.data!.id,
      learnerId: m.users.learner.lmsUserId,
      courseId: m.courses.draft,
      userName: "E2E Learner",
      courseName: "E2E Draft Course",
      score: 95,
      passingScore: 50,
      passed: true,
    });
    issuedToA = ((await safeJson(gen)) as Envelope<Issued>).data!;
  });
  test.afterAll(async () => {
    await admin.dispose();
    await superAdmin.dispose();
    await learnerB?.dispose();
  });

  test("learner B is refused the download of learner A's certificate", async () => {
    // The ownership gate is HARDENING, not a port: the legacy handler gated on
    // role alone and let any authenticated learner download any certificate by
    // id (app/api/certificates/[id]/download/route.ts:11-17).
    const res = await GET(learnerB, `/api/certificates/${issuedToA.id}/download`);
    expect(res.status(), "LEAK: B downloaded A's certificate").toBe(404);
  });

  test("learner B is refused the presigned url for learner A's certificate", async () => {
    const res = await GET(learnerB, `/api/certificates/${issuedToA.id}/download-url`);
    expect(res.status(), "LEAK: B obtained a presigned url for A's certificate").toBe(404);
  });

  test("learner B's my-certificates contains only their own", async () => {
    const rows = ((await safeJson(
      await GET(learnerB, "/api/certificates/my-certificates"),
    )) as Envelope<Issued[]>).data!;
    expect(rows.some((c) => c.id === issuedToA.id), "LEAK: A's certificate listed for B").toBe(false);
    for (const c of rows) {
      const lid = typeof c.learnerId === "string" ? c.learnerId : c.learnerId.id;
      expect(lid).toBe(learnerBId);
    }
  });

  test("a LEARNER cannot read the tenant-wide issued-certificates report", async () => {
    const res = await GET(learnerB, "/api/certificates/tenant/issued-certificates");
    expect(res.status(), "the tenant report names every learner in the org").toBe(403);
  });

  test("the PUBLIC verification endpoint must not disclose the holder's email — regression for F-004", async () => {
    /**
     * FAILING BY DESIGN — this is TEST_REPORT.md finding **F-004 (High)**,
     * already raised by `__tests__/e2e/security/phase04-public-endpoints.spec.ts`.
     * It is re-asserted here from the certificates domain so that whoever fixes
     * the redaction has a test in this file too, rather than discovering the
     * regression only from the security project.
     *
     * `verifyCertificate` selects `email` alongside the name and returns it
     * verbatim (lib/services/certificates-service.ts:826-831, 845-848) on a
     * route that is unauthenticated by design
     * (app/api/verify-certificate/[certificateId]/route.ts:5). A verification
     * page needs the holder's NAME to answer "is this genuine?"; the email
     * address, internal ids and exam score are not part of that answer.
     */
    const anon = await apiAnon();
    const raw = await (await GET(anon, `/api/verify-certificate/${issuedToA.certificateId}`)).text();
    await anon.dispose();
    expect(
      raw,
      "F-004: the public certificate-verification response carries the holder's email " +
        "address to an anonymous caller (certificates-service.ts:826-831).",
    ).not.toContain(m.users.learner.email.toLowerCase());
  });
});

// ── Access control and error shapes ──────────────────────────────────────────

test.describe("Phase 19 — guards", () => {
  test.setTimeout(150_000);

  test("only a SUPER_ADMIN may approve or reject", async () => {
    for (const role of ["tenantAdmin", "subAdmin", "manager", "teacher", "learner"] as const) {
      const api = await apiAs(role);
      expect(
        (await POST(api, `/api/certificates/${MISSING}/approve`)).status(),
        `${role} reached approve`,
      ).toBe(403);
      expect(
        (await POST(api, `/api/certificates/${MISSING}/reject`, { reason: "x" })).status(),
        `${role} reached reject`,
      ).toBe(403);
      await api.dispose();
    }
  });

  test("only a SUPER_ADMIN may read the approval queues", async () => {
    for (const role of ["tenantAdmin", "manager", "learner"] as const) {
      const api = await apiAs(role);
      expect((await GET(api, "/api/certificates/pending-approvals")).status()).toBe(403);
      expect((await GET(api, "/api/certificates/all-approval-items")).status()).toBe(403);
      await api.dispose();
    }
  });

  test("the unfiltered bulk delete is refused to everyone below SUPER_ADMIN", async () => {
    // The success path is NOT exercised — `deleteAllTemplates` is
    // `deleteMany({})` across every tenant (certificates-service.ts:490-493).
    // This asserts the gate that stands between that call and a tenant admin.
    for (const role of ["tenantAdmin", "subAdmin", "manager", "teacher", "learner"] as const) {
      const api = await apiAs(role);
      const res = await DELETE(api, "/api/certificates/bulk/delete-all");
      expect(res.status(), `${role} reached the cross-tenant bulk delete`).toBe(403);
      await api.dispose();
    }
  });

  test("cleanup-duplicates is refused below SUPER_ADMIN", async () => {
    for (const role of ["tenantAdmin", "manager", "learner"] as const) {
      const api = await apiAs(role);
      expect((await POST(api, "/api/certificates/cleanup-duplicates")).status()).toBe(403);
      await api.dispose();
    }
  });

  test("a LEARNER cannot author templates or issue certificates", async () => {
    const learner = await apiAs("learner");
    expect((await POST(learner, "/api/certificates", templatePayload(`${RUN} illegal`))).status()).toBe(403);
    expect((await PUT(learner, `/api/certificates/${MISSING}`, { name: "x" })).status()).toBe(403);
    expect((await DELETE(learner, `/api/certificates/${MISSING}`)).status()).toBe(403);
    expect((await GET(learner, `/api/certificates/${MISSING}`)).status()).toBe(403);
    expect(
      (await POST(learner, "/api/certificates/generate", {
        learnerId: m.users.learner.lmsUserId,
        courseId: m.courses.published,
        userName: "x",
        courseName: "y",
      })).status(),
    ).toBe(403);
    await learner.dispose();
  });

  test("a LEARNER cannot upload template assets", async () => {
    const learner = await apiAs("learner");
    for (const p of [
      "/api/certificates/upload-background",
      "/api/certificates/upload-logo",
      "/api/certificates/upload-signature",
    ]) {
      const res = await learner.post(p, {
        timeout: CEIL,
        multipart: {
          file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
        },
      });
      expect(res.status(), `${p} was reachable by a learner`).toBe(403);
    }
    await learner.dispose();
  });

  test("a MANAGER may read certificates but not author them", async () => {
    const manager = await apiAs("manager");
    // GET /api/certificates admits MANAGER; POST does not.
    expect((await GET(manager, "/api/certificates")).status()).toBe(200);
    expect((await GET(manager, "/api/certificates/my-certificates")).status()).toBe(200);
    expect((await POST(manager, "/api/certificates", templatePayload(`${RUN} mgr`))).status()).toBe(403);
    // …and the per-template detail route excludes MANAGER entirely.
    expect((await GET(manager, `/api/certificates/${MISSING}`)).status()).toBe(403);
    await manager.dispose();
  });

  test("a nonexistent template id yields 404 on GET/PUT/approve/reject", async () => {
    const superAdmin = await apiAs("superAdmin");
    expect((await GET(superAdmin, `/api/certificates/${MISSING}`)).status()).toBe(404);
    expect((await PUT(superAdmin, `/api/certificates/${MISSING}`, { name: "x" })).status()).toBe(404);
    expect((await POST(superAdmin, `/api/certificates/${MISSING}/approve`)).status()).toBe(404);
    expect(
      (await POST(superAdmin, `/api/certificates/${MISSING}/reject`, { reason: "x" })).status(),
    ).toBe(404);
    await superAdmin.dispose();
  });

  test("a nonexistent issued certificate yields 404 on download", async () => {
    const learner = await apiAs("learner");
    const res = await GET(learner, `/api/certificates/${MISSING}/download`);
    expect(res.status()).toBe(404);
    await learner.dispose();
  });

  test("unauthenticated access to the authenticated surface is rejected", async () => {
    const anon = await apiAnon();
    for (const p of [
      "/api/certificates",
      "/api/certificates/my-certificates",
      "/api/certificates/pending-approvals",
      "/api/certificates/tenant/issued-certificates",
      `/api/certificates/${MISSING}/download`,
    ]) {
      expect([401, 403], `${p} was reachable anonymously`).toContain((await GET(anon, p)).status());
    }
    await anon.dispose();
  });

  test("a template payload missing a required column yields 400, not 500", async () => {
    /**
     * FAILING BY DESIGN — verified.
     *
     * `backgroundImageUrl` is a required, non-nullable column on
     * `LmsCertificate`, but the route validates the body with
     * `z.object({}).passthrough()` (app/api/certificates/route.ts:22), so
     * nothing checks it. The insert reaches Prisma, which raises a validation
     * error that `toErrorResponse` does not recognise (it maps only ZodError,
     * P2002 and P2025 — lib/http.ts:84,99,107), and the caller gets an opaque
     * `500 Internal server error` with no indication of the offending field.
     *
     * Reproduced: POST /api/certificates {"name":"…","designation":"…"} → 500.
     * Adding `backgroundImageUrl` to the same payload → 200.
     *
     * Severity: Low — an input-validation gap, not a security boundary, but it
     * turns a fixable user error into an unactionable server error and logs it
     * as an unhandled exception.
     */
    const admin = await apiAs("tenantAdmin");
    const res = await POST(admin, "/api/certificates", {
      name: `${RUN} no-background`,
      designation: "Director",
    });
    const status = res.status();
    await admin.dispose();
    expect(
      status,
      "UNVALIDATED INPUT: a missing required column surfaces as a 500 instead of a " +
        "field-level 400 (app/api/certificates/route.ts:22 uses a passthrough schema; " +
        "lib/http.ts:84,99,107 has no mapping for a Prisma validation error).",
    ).toBeLessThan(500);
  });

  test("the public verification of an unknown id answers 404, not 200", async () => {
    /**
     * FAILING BY DESIGN — verified.
     *
     * app/api/verify-certificate/[certificateId]/route.ts:8 returns
     * `json({success:false, message:'Certificate not found'})` with NO status
     * argument, so `json()` defaults to 200 (lib/http.ts:56-58). A public
     * verification page — and any monitoring or integration in front of it —
     * sees HTTP 200 for a certificate that does not exist, and only a body
     * field distinguishes a forged id from a genuine one.
     *
     * The sibling `/download` route on the same id correctly answers 404, so
     * the two halves of the public API disagree.
     *
     * Severity: Low (correctness//semantics, no data exposed).
     */
    const anon = await apiAnon();
    const res = await GET(anon, "/api/verify-certificate/CERT-definitely-not-real-1");
    const status = res.status();
    await anon.dispose();
    expect(
      status,
      "WRONG STATUS: an unknown certificate verifies with HTTP 200 and a {success:false} body " +
        "(app/api/verify-certificate/[certificateId]/route.ts:8 omits the status argument to " +
        "json(), which defaults to 200).",
    ).toBe(404);
  });
});
