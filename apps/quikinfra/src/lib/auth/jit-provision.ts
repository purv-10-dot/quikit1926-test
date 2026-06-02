/**
 * JIT (Just-In-Time) provisioning — when an SSO user from QuikIT central
 * lands in QuikInfra for the first time, mirror their row from
 * `auth."User"` into our local `app_quikinfra."User"` table so the
 * rest of the app (middleware role gate, repositories, audit log, etc.)
 * can resolve them by id/email.
 *
 * Called from the dashboard layout's server component before any
 * authenticated page renders. Only writes on first visit — subsequent
 * calls take the "already exists" fast path.
 *
 * NEVER writes to the QuikIT central `auth."User"` table. Auth ownership
 * stays with the QuikIT app; we only READ from it here.
 */

import { db } from "@/lib/db/prisma";

export interface JitResult {
  /** The local construction-app user row (existing or freshly created). */
  localUser: {
    id: string;
    email: string;
    fullName: string;
    userType: string;
    roleKey: string;
    tenantId: string;
    orgId: string;
    status: string;
  } | null;
  /** True when this call inserted a new row (i.e. first SSO login). */
  created: boolean;
  /** True when the user wasn't found in QuikIT either (login should be rejected). */
  notFoundInCentral: boolean;
}

/**
 * Map QuikIT's `isSuperAdmin` flag to a construction-app role key.
 * Non-super-admins get the most-restrictive role; an admin can promote
 * them later via the Settings → Users page.
 */
function deriveRoleKey(isSuperAdmin: boolean): string {
  return isSuperAdmin ? "platform_super_admin" : "site_engineer";
}

function deriveUserType(isSuperAdmin: boolean): string {
  return isSuperAdmin ? "SUPER_ADMIN" : "USER";
}

function deriveFullName(firstName: string | null, lastName: string | null, email: string): string {
  const combined = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (combined) return combined;
  return email.split("@")[0];
}

/**
 * Look up the local user row by email; if missing, read the central
 * `auth."User"` row and INSERT a mirror locally. Returns the local row
 * (existing or freshly created) plus a flag indicating which path ran.
 */
export async function ensureLocalUser(email: string): Promise<JitResult> {
  const normalisedEmail = email.toLowerCase().trim();
  if (!normalisedEmail) {
    return { localUser: null, created: false, notFoundInCentral: false };
  }

  // Fast path — already provisioned.
  const existing = await (db as any).cnUser.findFirst({
    where: { email: normalisedEmail },
    select: {
      id: true,
      email: true,
      fullName: true,
      userType: true,
      roleKey: true,
      tenantId: true,
      orgId: true,
      status: true,
    },
  });
  if (existing) {
    return { localUser: existing, created: false, notFoundInCentral: false };
  }

  // Read the QuikIT central row via raw SQL — the cluster's auth.User table
  // is owned by the monorepo Prisma schema and modelling it locally caused
  // `prisma db push` to propose destructive column-shape changes against it.
  const centralRows = await db.$queryRaw<Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    isSuperAdmin: boolean;
  }>>`
    SELECT id, email, "firstName", "lastName", "isSuperAdmin"
    FROM auth."User"
    WHERE email = ${normalisedEmail}
    LIMIT 1
  `;
  const central = centralRows[0];

  if (!central) {
    // SSO somehow let them through but they're not in auth.User —
    // refuse to mirror. The caller should reject the request.
    return { localUser: null, created: false, notFoundInCentral: true };
  }

  // INSERT the local mirror.
  const created = await (db as any).cnUser.create({
    data: {
      tenantId: "default",
      orgId: "default",
      email: normalisedEmail,
      username: normalisedEmail.split("@")[0],
      fullName: deriveFullName(central.firstName, central.lastName, normalisedEmail),
      passwordHash: "", // unused — auth happens at QuikIT central, never here
      userType: deriveUserType(central.isSuperAdmin),
      roleKey: deriveRoleKey(central.isSuperAdmin),
      modulesAssigned: [],
      projectsAssigned: [],
      status: "active",
      mustChangePassword: false,
      invitedAt: new Date(),
      createdBy: "sso-jit",
      updatedBy: "sso-jit",
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      userType: true,
      roleKey: true,
      tenantId: true,
      orgId: true,
      status: true,
    },
  });

  return { localUser: created, created: true, notFoundInCentral: false };
}
