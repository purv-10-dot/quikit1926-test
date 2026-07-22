import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { getQuikAssetAppId } from "@/lib/api/permissions";
import { seedAllDefaultRoles, ensureUserOnRole } from "@/lib/api/seedAppRoles";
import { ensureLinkedEmployee } from "@/lib/api/employeeLink";
import { removedUserIds } from "@/lib/api/removal";
import {
  INVITE_METHOD,
  renderInvitationEmail,
  type SsoProvider,
} from "@quikit/shared";
import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";
import { generateTempPassword } from "@quikit/shared/temp-password";
import { sendEmail } from "@/lib/email/sendEmail";

type InviteMethod = (typeof INVITE_METHOD)[keyof typeof INVITE_METHOD];

// Query params for the list endpoint. All optional; absent → no filter.
//   q          — free-text match on the login User (name/email) OR the linked
//                employee (employeeId/department/designation), case-insensitive
//   status     — OrgMember.status
//   roleId     — an AstAppRole.id, or the sentinel "none" for users with no app role
//   department — linked AstEmployee.department (exact)
const listQuerySchema = z.object({
  q: z.string().trim().max(128).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  roleId: z.string().trim().min(1).optional(),
  department: z.string().trim().min(1).optional(),
});

const createUserSchema = z.object({
  firstName: z.string().trim().min(1).max(64),
  lastName: z.string().trim().min(1).max(64),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128).optional(),
  /** Legacy OrgMember tier. RBAC lives in the AppRole below. */
  role: z.enum(["owner", "admin", "member"]).optional(),
  /** AstAppRole.id to assign instead of the org default. */
  appRoleId: z.string().min(1).optional(),
  /** When set, skip user/membership creation — only grant app access + role. */
  linkExistingUserId: z.string().min(1).optional(),
  /**
   * "native" → admin-supplied (or default) password; credentials sign-in.
   * "sso"    → no password; provider auth (Google / Microsoft) only.
   * Defaults to "native" for back-compat with the old payload shape.
   */
  invitationMethod: z.enum(["native", "sso"]).optional(),
  // ── Employee-directory fields ──
  // The unified Add flow creates/links an AstEmployee alongside the login user.
  // All optional; employeeId auto-generates (EMP-####) when blank.
  employeeId: z.string().trim().max(64).optional(),
  contact: z.string().trim().max(64).optional(),
  department: z.string().trim().max(128).optional(),
  designation: z.string().trim().max(128).optional(),
  joiningDate: z.string().trim().max(32).optional(),
});

function buildUserResponse(
  m: {
    id: string;
    role: string;
    status: string;
    createdAt: Date;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      avatar: string | null;
      lastSignInAt: Date | null;
    };
  },
  appRole: { id: string; name: string } | null,
  employee?: {
    employeeId: string;
    contact: string | null;
    department: string | null;
    designation: string | null;
    joiningDate: string | null;
    status: string;
  } | null,
) {
  return {
    membershipId: m.id,
    userId: m.user.id,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    email: m.user.email,
    avatar: m.user.avatar,
    lastSignInAt: m.user.lastSignInAt?.toISOString() ?? null,
    role: m.role,
    status: m.status,
    joinedAt: m.createdAt.toISOString(),
    appRoleId: appRole?.id ?? null,
    appRoleName: appRole?.name ?? null,
    // Linked employee (identity bridge AstEmployee.userId → User); null when the
    // user has no employee record yet.
    employeeId: employee?.employeeId ?? null,
    contact: employee?.contact ?? null,
    department: employee?.department ?? null,
    designation: employee?.designation ?? null,
    joiningDate: employee?.joiningDate ?? null,
    employeeStatus: employee?.status ?? null,
  };
}

// GET /api/org/users — the merged people list: every OrgMember with QuikAsset
// access in this org, each row combining login info + app role + the linked
// AstEmployee record (identity bridge). Server-side filters: q / status /
// roleId / department. Self-heals any role-less user to Member on read.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const appId = await getQuikAssetAppId();

    // Tenants that haven't registered QuikAsset yet → no users to show.
    if (!appId) {
      return NextResponse.json({ success: true, data: [] });
    }

    const parsedQuery = listQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsedQuery.success) {
      return NextResponse.json(
        { success: false, error: parsedQuery.error.errors[0]?.message ?? "Invalid query" },
        { status: 400 },
      );
    }
    const { q, status, roleId, department } = parsedQuery.data;

    const accessRows = await db.userAppAccess.findMany({
      where: { orgId, appId },
      select: { userId: true },
      distinct: ["userId"],
    });
    let candidateUserIds = accessRows.map((r) => r.userId);

    // Hide soft-removed users (removed from QuikAsset) from the merged list.
    const removed = await removedUserIds(orgId, candidateUserIds);
    if (removed.size > 0) candidateUserIds = candidateUserIds.filter((id) => !removed.has(id));

    // Role filter — narrow the candidate set by app-role membership before the
    // main query. "none" = users who have QuikAsset access but no app role.
    if (roleId && candidateUserIds.length > 0) {
      const roleRows = await db.astUserAppRole.findMany({
        where: {
          orgId,
          userId: { in: candidateUserIds },
          role: { appId },
          ...(roleId === "none" ? {} : { roleId }),
        },
        select: { userId: true },
      });
      const withMatchingRole = new Set(roleRows.map((r) => r.userId));
      candidateUserIds =
        roleId === "none"
          ? candidateUserIds.filter((id) => !withMatchingRole.has(id))
          : candidateUserIds.filter((id) => withMatchingRole.has(id));
    }

    // Department filter — narrow to users whose linked employee is in that dept.
    if (department && candidateUserIds.length > 0) {
      const deptRows = await db.astEmployee.findMany({
        where: { orgId, userId: { in: candidateUserIds }, department },
        select: { userId: true },
      });
      const inDept = new Set(deptRows.map((r) => r.userId).filter((id): id is string => !!id));
      candidateUserIds = candidateUserIds.filter((id) => inDept.has(id));
    }

    // Free-text search — matches the login User (name/email) OR the linked
    // employee (employeeId/department/designation). The merged view spans both,
    // so we pre-narrow the candidate set to the union rather than filtering the
    // membership query on one side only.
    if (q && candidateUserIds.length > 0) {
      const [userMatches, empMatches] = await Promise.all([
        db.user.findMany({
          where: {
            id: { in: candidateUserIds },
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          select: { id: true },
        }),
        db.astEmployee.findMany({
          where: {
            orgId,
            userId: { in: candidateUserIds },
            OR: [
              { employeeId: { contains: q, mode: "insensitive" } },
              { department: { contains: q, mode: "insensitive" } },
              { designation: { contains: q, mode: "insensitive" } },
            ],
          },
          select: { userId: true },
        }),
      ]);
      const matched = new Set<string>([
        ...userMatches.map((u) => u.id),
        ...empMatches.map((e) => e.userId).filter((id): id is string => !!id),
      ]);
      candidateUserIds = candidateUserIds.filter((id) => matched.has(id));
    }

    if (candidateUserIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const memberships = await db.orgMember.findMany({
      where: {
        orgId,
        userId: { in: candidateUserIds },
        ...(status ? { status } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
            lastSignInAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (memberships.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }
    const userIds = memberships.map((m) => m.user.id);

    // Linked employee records (identity bridge). `?? []` guards the case where
    // the query resolves to nothing.
    const employees =
      (await db.astEmployee.findMany({
        where: { orgId, userId: { in: userIds } },
        select: {
          userId: true,
          employeeId: true,
          contact: true,
          department: true,
          designation: true,
          joiningDate: true,
          status: true,
        },
      })) ?? [];
    const employeeByUserId = new Map(
      employees
        .filter((e): e is typeof e & { userId: string } => !!e.userId)
        .map((e) => [e.userId, e]),
    );

    // App roles for the listed users.
    const appRoleByUserId = new Map<string, { id: string; name: string }>();
    const userRoles = await db.astUserAppRole.findMany({
      where: { orgId, userId: { in: userIds }, role: { appId } },
      select: { userId: true, role: { select: { id: true, name: true } } },
    });
    for (const ur of userRoles) {
      appRoleByUserId.set(ur.userId, { id: ur.role.id, name: ur.role.name });
    }

    // Read-time self-heal: any listed user with QuikAsset access but no app role
    // is assigned the default Member role (idempotent). Guarantees no user is
    // ever left "No role" — including those granted access via platform paths
    // QuikAsset doesn't control. Never overwrites an existing (custom) role.
    const roleless = userIds.filter((id) => !appRoleByUserId.has(id));
    if (roleless.length > 0) {
      const { memberRoleId } = await seedAllDefaultRoles(orgId);
      for (const uid of roleless) {
        await ensureUserOnRole(uid, orgId, memberRoleId);
        appRoleByUserId.set(uid, { id: memberRoleId, name: "Member" });
      }
    }

    const users = memberships.map((m) =>
      buildUserResponse(
        m,
        appRoleByUserId.get(m.user.id) ?? null,
        employeeByUserId.get(m.user.id) ?? null,
      ),
    );
    return NextResponse.json({ success: true, data: users });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list users";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/org/users — three branches:
//   A. linkExistingUserId set — grant app access + role only
//   B. email matches existing platform User — add OrgMember + the rest
//   C. brand-new email — create User + OrgMember + the rest
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, userId: actorId } = auth as { orgId: string; userId: string };

    const parsed = createUserSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const {
      firstName,
      lastName,
      email,
      password,
      role = "member",
      appRoleId,
      linkExistingUserId,
      invitationMethod = "native",
      employeeId,
      contact,
      department,
      designation,
      joiningDate,
    } = parsed.data;

    const normalisedEmail = email.trim().toLowerCase();

    // Required employee fields for adding a NEW person. Skipped when granting
    // access to an existing member (link) — that's a different action and the
    // member already has (or the server will link) an employee. Also skipped
    // when an employee already exists for this email (we'll link it). Validated
    // up front, before creating the login, so a failure can't orphan a login.
    if (!linkExistingUserId) {
      const existingEmployee = await db.astEmployee.findFirst({
        where: { orgId, email: { equals: normalisedEmail, mode: "insensitive" } },
        select: { id: true },
      });
      if (!existingEmployee) {
        const missing: string[] = [];
        if (!employeeId?.trim()) missing.push("Employee ID");
        if (!contact?.trim()) missing.push("Contact");
        if (!department?.trim()) missing.push("Department");
        if (missing.length > 0) {
          return NextResponse.json(
            { success: false, error: `Required field(s) missing: ${missing.join(", ")}.` },
            { status: 400 },
          );
        }
        // Reject a duplicate Employee ID before creating anything.
        const clash = await db.astEmployee.findFirst({
          where: { orgId, employeeId: employeeId!.trim() },
          select: { id: true },
        });
        if (clash) {
          return NextResponse.json(
            { success: false, error: "That Employee ID is already in use in this organisation." },
            { status: 409 },
          );
        }
      }
    }

    // SSO branch — confirm the email actually hosts on Google Workspace or
    // Microsoft 365 via MX lookup. We don't want to mint a passwordless user who
    // can never sign in.
    let ssoProvider: SsoProvider | null = null;
    if (!linkExistingUserId && invitationMethod === INVITE_METHOD.SSO) {
      ssoProvider = (await classifySsoProviderAsync(normalisedEmail)) as SsoProvider | null;
      if (!ssoProvider) {
        return NextResponse.json(
          {
            success: false,
            error:
              "SSO invitations require a Google or Microsoft email address. Pick Native instead, or use a different address.",
          },
          { status: 422 },
        );
      }
    }

    // Compute defaults once, up front. Native + no admin password → generate a
    // fresh friendly temp password so the hash matches the value the onboarding
    // email renders and the admin can be shown once.
    const isNativeNewUser =
      !linkExistingUserId && invitationMethod === INVITE_METHOD.NATIVE;
    const usedDefaultPassword = isNativeNewUser && !password;
    const generatedTempPassword = usedDefaultPassword ? generateTempPassword() : null;
    const effectivePassword = generatedTempPassword ?? password;

    // ─── Resolve newUserId across the three paths ───
    let newUserId: string;
    /** True when path C ran (brand-new User row created). Helps the UI decide
     *  whether to refresh the list or just toast "Granted access". */
    let newUserCreated = false;

    if (linkExistingUserId) {
      // Path A — verify the target is already a member of this org.
      const existing = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId, userId: linkExistingUserId } },
        select: { userId: true },
      });
      if (!existing) {
        return NextResponse.json(
          { success: false, error: "User is not a member of this organisation" },
          { status: 404 },
        );
      }
      newUserId = linkExistingUserId;
    } else {
      const existingUser = await db.user.findUnique({ where: { email: normalisedEmail } });
      const isSso = invitationMethod === INVITE_METHOD.SSO;
      if (existingUser) {
        // Path B — user exists, but check if already in this org.
        const existingMembership = await db.orgMember.findUnique({
          where: { orgId_userId: { orgId, userId: existingUser.id } },
        });
        if (existingMembership) {
          return NextResponse.json(
            {
              success: false,
              error:
                "This user is already a member of the organisation. Pick them from the email dropdown to grant QuikAsset access.",
            },
            { status: 409 },
          );
        }
        await db.orgMember.create({
          data: {
            orgId,
            userId: existingUser.id,
            role,
            status: "active",
            createdBy: actorId,
            inviteMethod: invitationMethod,
            inviteProvider: ssoProvider,
            invitationToken: crypto.randomUUID(),
            invitedAt: new Date(),
          },
        });
        newUserId = existingUser.id;
      } else {
        // Path C — create the User row.
        //
        // SSO → password stays NULL so the credentials provider can't auth.
        // Native → admin-supplied password, OR a freshly-generated friendly temp
        //          password if the admin left it blank. The temp gets emailed to
        //          the invitee verbatim; they're forced to change it on first
        //          login via the accept-invite flow.
        const hashedPassword = isSso
          ? null
          : await bcrypt.hash(effectivePassword!.trim(), 12);
        const user = await db.user.create({
          data: {
            firstName,
            lastName,
            email: normalisedEmail,
            password: hashedPassword,
            // Native invitees must reset on first login; SSO never has a password.
            mustChangePassword: !isSso,
          },
        });
        await db.orgMember.create({
          data: {
            orgId,
            userId: user.id,
            role,
            status: "active",
            createdBy: actorId,
            inviteMethod: invitationMethod,
            inviteProvider: ssoProvider,
            invitationToken: crypto.randomUUID(),
            invitedAt: new Date(),
          },
        });
        newUserId = user.id;
        newUserCreated = true;
      }
    }

    // ─── UserAppAccess + UserAppRole ───
    const appId = await getQuikAssetAppId();
    let appRole: { id: string; name: string } | null = null;
    if (appId) {
      const existingAccess = await db.userAppAccess.findFirst({
        where: { orgId, appId, userId: newUserId },
        select: { id: true },
      });
      if (!existingAccess) {
        await db.userAppAccess.create({
          data: { userId: newUserId, orgId, appId, role: "member", grantedBy: actorId },
        });
      }

      const { adminRoleId, memberRoleId } = await seedAllDefaultRoles(orgId);

      // Resolve target AppRole: explicit > admin-fallback > default Member.
      let targetRoleId: string;
      let targetRoleName: string;
      if (appRoleId) {
        const r = await db.astAppRole.findFirst({
          where: { id: appRoleId, orgId, appId },
          select: { id: true, name: true },
        });
        if (!r) {
          return NextResponse.json(
            { success: false, error: "Selected role not found" },
            { status: 400 },
          );
        }
        targetRoleId = r.id;
        targetRoleName = r.name;
      } else {
        // Safety: if the org has zero admin members, the first invitee becomes
        // admin to prevent an admin-less org.
        const adminMemberCount = await db.astUserAppRole.count({
          where: { orgId, roleId: adminRoleId },
        });
        targetRoleId = adminMemberCount === 0 ? adminRoleId : memberRoleId;
        targetRoleName = adminMemberCount === 0 ? "admin" : "Member";
      }

      await ensureUserOnRole(newUserId, orgId, targetRoleId, actorId);
      appRole = { id: targetRoleId, name: targetRoleName };
    }

    // ─── Linked AstEmployee (identity bridge) ───
    // The unified Add creates the employee record alongside the login, linked
    // via userId. Links a pre-existing employee that matches by email instead
    // of duplicating it.
    const employee = await ensureLinkedEmployee({
      orgId,
      userId: newUserId,
      email: normalisedEmail,
      name: `${firstName} ${lastName}`.trim(),
      employeeId,
      contact,
      department,
      designation,
      joiningDate,
    });

    const membership = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: newUserId } },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
            lastSignInAt: true,
          },
        },
      },
    });

    // ─── Onboarding email ───
    // Native: "Here's your temporary password" + link to /login
    // SSO:    "Sign in with Google/Microsoft" — never includes a password.
    // Only sent for brand-new / newly-added members (not the link-existing path).
    if (!linkExistingUserId && membership?.invitationToken) {
      try {
        const [org, inviter] = await Promise.all([
          db.org.findUnique({
            where: { id: orgId },
            select: { name: true, brandColor: true },
          }),
          db.user.findUnique({
            where: { id: actorId },
            select: { firstName: true, lastName: true },
          }),
        ]);

        // Invitation links land users on the QuikIT launcher, whose marketing
        // landing auto-opens a LoginModal for /invitations/accept + ?token=…
        const appBaseUrl =
          process.env.NEXT_PUBLIC_QUIKIT_URL ??
          process.env.QUIKIT_URL ??
          "http://localhost:3001";

        const { subject, html } = renderInvitationEmail({
          to: normalisedEmail,
          firstName: firstName.trim(),
          orgName: org?.name ?? "your organisation",
          orgLogoUrl: null,
          orgBrandColor: org?.brandColor ?? null,
          inviterName: inviter
            ? `${inviter.firstName} ${inviter.lastName}`.trim() || "QuikAsset Admin"
            : "QuikAsset Admin",
          role: appRole?.name ?? "Member",
          appNames: ["QuikAsset"],
          token: membership.invitationToken,
          appBaseUrl,
          inviteMethod: invitationMethod as InviteMethod,
          ssoProvider,
          tempPassword: generatedTempPassword ?? "",
        });

        await sendEmail({ to: normalisedEmail, subject, html });
      } catch (err) {
        // Email failures must not roll back user creation.
        console.error("[org/users] onboarding email failed:", err);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          ...buildUserResponse(membership!, appRole, employee),
          // Plaintext temp password — shown ONCE in the admin UI when the server
          // generated one (Native + no admin-supplied pw).
          tempPassword: generatedTempPassword ?? undefined,
        },
        meta: { usedDefaultPassword, newUserCreated },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create user";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
