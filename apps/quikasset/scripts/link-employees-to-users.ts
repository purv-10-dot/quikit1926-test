/**
 * Phase-2 identity-bridge backfill: link AstEmployee -> auth.User by email, and
 * clean up demo/seed employees that map to no real user.
 *
 * Per docs/ASSET_IDENTITY_BRIDGE_PROPOSAL.md + the User-Management merge plan:
 *   - MATCH:   employee.email == User.email (case-insensitive) AND that User is
 *              an OrgMember of the employee's org  ->  set employee.userId.
 *   - DELETE:  no such user AND no assignment/replacement history  ->  a seed
 *              row (e.g. Priya Sharma, Vikram Nair) we delete.
 *   - BLOCKED: no such user BUT has assignment/replacement history -> deleting
 *              would hit the ON DELETE RESTRICT FKs. NOT deleted automatically;
 *              reported for a human decision before --apply.
 *   - Users with no matching employee are LEFT AS-IS (reported as a count).
 *
 * Run (from apps/quikasset, with DATABASE_URL in env):
 *   npx tsx scripts/link-employees-to-users.ts                 # dry-run, all orgs
 *   npx tsx scripts/link-employees-to-users.ts --org=<orgId>   # scope to one org
 *   npx tsx scripts/link-employees-to-users.ts --org=<orgId> --apply
 *
 * --apply links matched employees and deletes only the safe (no-history)
 * unmatched rows; BLOCKED rows are skipped and reported (a deliberate hold —
 * they need a per-row decision). Idempotent.
 */
import { PrismaClient } from "@prisma/client";
import { planEmployee, normEmail, type Bucket } from "./employeeLinkPlan";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const ORG_FILTER = process.argv.find((a) => a.startsWith("--org="))?.slice("--org=".length) ?? null;

type Totals = Record<Bucket, number> & { edge: number; alreadyLinked: number; usersNoEmployee: number };

async function main() {
  const orgRows = await db.astEmployee.findMany({ distinct: ["orgId"], select: { orgId: true } });
  let orgIds = orgRows.map((r) => r.orgId);
  if (ORG_FILTER) {
    const before = orgIds.length;
    orgIds = orgIds.filter((id) => id === ORG_FILTER);
    if (orgIds.length === 0) {
      console.error(`--org=${ORG_FILTER} matched none of the ${before} org(s) with employees. Nothing to do.`);
      return;
    }
  }

  console.log(
    `${APPLY ? "APPLY" : "DRY-RUN"} — Phase 2 employee↔user link` +
      `${ORG_FILTER ? ` — scoped to org ${ORG_FILTER}` : ` across ${orgIds.length} org(s)`}\n`,
  );

  const totals: Totals = { matched: 0, blocked: 0, delete: 0, edge: 0, alreadyLinked: 0, usersNoEmployee: 0 };

  for (const orgId of orgIds) {
    const org = await db.org.findUnique({ where: { id: orgId }, select: { name: true } });
    const employees = await db.astEmployee.findMany({
      where: { orgId },
      select: {
        id: true, name: true, email: true, employeeId: true, userId: true,
        _count: { select: { assignments: true, replacements: true } },
      },
      orderBy: { name: "asc" },
    });
    const members = await db.orgMember.findMany({
      where: { orgId },
      select: { userId: true, user: { select: { id: true, email: true } } },
    });

    const membersByEmail = new Map<string, string>();
    const memberUserIds = new Set<string>();
    for (const m of members) {
      memberUserIds.add(m.userId);
      if (m.user?.email) membersByEmail.set(normEmail(m.user.email), m.user.id);
    }
    const memberEmailById = new Map(members.map((m) => [m.userId, m.user?.email ?? "?"]));

    const matched: string[] = [], toDelete: string[] = [], blocked: string[] = [], edge: string[] = [];
    const linkedUserIds = new Set<string>();
    let alreadyLinked = 0;

    for (const e of employees) {
      const plan = planEmployee(
        { email: e.email, assignments: e._count.assignments, replacements: e._count.replacements },
        membersByEmail,
      );

      if (plan.bucket === "matched") {
        linkedUserIds.add(plan.matchedUserId!);
        if (e.userId === plan.matchedUserId) alreadyLinked++;
        matched.push(`    "${e.name}" <${e.email}>  ->  user ${plan.matchedUserId} <${memberEmailById.get(plan.matchedUserId!)}>` + (e.userId === plan.matchedUserId ? "  (already linked)" : ""));
        if (APPLY && e.userId !== plan.matchedUserId) {
          await db.astEmployee.update({ where: { id: e.id }, data: { userId: plan.matchedUserId } });
        }
        continue;
      }

      // Unmatched by org-member email. Is there a *global* user with this email
      // who just isn't in this org? Surface it — don't silently delete.
      const globalUser = await db.user.findFirst({
        where: { email: { equals: e.email, mode: "insensitive" } },
        select: { id: true, email: true },
      });
      if (globalUser && !memberUserIds.has(globalUser.id)) {
        edge.push(`    "${e.name}" <${e.email}>  — matches user ${globalUser.id} who is NOT a member of this org (asgn=${e._count.assignments}, repl=${e._count.replacements})`);
        continue;
      }

      if (plan.bucket === "blocked") {
        blocked.push(`    "${e.name}" <${e.email}> (employeeId ${e.employeeId})  — assignments=${e._count.assignments}, replacements=${e._count.replacements}`);
      } else {
        toDelete.push(`    "${e.name}" <${e.email}> (employeeId ${e.employeeId})`);
        if (APPLY) await db.astEmployee.delete({ where: { id: e.id } });
      }
    }

    const usersNoEmployee = members.filter((m) => !linkedUserIds.has(m.userId)).length;
    totals.matched += matched.length; totals.blocked += blocked.length; totals.delete += toDelete.length;
    totals.edge += edge.length; totals.alreadyLinked += alreadyLinked; totals.usersNoEmployee += usersNoEmployee;

    console.log(`Org ${orgId}${org?.name ? ` (${org.name})` : ""} — ${employees.length} employee(s), ${members.length} org-member user(s):`);
    console.log(`  [MATCH]   ${APPLY ? "linked" : "would link"}: ${matched.length}  (already linked: ${alreadyLinked})`);
    matched.forEach((l) => console.log(l));
    console.log(`  [DELETE]  no user, no history — ${APPLY ? "deleted" : "would delete"}: ${toDelete.length}`);
    toDelete.forEach((l) => console.log(l));
    console.log(`  [BLOCKED] no user, HAS history — needs decision (NOT deleted): ${blocked.length}`);
    blocked.forEach((l) => console.log(l));
    if (edge.length) {
      console.log(`  [EDGE]    email matches a user NOT in this org — review (NOT deleted): ${edge.length}`);
      edge.forEach((l) => console.log(l));
    }
    console.log(`  org-member users with no employee (left as-is): ${usersNoEmployee}\n`);
  }

  console.log("SUMMARY (all orgs):");
  console.log(`  matched (link):            ${totals.matched}   [already linked: ${totals.alreadyLinked}]`);
  console.log(`  delete (seed, no history): ${totals.delete}`);
  console.log(`  BLOCKED (has history):     ${totals.blocked}   <-- needs your decision before --apply`);
  console.log(`  edge (user not in org):    ${totals.edge}`);
  console.log(`  users with no employee:    ${totals.usersNoEmployee}  (left as-is)`);
  console.log(
    APPLY
      ? `\nAPPLIED. BLOCKED/edge rows were skipped (not deleted).`
      : `\nDry-run only. Re-run with --apply after deciding on BLOCKED rows.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
