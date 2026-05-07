import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getUserTypeDescriptor } from "@/lib/rbac/user-types";
import { generateInviteToken, formatExpiryHint } from "@/lib/invites/tokens";
import { sendMail, getAppUrl } from "@/lib/email/mailer";
import { buildUserInviteEmail } from "@/lib/email/templates/user-invite";
import { hashPassword } from "@/lib/auth/password";
import {
  listUsers,
  findByTenantAndEmail,
  findByTenantAndUsername,
  createUser,
} from "@/lib/users/repository";
import { requireAuth } from "@/lib/auth/context";

/**
 * GET /api/settings/users
 *   List users for the current tenant. Sensitive fields (passwordHash,
 *   inviteToken) are never returned — the repository mapper already
 *   drops the hash, and we drop the invite token here so the UI can't
 *   leak a pending invite link.
 *
 * POST /api/settings/users
 *   Create a new user account, persist it in `users`, and send the
 *   dark-themed invite email with a generated temporary password.
 *   The admin running the request is recorded in `invitedBy`.
 */

/**
 * Generate a 10-char human-friendly temp password.
 * No ambiguous glyphs (0/O, 1/l/I), mixed case + digits — still passes
 * the 8-char / 1 upper / 1 digit password gate if the user chooses to
 * keep it instead of rotating.
 */
function generateTempPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const ctxOrResponse = await requireAuth();
    if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
    const ctx = ctxOrResponse;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";

    const data = await listUsers(ctx.tenantId, search);

    // Drop inviteToken on the way out so the list page can't surface
    // a live invite link to unauthorised eyes. Keep inviteTokenExpires
    // as a "pending invite" indicator.
    const sanitized = data.map(({ inviteToken, ...rest }) => rest);
    return NextResponse.json({ data: sanitized, total: sanitized.length });

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[settings/users.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ctxOrResponse = await requireAuth();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  const body = await req.json();

  // Required fields
  if (!body.username || !body.fullName || !body.email) {
    return NextResponse.json(
      { error: "Username, Full Name and Email are required" },
      { status: 400 }
    );
  }

  // User type must exist and be client-selectable (SUPER_ADMIN is not)
  const descriptor = getUserTypeDescriptor(body.userType ?? "USER");
  if (!descriptor) {
    return NextResponse.json(
      { error: `Unknown user type: ${body.userType}` },
      { status: 400 }
    );
  }
  if (!descriptor.clientSelectable) {
    return NextResponse.json(
      { error: `User type ${body.userType} cannot be created from the client UI` },
      { status: 403 }
    );
  }

  const email = String(body.email).trim().toLowerCase();

  // Uniqueness — email AND username must be unique per tenant. Do the
  // checks before generating the password so we fail fast.
  const existingByEmail = await findByTenantAndEmail(ctx.tenantId, email);
  if (existingByEmail) {
    return NextResponse.json(
      { error: `A user with email "${email}" already exists` },
      { status: 409 }
    );
  }
  const existingByUsername = await findByTenantAndUsername(ctx.tenantId, body.username);
  if (existingByUsername) {
    return NextResponse.json(
      { error: `Username "${body.username}" already exists` },
      { status: 409 }
    );
  }

  // Generate a single-use invite token + a dummy password. The token
  // keeps the "set your own password later" path alive, but the dummy
  // password is what the email surfaces so the user can log in
  // immediately. Passwords are stored hashed; plaintext never touches
  // disk.
  const invite = generateInviteToken();
  const tempPassword = generateTempPassword();
  const passwordHash = hashPassword(tempPassword);

  const record = await createUser({
    tenantId: ctx.tenantId,
    orgId: ctx.orgId,
    email,
    username: String(body.username).trim(),
    fullName: String(body.fullName).trim(),
    mobile: body.mobile ? String(body.mobile).trim() : undefined,
    department: body.department ?? undefined,
    userType: descriptor.key,
    // Materialise the permission backing-role now so NextAuth.authorize()
    // can issue the correct JWT without re-resolving at login time.
    roleKey: descriptor.backingRole,
    passwordHash,
    modulesAssigned: Array.isArray(body.modulesAssigned) ? body.modulesAssigned : [],
    projectsAssigned: Array.isArray(body.projectsAssigned) ? body.projectsAssigned : [],
    inviteToken: invite.token,
    inviteTokenExpires: new Date(invite.expiresAt),
    invitedBy: ctx.userId,
    invitedByName: body.invitedByName ?? ctx.userName ?? "QuikConstruction Admin",
  });

  // Build the login URL — points at the QuikIT central login (SSO),
  // not the local construction-app login. The invitee signs in once on
  // QuikIT and is redirected back here. Falls back to the local app URL
  // if NEXT_PUBLIC_QUIKIT_URL / QUIKIT_URL are unset.
  const quikitBaseUrl =
    process.env.NEXT_PUBLIC_QUIKIT_URL ??
    process.env.QUIKIT_URL ??
    getAppUrl();
  const loginUrl = `${quikitBaseUrl.replace(/\/$/, "")}/login?email=${encodeURIComponent(email)}`;
  let mailResult: { sent: boolean; outboxPath?: string; error?: string };
  try {
    const { subject, html } = buildUserInviteEmail({
      fullName: record.fullName,
      inviteUrl: loginUrl,
      loginEmail: email,
      tempPassword,
      invitedByName: record.invitedByName ?? "QuikConstruction Admin",
      userType: record.userType,
      department: record.department ?? undefined,
      expiresInText: formatExpiryHint(invite.expiresAt),
    });
    const res = await sendMail({ to: email, subject, html });
    mailResult = {
      sent: res.success,
      outboxPath: res.outboxPath,
      error: res.error,
    };
  } catch (e: unknown) {
    const ne = e as { code?: string; message?: string };
    mailResult = { sent: false, error: ne?.message ?? "Mailer threw" };
  }

  // Never return the hash back to the client. Temp password is
  // surfaced only to the admin who just created the user (so they can
  // read it out if the email didn't reach the recipient).
  const { inviteToken: _invToken, ...safeRecord } = record;

  return NextResponse.json(
    {
      ...safeRecord,
      // Dev helper: always surface the login URL + mail status in the
      // API response. Admins can copy it if the email didn't reach them,
      // and the UI can show a toast with the direct link.
      invite: {
        url: loginUrl,
        tempPassword,
        expiresAt: invite.expiresAt,
        mail: mailResult,
      },
    },
    { status: 201 }
  );
}
