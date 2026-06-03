import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { db as dbCentral } from "@quikit/database";
import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";
import { generateTempPassword } from "@quikit/shared/temp-password";
import { renderInvitationEmail } from "@quikit/shared";
import { formatRoleLabel } from "@/lib/rbac/user-types";
// generateInviteToken removed in Step C — invite tokens live entirely
// on quikit.OrgMember.invitationToken now. Expiry is derived from
// OrgMember.invitedAt + INVITATION_TTL_MS (72 hours). Stays in sync with
// the duplicate constants in resend-invite/route.ts +
// src/lib/users/central-repository.ts.
const INVITATION_TTL_MS = 3 * 24 * 60 * 60 * 1000;
import { getQuikInfraAppId } from "@/lib/rbac/userCan";
import { seedDefaultRoles } from "@/lib/rbac/seedDefaultRoles";
import {
  applyModuleRevokes,
  modulesFromRevokes,
} from "@/lib/rbac/applyModuleRevokes";
import {
  applyProjectAccess,
  loadProjectAccess,
} from "@/lib/rbac/applyProjectAccess";
import { sendMail } from "@/lib/email/mailer";
import { logger } from "@/lib/observability/logger";
import { listUsersCentral } from "@/lib/users/central-repository";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getTenantContext } from "@/lib/auth/context";

const auth = withOrgAuthForResource("construction.users");

/**
 * Normalise the inbound `userType` to a `CnAppRole.name` (lower-snake).
 * Accepts both the legacy uppercase enum keys ("ADMIN", "HO_USER", …)
 * and the dynamic lowercase role names that the new role-picker sends.
 * The DB lookup that follows is what actually validates — this helper
 * only canonicalises the string.
 */
function normalizeRoleName(input: unknown): string {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return "";
  const lower = raw.toLowerCase();
  // Legacy aliases: SUPER_ADMIN / COMPANY_ADMIN both collapse to admin.
  if (lower === "super_admin" || lower === "company_admin") return "admin";
  return lower;
}

/**
 * GET /api/settings/users
 *   List users for the current tenant. Sensitive fields (passwordHash,
 *   inviteToken) are never returned — the repository mapper already
 *   drops the hash, and we drop the invite token here so the UI can't
 *   leak a pending invite link.
 *
 * POST /api/settings/users
 *   Invite a new user. QuikInfra no longer manages passwords locally —
 *   the central QuikIT auth handles both Native (email + password) and
 *   SSO (Google / Microsoft) sign-in. This endpoint writes to BOTH the
 *   local cn_users table (so the existing read paths keep working) AND
 *   to the central auth.User / quikit.OrgMember / quikit.UserAppAccess
 *   tables so the launcher's `/invitations/accept` flow can finish the
 *   onboarding via central auth.
 *
 *   Body shape:
 *     { username, fullName, email, mobile?, department?, userType,
 *       modulesAssigned?, projectsAssigned?, invitedByName?,
 *       invitationMethod: "native" | "sso",
 *       enableSettings?: boolean }
 */

export const GET = auth.manage(async (authCtx, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";

  // Step E: source the list entirely from central tables (auth.User +
  // OrgMember + User_profiles + UserAppRole). The legacy `listUsers` from
  // cn_users is no longer called.
  const data = await listUsersCentral(authCtx.orgId, search);

  // Enrich the base records with the two fields that live in the
  // app_quikinfra v2 tables and are NOT returned by listUsersCentral:
  //   modulesAssigned   → derived from CnUserPermissionExtra revokes
  //   projectsAssigned  → derived from CnUserProjectAccess
  // Everything else (id, email, role, status, lastLogin, acceptedAt, AND
  // inviteTokenExpires) already comes back from listUsersCentral, which
  // computes the expiry off OrgMember.invitedAt + the canonical 72h TTL.
  // We do NOT recompute it here — the old override used a 7-day window that
  // disagreed with the real 72h token TTL (resend-invite + central-repo),
  // so the UI kept showing "Invite Pending" for 4 extra days and never
  // surfaced the Resend button until day 7. Trusting the base record fixes
  // that AND drops a redundant orgMember round-trip. userIds come straight
  // from `data`; the two remaining enrichment queries run in PARALLEL.
  const userIds = data.map((u) => u.id);
  let modulesByUserId = new Map<string, string[]>();
  const projectsByUserId = new Map<string, string[]>();
  if (userIds.length > 0) {
    try {
      const [revokes, accessRows] = await Promise.all([
        (dbCentral as any).cnUserPermissionExtra.findMany({
          where: { orgId: authCtx.orgId, userId: { in: userIds }, revoke: true },
          select: { userId: true, resource: true, action: true },
        }) as Promise<Array<{ userId: string; resource: string; action: string }>>,
        (dbCentral as any).cnUserProjectAccess.findMany({
          where: { orgId: authCtx.orgId, userId: { in: userIds } },
          select: { userId: true, projectId: true },
        }) as Promise<Array<{ userId: string; projectId: string }>>,
      ]);

      // modulesAssigned ← group revoke rows per user, then translate.
      const revokesByUserId = new Map<
        string,
        Array<{ resource: string; action: string }>
      >();
      for (const r of revokes) {
        const list = revokesByUserId.get(r.userId) ?? [];
        list.push({ resource: r.resource, action: r.action });
        revokesByUserId.set(r.userId, list);
      }
      modulesByUserId = new Map(
        userIds.map(
          (id) => [id, modulesFromRevokes(revokesByUserId.get(id) ?? [])] as const,
        ),
      );

      // projectsAssigned ← group project-access rows per user.
      for (const r of accessRows) {
        const list = projectsByUserId.get(r.userId) ?? [];
        list.push(r.projectId);
        projectsByUserId.set(r.userId, list);
      }
    } catch {
      // app_quikinfra v2 tables unreachable — fall back to whatever the
      // base records carried (the maps stay empty, so the `?? rest.x`
      // fallbacks below preserve the listUsersCentral values).
    }
  }

  // Drop inviteToken on the way out so the list page can't surface a live
  // invite link to unauthorised eyes. Override only the two v2-derived
  // fields where present; acceptedAt / inviteTokenExpires / lastLoginAt
  // flow through unchanged from listUsersCentral and drive the status badge
  // (acceptedAt OR lastLoginAt → "Active"; else "Invite Pending").
  const sanitized = data.map(({ inviteToken: _t, ...rest }) => ({
    ...rest,
    modulesAssigned: modulesByUserId.get(rest.id) ?? rest.modulesAssigned,
    projectsAssigned: projectsByUserId.get(rest.id) ?? rest.projectsAssigned,
  }));
  return NextResponse.json({ data: sanitized, total: sanitized.length });
});

export const POST = auth.manage(async (authCtx, req: NextRequest) => {
  // The POST handler still reads ctx.userName as a fallback for
  // `invitedByName`. Pull legacy context once to keep that working
  // without re-plumbing the field through the v2 wrapper.
  const legacyCtx = await getTenantContext();
  const ctx = {
    orgId: authCtx.orgId,
    userId: authCtx.userId,
    userName: legacyCtx?.userName ?? null,
  };

  const body = await req.json();

  // Required fields. Accept the new (firstName + lastName) shape; fall back
  // to splitting a legacy fullName so any older client (CLI / scripts) that
  // still sends fullName keeps working during the cutover.
  const rawFirstName = String(body.firstName ?? "").trim();
  const rawLastName  = String(body.lastName  ?? "").trim();
  const rawFullName  = String(body.fullName  ?? "").trim();
  let firstName = rawFirstName;
  let lastName  = rawLastName;
  if (!firstName && !lastName && rawFullName) {
    const [first, ...rest] = rawFullName.split(/\s+/).filter(Boolean);
    firstName = first ?? "";
    lastName  = rest.join(" ");
  }
  if (!firstName || !lastName || !body.email) {
    return NextResponse.json(
      { error: "First Name, Last Name and Email are required" },
      { status: 400 }
    );
  }
  const fullName = `${firstName} ${lastName}`.trim();

  // Role must be a real CnAppRole row for this org's quikinfra app. Both
  // the legacy uppercase enum ("ADMIN") and the new lowercase role names
  // ("admin", "ho_user", "purchase_manager", …) are accepted.
  const roleName = normalizeRoleName(body.userType ?? body.roleKey ?? "user");
  const appIdForRole = await getQuikInfraAppId();
  if (!appIdForRole) {
    return NextResponse.json(
      { error: "App registry missing" },
      { status: 500 },
    );
  }
  // Seed the org's 4 system roles before the lookup below — mirrors
  // QuikScale's invite (apps/quikscale/app/api/org/users/route.ts), which
  // calls seedAllDefaultRoles() before assigning. Idempotent + 5-min
  // cached, so this is a no-op on every org that's already provisioned.
  // It closes the gap where a brand-new org's FIRST invite could 400 with
  // "Unknown role" if /api/me/permissions hadn't lazily seeded yet.
  await seedDefaultRoles(ctx.orgId);
  const selectedRole = await (dbCentral as any).cnAppRole.findFirst({
    where: { orgId: ctx.orgId, appId: appIdForRole, name: roleName },
    select: { id: true, name: true, description: true },
  });
  if (!selectedRole) {
    return NextResponse.json(
      { error: `Unknown role: ${body.userType ?? body.roleKey}` },
      { status: 400 },
    );
  }

  const email = String(body.email).trim().toLowerCase();

  // Reject malformed emails server-side too (the UI validates, but never
  // trust the client). Catches trailing-text/space corruption like
  // "x@gmail.comprofile im".
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Invalid email address" },
      { status: 400 },
    );
  }

  // Link-existing-user path: the admin picked an existing OrgMember from the
  // "Add User" email typeahead (GET /api/settings/users/search). We skip user
  // creation, password generation, and the invite email — the user already
  // has central credentials and knows how to sign in. We only grant QuikInfra
  // app access + assign the chosen role/scope below. Mirrors Path A in
  // apps/quikscale/app/api/org/users/route.ts.
  const linkExistingUserId =
    typeof body.linkExistingUserId === "string" && body.linkExistingUserId.trim()
      ? body.linkExistingUserId.trim()
      : null;

  // Step F: duplicate-member check moved from cn_users to central
  // quikit.OrgMember. The cn_users.username collision loop is gone —
  // username was a NOT NULL column on the legacy table; we no longer
  // write to it. When LINKING, membership is *required* (we're granting app
  // access to someone already in the org); when creating fresh, an existing
  // membership is a 409 conflict.
  const existingAuthUser = await (dbCentral as any).user.findUnique({
    where: linkExistingUserId ? { id: linkExistingUserId } : { email },
    select: { id: true, email: true },
  });
  if (linkExistingUserId) {
    if (!existingAuthUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const member = await (dbCentral as any).orgMember.findUnique({
      where: { orgId_userId: { orgId: ctx.orgId, userId: existingAuthUser.id } },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json(
        { error: "User is not a member of this organisation" },
        { status: 404 },
      );
    }
  } else if (existingAuthUser) {
    const existingMembership = await (dbCentral as any).orgMember.findUnique({
      where: { orgId_userId: { orgId: ctx.orgId, userId: existingAuthUser.id } },
      select: { id: true },
    });
    if (existingMembership) {
      return NextResponse.json(
        { error: `A user with email "${email}" already exists in this organisation` },
        { status: 409 }
      );
    }
  }

  // ── Invitation method ────────────────────────────────────────────
  // Native = invitee will sign in at central auth with email + password.
  // SSO    = invitee will sign in with their existing Google / Microsoft.
  // Either way, NO password is generated or stored locally — central
  // auth owns the credential lifecycle. The cn_users.passwordHash
  // column is filled with "" as a legacy placeholder; nothing reads it.
  const invitationMethod: "native" | "sso" =
    body.invitationMethod === "sso" ? "sso" : "native";

  let ssoProvider: "google" | "microsoft" | null = null;
  if (!linkExistingUserId && invitationMethod === "sso") {
    const classified = await classifySsoProviderAsync(email).catch(() => null);
    if (classified !== "google" && classified !== "microsoft") {
      return NextResponse.json(
        { error: "SSO invitations require a Google or Microsoft email address." },
        { status: 422 },
      );
    }
    ssoProvider = classified;
  }

  // Invite expiry — central OrgMember.invitedAt is stamped below; the
  // matching expiry is invitedAt + INVITATION_TTL_MS, computed here so
  // we can surface it in the response without re-reading the row.
  const inviteExpiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();

  // ── Temp password generation (Native invites only) ──────────────────
  // Matches apps/quikscale/app/api/org/users/route.ts:180-186. Native
  // invitees get a fresh friendly password (e.g. "Mango-Pencil-42") that
  // we bcrypt-hash into auth.User.password AND ship plaintext in the
  // invitation email. mustChangePassword forces a reset on first login.
  // SSO invitees stay passwordless — OAuth handles authentication.
  const generatedTempPassword =
    invitationMethod === "native" && !linkExistingUserId ? generateTempPassword() : null;
  const hashedTempPassword = generatedTempPassword
    ? await bcrypt.hash(generatedTempPassword, 12)
    : null;

  // Step F: cn_users.createUser() removed. The invite no longer writes
  // to the legacy table — everything below targets central + v2 tables
  // (auth.User upsert, quikit.OrgMember upsert, quikit.UserAppAccess,
  // app_quikinfra.User_profiles, CnUserAppRole, and the v2 revoke +
  // project-access reconcile blocks). The response record below is
  // assembled in-memory from the form payload so the admin UI still
  // gets the shape it expects.

  // ── Central auth tables ────────────────────────────────────────────
  // Mirror the invite into:
  //   auth.User           — so OAuth/Set-Password can find them
  //   quikit.OrgMember    — with invitationToken, inviteMethod, inviteProvider
  //                         (the launcher's /invitations/accept page reads
  //                          this row to drive the right onboarding UX)
  //   quikit.UserAppAccess — so they can launch QuikInfra from the launcher
  //
  // Failures are non-fatal — we still return the cn_users record so the
  // admin sees the user was created. Admin can resend the invite manually.
  let centralUserId: string | null = null;
  let centralInvitationToken: string | null = null;
  try {
    if (linkExistingUserId) {
      // Linking: reuse the existing central account + membership as-is.
      // No auth.User write, no fresh invitation token (centralInvitationToken
      // stays null, which short-circuits the invite-email block below).
      centralUserId = existingAuthUser!.id;
    } else {
      // 1) auth.User upsert by email — use the firstName/lastName from the
      //    form directly (no fullName splitting needed since the UI now
      //    collects them separately).
      const upsertedUser = await (dbCentral as any).user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          firstName: firstName || email.split("@")[0],
          lastName,
          // Native invitees get the bcrypt-hashed temp password so they
          // can sign in immediately and are forced to change on first
          // login. SSO invitees stay null — OAuth handles auth.
          password: hashedTempPassword,
          mustChangePassword: invitationMethod === "native",
        },
        select: { id: true },
      });
      centralUserId = upsertedUser.id;

      // 2) quikit.OrgMember upsert — fresh invitationToken on each invite
      centralInvitationToken = randomUUID();
      await (dbCentral as any).orgMember.upsert({
        where: { orgId_userId: { orgId: ctx.orgId, userId: centralUserId } },
        update: {
          invitationToken: centralInvitationToken,
          invitedAt: new Date(),
          inviteMethod: invitationMethod,
          inviteProvider: ssoProvider,
        },
        create: {
          orgId: ctx.orgId,
          userId: centralUserId!,
          role: "member",
          status: "active",
          createdBy: ctx.userId,
          invitationToken: centralInvitationToken,
          invitedAt: new Date(),
          inviteMethod: invitationMethod,
          inviteProvider: ssoProvider,
        },
      });
    }

    // 3) quikit.UserAppAccess — grant launchability of QuikInfra
    const appId = await getQuikInfraAppId();
    if (appId) {
      const existingAccess = await (dbCentral as any).userAppAccess.findFirst({
        where: { userId: centralUserId, orgId: ctx.orgId, appId },
        select: { id: true },
      });
      if (!existingAccess) {
        await (dbCentral as any).userAppAccess.create({
          data: {
            userId: centralUserId!,
            orgId: ctx.orgId,
            appId,
            role: "member",
            grantedBy: ctx.userId,
          },
        });
      }
    }

    // 4) app_quikinfra.User_profiles — QuikInfra-specific profile mirror.
    //    Dual-write alongside cn_users so the soon-to-be-migrated read
    //    paths (and any new code) can stop reading cn_users.fullName /
    //    .department / .mobile.
    await (dbCentral as any).cnUserProfile.upsert({
      where: { orgId_userId: { orgId: ctx.orgId, userId: centralUserId! } },
      update: {
        firstName,
        lastName,
        department: body.department ?? null,
        mobile: body.mobile ? String(body.mobile).trim() : null,
        mobileAccessEnabled: body.mobileAccessEnabled === true,
      },
      create: {
        userId: centralUserId!,
        orgId: ctx.orgId,
        firstName,
        lastName,
        department: body.department ?? null,
        mobile: body.mobile ? String(body.mobile).trim() : null,
        mobileAccessEnabled: body.mobileAccessEnabled === true,
      },
    });

    // 5) app_quikinfra.User_project_access — project scope.
    //    Replaces cn_users.projectsAssigned[]. The helper reconciles
    //    (creates missing, deletes extras) so this is the same shape
    //    used by the PATCH edit flow.
    const projectIds: string[] = Array.isArray(body.projectsAssigned)
      ? (body.projectsAssigned as unknown[]).filter(
          (p): p is string => typeof p === "string" && p.length > 0,
        )
      : [];
    await applyProjectAccess(
      dbCentral as never,
      centralUserId!,
      ctx.orgId,
      projectIds,
      ctx.userId,
    );
  } catch (e: unknown) {
    logger.warn({
      msg: "invite_central_records_failed",
      email,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // ── v2 RBAC bridge ─────────────────────────────────────────────────
  // Mirror the chosen role into app_quikinfra.CnUserAppRole so the
  // dynamic-RBAC system honours the admin's selection at login time.
  try {
    const v2RoleName = selectedRole.name;
    {
      {
        // Already validated above — re-use the lookup result.
        const v2Role = { id: selectedRole.id };

        // Find the invitee's central auth.User row by email (may be
        // null if they've never signed in to QuikIT before — that's
        // fine, the auto-assign in context.ts handles first-login).
        const authUser = await (dbCentral as any).user.findUnique({
          where: { email },
          select: { id: true },
        });

        if (v2Role && authUser) {
          await (dbCentral as any).cnUserAppRole.upsert({
            where: {
              userId_orgId_roleId: {
                userId: authUser.id,
                orgId: ctx.orgId,
                roleId: v2Role.id,
              },
            },
            update: {},
            create: {
              userId: authUser.id,
              orgId: ctx.orgId,
              roleId: v2Role.id,
              assignedBy: ctx.userId,
            },
          });

          // ── Optional: grant Settings access via UserPermissionExtra ──
          // The Invite User form shows a "Grant Settings access" checkbox
          // when role = ADMIN. If ticked, the form sends `enableSettings:
          // true`. We then insert the 4 settings-related permissions as
          // per-user extras. context.ts's strip block honours these as an
          // override, so this user — and ONLY this user — can reach
          // Settings even though they're a sub-admin.
          if (v2RoleName === "admin" && body.enableSettings === true) {
            const SETTINGS_PERMS = [
              { resource: "construction.settings", action: "manage" },
              { resource: "construction.users", action: "manage" },
              { resource: "construction.roles", action: "manage" },
              { resource: "construction.workflows", action: "manage" },
            ];
            for (const p of SETTINGS_PERMS) {
              await (dbCentral as any).cnUserPermissionExtra.upsert({
                where: {
                  orgId_userId_resource_action: {
                    orgId: ctx.orgId,
                    userId: authUser.id,
                    resource: p.resource,
                    action: p.action,
                  },
                },
                update: {},
                create: {
                  orgId: ctx.orgId,
                  userId: authUser.id,
                  resource: p.resource,
                  action: p.action,
                  grantedBy: ctx.userId,
                },
              });
            }
          }

          // ── Phase 4: module REVOKES via UserPermissionExtra ──────────
          // Translate the form's `modulesAssigned` tick list into negative
          // grants. Skipped for the admin role (admins see everything)
          // and skipped when the form ships no modules array (descriptors
          // that don't require module assignment).
          const tickedModules: string[] = Array.isArray(body.modulesAssigned)
            ? (body.modulesAssigned as unknown[]).filter(
                (m): m is string => typeof m === "string" && m.length > 0,
              )
            : [];
          if (v2RoleName !== "admin" && tickedModules.length > 0) {
            await applyModuleRevokes(
              dbCentral as never,
              authUser.id,
              ctx.orgId,
              tickedModules,
              ctx.userId,
            );
          }
        }
      }
    }
  } catch (e: unknown) {
    logger.warn({
      msg: "invite_v2_role_assign_failed",
      email,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // Invite URL points at the QuikIT launcher's `/invitations/accept`
  // page. The launcher reads `OrgMember.invitationToken` + `inviteMethod`
  // and drives the right onboarding UX (Set-Password modal for native,
  // Google/Microsoft sign-in for SSO).
  const launcherBase =
    process.env.NEXT_PUBLIC_QUIKIT_URL ?? process.env.QUIKIT_URL ?? "http://localhost:3001";
  const inviteUrl = centralInvitationToken
    ? `${launcherBase}/invitations/accept?token=${centralInvitationToken}`
    : launcherBase;

  // ── Send onboarding invitation email ───────────────────────────────
  // Mirrors apps/quikscale/app/api/org/users/route.ts:339-390. QuikInfra
  // dispatches the email DIRECTLY here — central auth does not auto-send
  // when an OrgMember row appears (that was a wrong assumption earlier
  // in the migration). Failures are non-fatal: the user row is already
  // committed and the admin can hit the resend-invite button to retry.
  let mailSent = false;
  let mailError: string | undefined;
  if (centralInvitationToken) {
    try {
      const appId = await getQuikInfraAppId();
      const [orgRow, inviterRow, appRow] = await Promise.all([
        (dbCentral as any).org.findUnique({
          where: { id: ctx.orgId },
          select: { name: true, brandColor: true },
        }),
        (dbCentral as any).user.findUnique({
          where: { id: ctx.userId },
          select: { firstName: true, lastName: true },
        }),
        appId
          ? (dbCentral as any).app.findUnique({
              where: { id: appId },
              select: { name: true },
            })
          : Promise.resolve(null),
      ]);

      const { subject, html } = renderInvitationEmail({
        to: email,
        firstName,
        orgName: orgRow?.name ?? "your organisation",
        orgLogoUrl: null,
        orgBrandColor: orgRow?.brandColor ?? null,
        inviterName: inviterRow
          ? `${inviterRow.firstName} ${inviterRow.lastName}`.trim() ||
            "QuikInfra Admin"
          : "QuikInfra Admin",
        role: formatRoleLabel(selectedRole.name),
        appNames: [appRow?.name ?? "QuikInfra"],
        token: centralInvitationToken,
        appBaseUrl: launcherBase,
        inviteMethod: invitationMethod,
        ssoProvider,
        // Plaintext temp password — shown verbatim in the email's
        // "Your login details" block. Empty string for SSO invites so
        // the credentials block is suppressed.
        tempPassword: generatedTempPassword ?? "",
      });

      const result = await sendMail({ to: email, subject, html });
      mailSent = result.success;
      if (!result.success) mailError = result.error;
    } catch (e: unknown) {
      mailError = e instanceof Error ? e.message : String(e);
      logger.warn({
        msg: "invite_mail_send_failed",
        email,
        error: mailError,
      });
    }
  }

  // Step F: build the response from the form payload + central writes.
  // No more legacy cn_users record. The admin UI uses `email`, `firstName`,
  // `lastName`, and the `invite` block; the rest mirrors the list shape
  // so optimistic-insert into the table works.
  const safeRecord = {
    id: centralUserId ?? "",
    orgId: ctx.orgId,
    email,
    firstName,
    lastName,
    fullName,
    mobile: body.mobile ? String(body.mobile).trim() : null,
    department: body.department ?? null,
    // Match what central-repository.listUsersCentral returns: `userType`
    // keeps the legacy uppercase label for the 4 system roles (so the
    // existing list-page badge colors still work), and `roleKey` carries
    // the canonical CnAppRole.name. Custom roles fall through to "USER"
    // on `userType` and the real role name on `roleKey`.
    userType:
      selectedRole.name === "admin" ? "ADMIN"
      : selectedRole.name === "ho_user" ? "HO_USER"
      : selectedRole.name === "site_admin" ? "SITE_ADMIN"
      : selectedRole.name === "user" ? "USER"
      : "USER",
    roleKey: selectedRole.name,
    status: "active",
    invitedAt: new Date().toISOString(),
    invitedByName: body.invitedByName ?? ctx.userName ?? "QuikInfra Admin",
    acceptedAt: null,
    lastLoginAt: null,
  };

  return NextResponse.json(
    {
      ...safeRecord,
      // Linking an existing user issues no invite — they keep their
      // credentials. `invite: null` tells the UI to skip the invite-link
      // dialog and just close the drawer.
      invite: linkExistingUserId
        ? null
        : {
            url: inviteUrl,
            method: invitationMethod,
            ssoProvider,
            expiresAt: inviteExpiresAt,
            mail: {
              sent: mailSent,
              error: mailError ?? null,
            },
            // Plaintext temp password — emitted ONCE in the success
            // response so the admin UI can copy/show it. Undefined for SSO.
            tempPassword: generatedTempPassword ?? undefined,
          },
    },
    { status: 201 }
  );
});
