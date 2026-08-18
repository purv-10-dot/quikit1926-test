import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { ensureTestTemplates } from "@/lib/services/testStatusProvisioning";
import { serverError } from "@/lib/test/gate";

/**
 * GET /api/test/templates — the org's case templates.
 *
 * `kind` is what the case editor keys off: TEXT shows a single Expected Result,
 * STEPS shows the per-step grid, BDD shows Given/When/Then, EXPLORATORY shows a
 * charter with no formal expectations. Both storage shapes exist on every case,
 * so switching template changes the form, never the stored content.
 *
 * Org-scoped like /api/test/statuses, so no project gate: any member may read
 * the vocabulary.
 */
export const GET = withOrgAuth(async ({ orgId }) => {
  try {
    // Backstop provisioning. The parity migration seeded templates with a CROSS
    // JOIN over then-existing orgs, so a later org had none and this endpoint
    // returned [] — the editor's Template dropdown then showed "No options" and
    // silently fell back to the STEPS layout, making TEXT / BDD / Exploratory
    // unreachable. Project creation provisions these now; this covers an org whose
    // projects all predate that change.
    //
    // Cheap in the normal case: one indexed read that finds all four present and
    // writes nothing.
    //
    // Yes, this is a GET with a WRITE side effect, reachable by any org member —
    // deliberate, and bounded: the rows created are a fixed vocabulary identical
    // regardless of who triggers it, so a member cannot influence WHAT is written,
    // only cause the missing defaults to appear. No caller-supplied input reaches
    // the insert. The alternative — admin-only provisioning — would leave a
    // non-admin tester staring at "No options" with no way to fix it, which is the
    // bug this closes.
    await ensureTestTemplates(orgId);

    const templates = await db.qtTestTemplate.findMany({
      where: { orgId, isDeleted: false },
      select: { id: true, name: true, kind: true, isDefault: true, projectId: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({ success: true, data: templates });
  } catch (error: unknown) {
    return serverError(error);
  }
});
