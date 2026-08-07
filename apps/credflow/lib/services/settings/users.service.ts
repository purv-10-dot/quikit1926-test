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
 * with their user". Invite/create mirrors QuikScale:
 *   auth.User → quikit.OrgMember → quikit.UserAppAccess (QuikCRM app)
 *   → app_quikcrm.UserAppRole + RolePermission (+ optional templates / account ACL).
 *
 * Native invites hash a password (default Quikit123 when omitted) and send
 * the shared QuikIT onboarding email. SSO invites store a null password.
 */

import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  INVITE_METHOD,
  renderInvitationEmail,
  type SsoProvider,
} from "@quikit/shared";

/**
 * TODO(integration): the vendored @quikit/shared exported this; the monorepo's
 * shared package does not. Kept app-local so the de-vendor doesn't require a
 * change to the shared package — upstream it once the integration owner agrees.
 */
const DEFAULT_INVITE_PASSWORD = "Quikit123";
import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";
import { prisma } from "@/lib/db/prisma";
import { syncUserCrmAppRole, isCrmRbacClientReady } from "@/lib/api/crm-rbac";
import { rbacDb, type CrmRbacDb } from "@/lib/api/crm-rbac-client";
import { ensureQuikCrmAppAccess, getQuikCrmAppId } from "@/lib/api/quikcrm-app";
import { audit, diffShallow } from "@/lib/services/audit";
import { sendTransactionalEmail } from "@/lib/services/email/send";
import {
  inviteAppBaseUrl,
  normalizeInviteEmail,
  resolveTemplateIdsForRole,
  shouldSendInviteEmail,
} from "@/lib/services/settings/invite-helpers";
import { mapMembershipToCrmRole } from "@/lib/auth/require";
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
  orgId: string;
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
  appRoles: { role: { id: string; name: string } }[];
  allowedAccounts: { accountId: string }[];
}

async function fetchUserView(
  orgId: string,
  userId: string,
): Promise<SettingsUserView | null> {
  const m = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: orgId, userId } },
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
  const appId = await getQuikCrmAppId();
  const [permissionTemplates, appRoles, allowedAccounts] = await Promise.all([
    prisma.qcfUserPermissionTemplate.findMany({
      where: { userId },
      include: { template: { select: { id: true, name: true } } },
    }),
    appId && isCrmRbacClientReady()
      // rbacDb() is non-null here because isCrmRbacClientReady() returned true
      ? rbacDb()!.crmUserAppRole.findMany({
          where: { userId, orgId: orgId, role: { appId } },
        })
      : Promise.resolve([]),
    prisma.qcfUserAccountAccess.findMany({
      where: { userId },
      select: { accountId: true },
    }),
  ]);
  return {
    id: userId,
    orgId,
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
    appRoles: appRoles.map((ar) => ({
      role: { id: ar.role.id, name: ar.role.name },
    })),
    allowedAccounts: allowedAccounts.map((a) => ({ accountId: a.accountId })),
  };
}

export async function listUsers(opts: {
  orgId: string;
  q?: string;
  status?: "Active" | "Inactive" | "active" | "inactive";
  role?: string;
  page: number;
  pageSize: number;
}) {
  // Build a Membership where filter; join the User for free-text search.
  const where: Record<string, unknown> = { orgId: opts.orgId };
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
  const appId = await getQuikCrmAppId();
  const [tpl, roles, acl] = await Promise.all([
    prisma.qcfUserPermissionTemplate.findMany({
      where: { userId: { in: userIds } },
      include: { template: { select: { id: true, name: true } } },
    }),
    appId && isCrmRbacClientReady()
      ? rbacDb()!.crmUserAppRole.findMany({
          where: { userId: { in: userIds }, orgId: opts.orgId, role: { appId } },
        })
      : Promise.resolve([]),
    prisma.qcfUserAccountAccess.findMany({
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
  const roleByUser = new Map<string, SettingsUserView["appRoles"]>();
  for (const r of roles) {
    const arr = roleByUser.get(r.userId) ?? [];
    arr.push({ role: { id: r.role.id, name: r.role.name } });
    roleByUser.set(r.userId, arr);
  }
  const aclByUser = new Map<string, SettingsUserView["allowedAccounts"]>();
  for (const a of acl) {
    const arr = aclByUser.get(a.userId) ?? [];
    arr.push({ accountId: a.accountId });
    aclByUser.set(a.userId, arr);
  }

  const items: SettingsUserView[] = memberships.map((m) => ({
    id: m.userId,
    orgId: m.orgId,
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
    appRoles: roleByUser.get(m.userId) ?? [],
    allowedAccounts: aclByUser.get(m.userId) ?? [],
  }));

  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function getUser(orgId: string, id: string) {
  return fetchUserView(orgId, id);
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
    linkExistingUserId?: string;
    invitationMethod?: "native" | "sso";
  };
}) {
  const { actor, data } = opts;
  const normalisedEmail = normalizeInviteEmail(data.email);
  const invitationMethod =
    data.invitationMethod === "sso" ? INVITE_METHOD.SSO : INVITE_METHOD.NATIVE;
  const membershipStatus = data.status === "Active" ? "active" : "inactive";

  let ssoProvider: SsoProvider | null = null;
  if (!data.linkExistingUserId && invitationMethod === INVITE_METHOD.SSO) {
    ssoProvider = await classifySsoProviderAsync(normalisedEmail);
    if (!ssoProvider) {
      throw new SettingsConflictError(
        "SSO invitations require a Google or Microsoft email address.",
        422,
      );
    }
  }

  const isNativeNewUser =
    !data.linkExistingUserId && invitationMethod === INVITE_METHOD.NATIVE;
  const usedDefaultPassword = isNativeNewUser && !data.password;
  const effectivePassword = usedDefaultPassword ? DEFAULT_INVITE_PASSWORD : data.password;

  const tenantTemplates = await prisma.qcfPermissionTemplate.findMany({
    where: { orgId: actor.orgId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const templateIds = resolveTemplateIdsForRole(
    data.role,
    data.permissionTemplateIds,
    tenantTemplates,
  );

  let newUserId!: string;
  let newUserCreated = false;
  let invitationToken: string | null = null;

  await prisma.$transaction(async (tx) => {
    if (data.linkExistingUserId) {
      const member = await tx.orgMember.findUnique({
        where: { orgId_userId: { orgId: actor.orgId, userId: data.linkExistingUserId } },
        select: { userId: true },
      });
      if (!member) {
        throw new SettingsConflictError("User is not a member of this organisation", 404);
      }
      newUserId = member.userId;
    } else {
      const existingUser = await tx.user.findUnique({ where: { email: normalisedEmail } });

      if (existingUser) {
        const existingMembership = await tx.orgMember.findUnique({
          where: { orgId_userId: { orgId: actor.orgId, userId: existingUser.id } },
        });
        if (existingMembership) {
          throw new SettingsConflictError(
            `A user with email "${normalisedEmail}" is already a member of this organisation. Pick them from the user list to grant QuikCRM access.`,
          );
        }

        invitationToken = crypto.randomUUID();
        await tx.orgMember.create({
          data: {
            orgId: actor.orgId,
            userId: existingUser.id,
            role: data.role,
            status: membershipStatus,
            createdBy: actor.userId,
            invitationToken,
            invitedAt: new Date(),
            inviteMethod: invitationMethod,
            inviteProvider: ssoProvider,
          },
        });
        newUserId = existingUser.id;
      } else {
        const isSso = invitationMethod === INVITE_METHOD.SSO;
        const hashedPassword = isSso
          ? null
          : await bcrypt.hash(effectivePassword!.trim(), 12);

        const user = await tx.user.create({
          data: {
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            email: normalisedEmail,
            password: hashedPassword,
            mustChangePassword: !isSso,
          },
        });

        invitationToken = crypto.randomUUID();
        await tx.orgMember.create({
          data: {
            orgId: actor.orgId,
            userId: user.id,
            role: data.role,
            status: membershipStatus,
            createdBy: actor.userId,
            invitationToken,
            invitedAt: new Date(),
            inviteMethod: invitationMethod,
            inviteProvider: ssoProvider,
          },
        });
        newUserId = user.id;
        newUserCreated = true;
      }
    }

    if (templateIds.length > 0) {
      await tx.qcfUserPermissionTemplate.createMany({
        data: templateIds.map((templateId) => ({
          userId: newUserId,
          templateId,
        })),
        skipDuplicates: true,
      });
    }
    if (data.allowedAccountIds.length > 0) {
      await tx.qcfUserAccountAccess.createMany({
        data: data.allowedAccountIds.map((accountId) => ({
          userId: newUserId,
          accountId,
        })),
        skipDuplicates: true,
      });
    }

    await audit(
      {
        orgId: actor.orgId,
        userId: actor.userId,
        module: MODULE,
        action: "create",
        resourceId: newUserId,
        after: { email: normalisedEmail, role: data.role },
        metadata: {
          invitedExisting: !newUserCreated && !data.linkExistingUserId,
          linkExistingUserId: data.linkExistingUserId ?? null,
          invitationMethod,
        },
      },
      tx,
    );
  });

  await ensureQuikCrmAppAccess({
    userId: newUserId,
    orgId: actor.orgId,
    grantedBy: actor.userId,
  });

  await syncUserCrmAppRole(newUserId, actor.orgId, data.role, actor.userId);

  if (shouldSendInviteEmail({ linkExistingUserId: data.linkExistingUserId, invitationToken })) {
    try {
      const [org, inviter, appRow] = await Promise.all([
        prisma.org.findUnique({
          where: { id: actor.orgId },
          select: { name: true, brandColor: true },
        }),
        prisma.user.findUnique({
          where: { id: actor.userId },
          select: { firstName: true, lastName: true },
        }),
        getQuikCrmAppId().then((appId) =>
          appId
            ? prisma.app.findUnique({ where: { id: appId }, select: { name: true } })
            : Promise.resolve(null),
        ),
      ]);

      const { subject, html } = renderInvitationEmail({
        to: normalisedEmail,
        firstName: data.firstName.trim(),
        orgName: org?.name ?? "your organisation",
        orgLogoUrl: null,
        orgBrandColor: org?.brandColor ?? null,
        inviterName: inviter
          ? `${inviter.firstName} ${inviter.lastName}`.trim() || "QuikCRM Admin"
          : "QuikCRM Admin",
        role: data.role,
        appNames: [appRow?.name ?? "QuikCRM"],
        token: invitationToken!,
        appBaseUrl: inviteAppBaseUrl(),
        inviteMethod: invitationMethod,
        ssoProvider,
        tempPassword: usedDefaultPassword ? DEFAULT_INVITE_PASSWORD : effectivePassword,
      });

      await sendTransactionalEmail({
        to: [normalisedEmail],
        subject,
        text: subject,
        html,
      });
    } catch (err) {
      console.error("[settings/users] onboarding email failed:", err);
    }
  }

  const view = await fetchUserView(actor.orgId, newUserId);
  if (!view) {
    throw new SettingsConflictError("User was created but could not be loaded", 500);
  }

  const tempPassword =
    newUserCreated && usedDefaultPassword ? DEFAULT_INVITE_PASSWORD : null;

  return {
    user: view,
    tempPassword,
    meta: {
      usedDefaultPassword,
      newUserCreated,
      linkedExisting: Boolean(data.linkExistingUserId),
    },
  };
}

export async function updateUser(opts: {
  actor: SessionUser;
  id: string;
  patch: UpdateUserInput;
}) {
  const { actor, id, patch } = opts;

  const result = await prisma.$transaction(async (tx) => {
    const before = await fetchUserView(actor.orgId, id);
    if (!before) throw new SettingsConflictError("User not found", 404);

    // `before.role` is the raw membership string ("admin", "owner",
    // "Administrator", …). Normalize it to the canonical CRM role the way the
    // rest of the app does, so admin-shaped roles are recognized consistently.
    const beforeCrmRole = mapMembershipToCrmRole(before.role);

    const isSelf = id === actor.userId;
    if (isSelf) {
      if (patch.role && patch.role !== beforeCrmRole && beforeCrmRole === ADMIN_ROLE) {
        throw new SettingsConflictError("You cannot change your own Administrator role");
      }
      if (patch.status && patch.status === "Inactive" && before.status === "active") {
        throw new SettingsConflictError("You cannot disable your own account");
      }
    }

    if (
      (patch.role && patch.role !== ADMIN_ROLE && beforeCrmRole === ADMIN_ROLE) ||
      (patch.status && patch.status === "Inactive" && beforeCrmRole === ADMIN_ROLE)
    ) {
      // Count *effective* admins, not just rows literally spelled
      // "Administrator". The membership.role column mixes conventions
      // ("admin", "owner", "Administrator"); mapMembershipToCrmRole collapses
      // them the same way auth does, so the last-admin check can't be fooled
      // by a casing/spelling mismatch.
      const otherActiveMembers = await tx.orgMember.findMany({
        where: {
          orgId: actor.orgId,
          status: "active",
          userId: { not: id },
        },
        select: { role: true },
      });
      const otherActiveAdmins = otherActiveMembers.filter(
        (m) => mapMembershipToCrmRole(m.role) === ADMIN_ROLE,
      ).length;
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
        where: { orgId_userId: { orgId: actor.orgId, userId: id } },
        data: membershipPatch,
      });
    }

    if (patch.permissionTemplateIds !== undefined) {
      await tx.qcfUserPermissionTemplate.deleteMany({ where: { userId: id } });
      if (patch.permissionTemplateIds.length > 0) {
        await tx.qcfUserPermissionTemplate.createMany({
          data: patch.permissionTemplateIds.map((templateId) => ({
            userId: id,
            templateId,
          })),
          skipDuplicates: true,
        });
      }
    }
    if (patch.allowedAccountIds !== undefined) {
      await tx.qcfUserAccountAccess.deleteMany({ where: { userId: id } });
      if (patch.allowedAccountIds.length > 0) {
        await tx.qcfUserAccountAccess.createMany({
          data: patch.allowedAccountIds.map((accountId) => ({
            userId: id,
            accountId,
          })),
          skipDuplicates: true,
        });
      }
    }

    const after = await fetchUserView(actor.orgId, id);
    const diff = diffShallow(
      JSON.parse(JSON.stringify(before)) as Record<string, unknown>,
      JSON.parse(JSON.stringify(after)) as Record<string, unknown>,
    );
    await audit(
      {
        orgId: actor.orgId,
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

  if (patch.role !== undefined) {
    await syncUserCrmAppRole(id, actor.orgId, patch.role, actor.userId);
  }

  return result;
}

export async function deleteUser(opts: { actor: SessionUser; id: string }) {
  const { actor, id } = opts;
  if (id === actor.userId) {
    throw new SettingsConflictError("You cannot delete your own account");
  }

  return prisma.$transaction(async (tx) => {
    const target = await tx.orgMember.findUnique({
      where: { orgId_userId: { orgId: actor.orgId, userId: id } },
      include: { user: { select: { email: true } } },
    });
    if (!target) throw new SettingsConflictError("User not found", 404);

    if (target.role === ADMIN_ROLE) {
      const otherAdmins = await tx.orgMember.count({
        where: {
          orgId: actor.orgId,
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
      tx.qcfLead.count({ where: { orgId: actor.orgId, ownerId: id } }),
      tx.qcfAccount.count({ where: { orgId: actor.orgId, ownerId: id } }),
      tx.qcfOpportunity.count({ where: { orgId: actor.orgId, ownerId: id } }),
    ]);
    if (leadCount + accountCount + oppCount > 0) {
      throw new SettingsConflictError(
        `User owns ${leadCount} leads, ${accountCount} accounts, ${oppCount} opportunities. Reassign before deletion.`,
      );
    }

    // Remove only the membership — the global User row stays (might belong to other tenants).
    await tx.orgMember.delete({
      where: { orgId_userId: { orgId: actor.orgId, userId: id } },
    });
    await tx.qcfUserPermissionTemplate.deleteMany({ where: { userId: id } });
    await tx.qcfUserAccountAccess.deleteMany({ where: { userId: id } });
    if (isCrmRbacClientReady()) {
      // tx cast: these RBAC models aren't in the schema yet; isCrmRbacClientReady()
      // always returns false so this block never executes at runtime.
      const rbacTx = tx as unknown as CrmRbacDb;
      await rbacTx.crmUserAppRole.deleteMany({ where: { userId: id, orgId: actor.orgId } });
      await rbacTx.crmUserPermissionExtra.deleteMany({ where: { userId: id, orgId: actor.orgId } });
    }

    const appId = await getQuikCrmAppId();
    if (appId) {
      await tx.userAppAccess.deleteMany({
        where: { orgId: actor.orgId, appId, userId: id },
      });
    }

    await audit(
      {
        orgId: actor.orgId,
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
 * Password reset for CRM-invited native users is handled via the QuikIT launcher.
 * SSO users reset through their identity provider.
 */
export async function resetUserPassword(_opts: { actor: SessionUser; id: string }) {
  throw new SettingsConflictError(
    "Password reset is managed by the QuikIT launcher — direct users to sign in there.",
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
