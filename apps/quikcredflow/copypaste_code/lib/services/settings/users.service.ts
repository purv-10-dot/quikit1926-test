/**
 * Settings → Users service.
 *
 * Adapted from quikcrm-nextjs/src/lib/services/settings/users.service.ts.
 *
 * In the standalone CRM, every tenant had its own copy of the User row with
 * tenant-scoped role/status/email. The QuikIT monorepo splits that:
 *   - public.User  : global identity (email, firstName, lastName, ...)
 *   - public.Membership : tenant-scoped role/status, joins user ↔ tenant
 *   - public.AuthCredential : DROPPED — auth is via QuikIT SSO (NextAuth)
 *
 * So "list users for tenant X" is now "list memberships for tenant X joined
 * with their user". Create/update/delete map onto Membership rows. Password
 * reset is no longer supported by this app — users reset via QuikIT.
 *
 * The CRM-specific CrmPermissionTemplate / CrmUserAccountAccess link tables
 * still live in app_quikcrm and are managed alongside membership writes.
 */

import { prisma } from "@/lib/db/prisma";
import { audit, diffShallow } from "@/lib/services/audit";
import type { SessionUser } from "@/types/permission";
import type { UpdateUserInput } from "@/lib/validators/settings-users";

export class SettingsConflictError extends Error {
  constructor(message: string, public statusCode = 409) {
    super(message);
  }
}

const MODULE = "users";
const ADMIN_ROLE = "Administrator";

/** Public-facing user shape returned by this service. Compat with legacy callers. */
export interface SettingsUserView {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  emailSignature: string | null;
  createdAt: Date;
  updatedAt: Date;
  permissionTemplates: { template: { id: string; name: string } }[];
  allowedAccounts: { accountId: string }[];
}

async function fetchUserView(
  tenantId: string,
  userId: string,
): Promise<SettingsUserView | null> {
  const m = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: tenantId, userId } },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });
  if (!m) return null;
  const [permissionTemplates, allowedAccounts] = await Promise.all([
    prisma.crmUserPermissionTemplate.findMany({
      where: { userId },
      include: { template: { select: { id: true, name: true } } },
    }),
    prisma.crmUserAccountAccess.findMany({
      where: { userId },
      select: { accountId: true },
    }),
  ]);
  return {
    id: userId,
    tenantId,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    email: m.user.email,
    phone: null,
    role: m.role,
    status: m.status,
    emailSignature: null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    permissionTemplates: permissionTemplates.map((upt) => ({
      template: { id: upt.template.id, name: upt.template.name },
    })),
    allowedAccounts: allowedAccounts.map((a) => ({ accountId: a.accountId })),
  };
}

export async function listUsers(opts: {
  tenantId: string;
  q?: string;
  status?: "Active" | "Inactive" | "active" | "inactive";
  role?: string;
  page: number;
  pageSize: number;
}) {
  // Build a Membership where filter; join the User for free-text search.
  const where: Record<string, unknown> = { orgId: opts.tenantId };
  if (opts.status) {
    where.status = opts.status.toLowerCase() === "active" ? "active" : "inactive";
  }
  if (opts.role) where.role = opts.role;
  if (opts.q) {
    where.user = {
      OR: [
        { email: { contains: opts.q, mode: "insensitive" } },
        { firstName: { contains: opts.q, mode: "insensitive" } },
        { lastName: { contains: opts.q, mode: "insensitive" } },
      ],
    };
  }

  const [memberships, total] = await Promise.all([
    prisma.orgMember.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.orgMember.count({ where }),
  ]);

  const userIds = memberships.map((m) => m.userId);
  const [tpl, acl] = await Promise.all([
    prisma.crmUserPermissionTemplate.findMany({
      where: { userId: { in: userIds } },
      include: { template: { select: { id: true, name: true } } },
    }),
    prisma.crmUserAccountAccess.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, accountId: true },
    }),
  ]);
  const tplByUser = new Map<string, SettingsUserView["permissionTemplates"]>();
  for (const t of tpl) {
    const arr = tplByUser.get(t.userId) ?? [];
    arr.push({ template: { id: t.template.id, name: t.template.name } });
    tplByUser.set(t.userId, arr);
  }
  const aclByUser = new Map<string, SettingsUserView["allowedAccounts"]>();
  for (const a of acl) {
    const arr = aclByUser.get(a.userId) ?? [];
    arr.push({ accountId: a.accountId });
    aclByUser.set(a.userId, arr);
  }

  const items: SettingsUserView[] = memberships.map((m) => ({
    id: m.userId,
    tenantId: m.orgId,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    email: m.user.email,
    phone: null,
    role: m.role,
    status: m.status,
    emailSignature: null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    permissionTemplates: tplByUser.get(m.userId) ?? [],
    allowedAccounts: aclByUser.get(m.userId) ?? [],
  }));

  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function getUser(tenantId: string, id: string) {
  return fetchUserView(tenantId, id);
}

export async function createUser(opts: {
  actor: SessionUser;
  data: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    role: "Administrator" | "SalesManager" | "SalesUser" | "MarketingUser" | "FinanceUser";
    status: "Active" | "Inactive";
    password?: string;
    permissionTemplateIds: string[];
    allowedAccountIds: string[];
    reportingManagerId?: string | null;
  };
}) {
  const { actor, data } = opts;

  return prisma.$transaction(async (tx) => {
    // Upsert the global User row (matched by email — global identity).
    const existing = await tx.user.findUnique({ where: { email: data.email } });
    const user = existing
      ? existing
      : await tx.user.create({
          data: {
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
          },
        });

    // Conflict if a Membership already exists in this tenant.
    const dupe = await tx.orgMember.findUnique({
      where: { orgId_userId: { orgId: actor.tenantId, userId: user.id } },
    });
    if (dupe) {
      throw new SettingsConflictError(
        `A user with email "${data.email}" is already a member of this tenant`,
      );
    }

    await tx.orgMember.create({
      data: {
        orgId: actor.tenantId,
        userId: user.id,
        role: data.role,
        status: data.status === "Active" ? "active" : "inactive",
      },
    });

    if (data.permissionTemplateIds.length > 0) {
      await tx.crmUserPermissionTemplate.createMany({
        data: data.permissionTemplateIds.map((templateId) => ({
          userId: user.id,
          templateId,
        })),
        skipDuplicates: true,
      });
    }
    if (data.allowedAccountIds.length > 0) {
      await tx.crmUserAccountAccess.createMany({
        data: data.allowedAccountIds.map((accountId) => ({
          userId: user.id,
          accountId,
        })),
        skipDuplicates: true,
      });
    }

    const view = await fetchUserView(actor.tenantId, user.id);
    await audit(
      {
        tenantId: actor.tenantId,
        userId: actor.userId,
        module: MODULE,
        action: "create",
        resourceId: user.id,
        after: view ? ({ ...view } as Record<string, unknown>) : null,
        metadata: { invitedExisting: Boolean(existing) },
      },
      tx,
    );

    // Password is managed by QuikIT SSO — never issued here.
    return { user: view!, tempPassword: null as string | null };
  });
}

export async function updateUser(opts: {
  actor: SessionUser;
  id: string;
  patch: UpdateUserInput;
}) {
  const { actor, id, patch } = opts;

  return prisma.$transaction(async (tx) => {
    const before = await fetchUserView(actor.tenantId, id);
    if (!before) throw new SettingsConflictError("User not found", 404);

    const isSelf = id === actor.userId;
    if (isSelf) {
      if (patch.role && patch.role !== before.role && before.role === ADMIN_ROLE) {
        throw new SettingsConflictError("You cannot change your own Administrator role");
      }
      if (patch.status && patch.status === "Inactive" && before.status === "active") {
        throw new SettingsConflictError("You cannot disable your own account");
      }
    }

    if (
      (patch.role && patch.role !== ADMIN_ROLE && before.role === ADMIN_ROLE) ||
      (patch.status && patch.status === "Inactive" && before.role === ADMIN_ROLE)
    ) {
      const otherActiveAdmins = await tx.orgMember.count({
        where: {
          orgId: actor.tenantId,
          role: ADMIN_ROLE,
          status: "active",
          userId: { not: id },
        },
      });
      if (otherActiveAdmins === 0) {
        throw new SettingsConflictError(
          "Cannot remove the last active Administrator from the organization",
        );
      }
    }

    // Profile fields (firstName/lastName/email) live on the global User row.
    const userPatch: Record<string, unknown> = {};
    if (patch.firstName !== undefined) userPatch.firstName = patch.firstName;
    if (patch.lastName !== undefined) userPatch.lastName = patch.lastName;
    if (patch.email !== undefined) userPatch.email = patch.email;
    if (Object.keys(userPatch).length > 0) {
      await tx.user.update({ where: { id }, data: userPatch });
    }

    // Tenant-scoped fields (role/status) live on Membership.
    const membershipPatch: Record<string, unknown> = {};
    if (patch.role !== undefined) membershipPatch.role = patch.role;
    if (patch.status !== undefined) {
      membershipPatch.status = patch.status === "Active" ? "active" : "inactive";
    }
    if (Object.keys(membershipPatch).length > 0) {
      await tx.orgMember.update({
        where: { orgId_userId: { orgId: actor.tenantId, userId: id } },
        data: membershipPatch,
      });
    }

    if (patch.permissionTemplateIds !== undefined) {
      await tx.crmUserPermissionTemplate.deleteMany({ where: { userId: id } });
      if (patch.permissionTemplateIds.length > 0) {
        await tx.crmUserPermissionTemplate.createMany({
          data: patch.permissionTemplateIds.map((templateId) => ({
            userId: id,
            templateId,
          })),
          skipDuplicates: true,
        });
      }
    }
    if (patch.allowedAccountIds !== undefined) {
      await tx.crmUserAccountAccess.deleteMany({ where: { userId: id } });
      if (patch.allowedAccountIds.length > 0) {
        await tx.crmUserAccountAccess.createMany({
          data: patch.allowedAccountIds.map((accountId) => ({
            userId: id,
            accountId,
          })),
          skipDuplicates: true,
        });
      }
    }

    const after = await fetchUserView(actor.tenantId, id);
    const diff = diffShallow(
      JSON.parse(JSON.stringify(before)) as Record<string, unknown>,
      JSON.parse(JSON.stringify(after)) as Record<string, unknown>,
    );
    await audit(
      {
        tenantId: actor.tenantId,
        userId: actor.userId,
        module: MODULE,
        action: "update",
        resourceId: id,
        before: diff.before,
        after: diff.after,
      },
      tx,
    );

    return after!;
  });
}

export async function deleteUser(opts: { actor: SessionUser; id: string }) {
  const { actor, id } = opts;
  if (id === actor.userId) {
    throw new SettingsConflictError("You cannot delete your own account");
  }

  return prisma.$transaction(async (tx) => {
    const target = await tx.orgMember.findUnique({
      where: { orgId_userId: { orgId: actor.tenantId, userId: id } },
      include: { user: { select: { email: true } } },
    });
    if (!target) throw new SettingsConflictError("User not found", 404);

    if (target.role === ADMIN_ROLE) {
      const otherAdmins = await tx.orgMember.count({
        where: {
          orgId: actor.tenantId,
          role: ADMIN_ROLE,
          status: "active",
          userId: { not: id },
        },
      });
      if (otherAdmins === 0) {
        throw new SettingsConflictError("Cannot delete the last active Administrator");
      }
    }

    const [leadCount, accountCount, oppCount] = await Promise.all([
      tx.crmLead.count({ where: { tenantId: actor.tenantId, ownerId: id } }),
      tx.crmAccount.count({ where: { tenantId: actor.tenantId, ownerId: id } }),
      tx.crmOpportunity.count({ where: { tenantId: actor.tenantId, ownerId: id } }),
    ]);
    if (leadCount + accountCount + oppCount > 0) {
      throw new SettingsConflictError(
        `User owns ${leadCount} leads, ${accountCount} accounts, ${oppCount} opportunities. Reassign before deletion.`,
      );
    }

    // Remove only the membership — the global User row stays (might belong to other tenants).
    await tx.orgMember.delete({
      where: { orgId_userId: { orgId: actor.tenantId, userId: id } },
    });
    await tx.crmUserPermissionTemplate.deleteMany({ where: { userId: id } });
    await tx.crmUserAccountAccess.deleteMany({ where: { userId: id } });

    await audit(
      {
        tenantId: actor.tenantId,
        userId: actor.userId,
        module: MODULE,
        action: "delete",
        resourceId: id,
        before: { email: target.user.email, role: target.role },
      },
      tx,
    );
  });
}

/**
 * Password reset is not handled by this app — users sign in via QuikIT SSO.
 * Kept as a no-op that throws so the existing API surface still has a
 * call site, but consumers should redirect to QuikIT's own reset flow.
 */
export async function resetUserPassword(_opts: { actor: SessionUser; id: string }) {
  throw new SettingsConflictError(
    "Password reset is managed by QuikIT SSO — direct users to the launcher.",
    410,
  );
}

export async function setUserStatus(opts: {
  actor: SessionUser;
  id: string;
  status: "Active" | "Inactive";
}) {
  return updateUser({ actor: opts.actor, id: opts.id, patch: { status: opts.status } });
}
