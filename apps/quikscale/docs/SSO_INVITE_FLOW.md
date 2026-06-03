# SSO (Google / Microsoft) "Add New User" Flow — Integration Guide

> **Scope.** Everything a backend/frontend engineer needs to reproduce the QuikScale
> "Add New User → Invitation Method: SSO" feature in another Next.js + Prisma + NextAuth
> app. Read top to bottom — each section builds on the previous one.
>
> **The picture in one paragraph.** An admin opens the right-side panel `Add New User`,
> types First Name / Last Name / Email, clicks the **SSO (Google / Microsoft)** card,
> picks a Role + Teams, and submits. The server validates the email's MX records (to
> confirm Google Workspace or Microsoft 365 hosting), creates a `User` row with
> `password = NULL`, creates an `OrgMember` row with `inviteMethod = "sso"`, grants
> QuikScale app access + a default `AppRole`, joins the requested teams, and emails the
> invitee a branded "Sign in with Google/Microsoft" link to `/login`. When the invitee
> clicks that link and OAuths in, the NextAuth `signIn` callback auto-accepts the
> pending invite (flips it from `invited → active`) and they land on the dashboard.

---

## 1. End-to-end sequence

```
┌──────────────┐                                           ┌─────────┐ ┌────────────────┐
│  Admin (UI)  │                                           │   API   │ │  Email service │
└──────┬───────┘                                           └────┬────┘ └────────┬───────┘
       │  1. Open "Add New User" panel                          │               │
       │  2. Fill form, pick "SSO (Google / Microsoft)"         │               │
       │  3. POST /api/org/users  { invitationMethod:"sso" }    │               │
       │ ────────────────────────────────────────────────────▶  │               │
       │                                                         │   classify    │
       │                                                         │   MX records  │
       │                                                         │ (sso-domain   │
       │                                                         │  -server.ts)  │
       │                                                         │               │
       │                                                         │ User.create   │
       │                                                         │ (password=null│
       │                                                         │  must=false)  │
       │                                                         │               │
       │                                                         │ OrgMember     │
       │                                                         │ .create       │
       │                                                         │ inviteMethod  │
       │                                                         │ =sso          │
       │                                                         │ inviteProvider│
       │                                                         │ =google|msft  │
       │                                                         │ token=uuid    │
       │                                                         │               │
       │                                                         │ UserTeam.*    │
       │                                                         │ UserAppAccess │
       │                                                         │ UserAppRole   │
       │                                                         │               │
       │                                                         │ renderInvite  │
       │                                                         │ Email(sso)    │ ──▶ SMTP send
       │                                                         │               │
       │  201 { success:true, data:{userId, appRole, ...} }      │               │
       │  ◀──────────────────────────────────────────────────── │               │
       │                                                         │               │

… time passes, invitee opens email …

┌──────────────┐                                           ┌─────────┐
│  Invitee     │  4. Click "Sign in with Google/Microsoft"  │  Auth   │
└──────┬───────┘                                           └────┬────┘
       │  GET /login                                            │
       │ ─────────────────────────────────────────────────────▶ │
       │  5. Click provider button → NextAuth /api/auth/signin  │
       │ ─────────────────────────────────────────────────────▶ │
       │  6. OAuth round-trip with Google / Azure AD            │
       │                                                         │
       │                                  signIn() callback runs │
       │                                  • email lookup         │
       │                                  • find OrgMember rows  │
       │                                    where status=invited │
       │                                    & inviteMethod=sso   │
       │                                  • flip them to active  │
       │                                  • grant UserAppAccess  │
       │                                                         │
       │  7. Redirect → /apps (launcher) → /dashboard            │
       │  ◀───────────────────────────────────────────────────── │
```

---

## 2. Files at a glance

| Layer | File | Lines | Purpose |
|-------|------|-------|---------|
| UI form | [apps/quikscale/app/(dashboard)/org-setup/users/page.tsx](../app/(dashboard)/org-setup/users/page.tsx) | 342–957 | `UserPanel` component (the right-side panel from the screenshot) |
| Form state | same | 62–101 | `FormState` + `InvitationMethod` type |
| Toggle UI | same | 734–775 | The two-card "Native / SSO" radio buttons |
| Submit handler | same | 464–549 | Builds payload, calls POST `/api/org/users` |
| Zod schema | [apps/quikscale/lib/schemas/userSchema.ts](../lib/schemas/userSchema.ts) | 55–87 | `createOrgUserSchema` |
| POST handler | [apps/quikscale/app/api/org/users/route.ts](../app/api/org/users/route.ts) | 147–388 | Validates, creates User + OrgMember, sends email |
| Auth guard | [apps/quikscale/lib/api/withOrgAuth.ts](../lib/api/withOrgAuth.ts) | 60–182 | `withOrgAuthForModule("orgSetup.users")` |
| SSO MX classifier | [packages/shared/lib/sso-domain-server.ts](../../../packages/shared/lib/sso-domain-server.ts) | 1–131 | `classifySsoProviderAsync(email)` — Google vs Microsoft via MX |
| Constants | [packages/shared/lib/constants.ts](../../../packages/shared/lib/constants.ts) | 90–111 | `INVITE_METHOD`, `SSO_PROVIDER`, `DEFAULT_INVITE_PASSWORD` |
| Email template | [packages/shared/lib/onboarding-email-template.ts](../../../packages/shared/lib/onboarding-email-template.ts) | 60–188 | `renderInvitationEmail()` — SSO + Native branches |
| Email transport | [apps/quikscale/lib/services/email.ts](../lib/services/email.ts) | 1–68 | `sendEmail()` (nodemailer + Office365 SMTP) |
| NextAuth config | [packages/auth/index.ts](../../../packages/auth/index.ts) | 164–221 | Google + Azure AD providers |
| signIn callback | same | 249–347 | OAuth user lookup + auto-accept SSO invites |
| jwt callback | same | 348–403 | Auto-accept Native invites + populate `orgId` |
| Prisma models | [packages/database/prisma/schema.prisma](../../../packages/database/prisma/schema.prisma) | 269–465 | `User`, `Account`, `OrgMember`, `UserTeam`, `UserAppAccess` |

---

## 3. The UI — `Add New User` panel

### 3.1 Form state shape

The form keeps **one piece of state** that drives the entire SSO branch: `invitationMethod`.

```ts
// apps/quikscale/app/(dashboard)/org-setup/users/page.tsx — lines 62–101
type InvitationMethod = "native" | "sso";

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** Legacy role — sent for back-compat (always "member" for new users). */
  role: string;
  /** Selected AppRole.id. null = use server default (User role). */
  appRoleId: string | null;
  teamIds: string[];
  status: string;
  /** Set when admin picks an existing org member from the email autocomplete.
   *  Triggers "link existing user → grant QuikScale access" backend path. */
  linkExistingUserId: string | null;
  /** "native" → admin enters a password; user signs in with email+password.
   *  "sso"    → no password collected; user authenticates via Google/Microsoft.
   *             Server stores `auth.User.password = null` so the credentials
   *             provider can't log them in — only OAuth works. */
  invitationMethod: InvitationMethod;
};

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  role: "member",
  appRoleId: null,
  teamIds: [],
  status: "active",
  linkExistingUserId: null,
  invitationMethod: "native",   // default — admin must opt into SSO
};
```

### 3.2 The toggle that the screenshot shows

```tsx
// apps/quikscale/app/(dashboard)/org-setup/users/page.tsx — lines 734–775
{/* Only on create-new-user (not edit, not linking) */}
{!editUser && !form.linkExistingUserId && (
  <div>
    <label className="text-xs font-medium text-gray-600 block mb-1.5">
      Invitation Method
    </label>
    <div className="grid grid-cols-2 gap-2">
      {([
        {
          key: "native" as const,
          title: "Native (Email + Password)",
          hint:  "Admin sets a password. User signs in with email + password.",
        },
        {
          key: "sso" as const,
          title: "SSO (Google / Microsoft)",
          hint:  "No password. User signs in via their existing provider.",
        },
      ]).map((opt) => {
        const active = form.invitationMethod === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => set("invitationMethod", opt.key)}
            className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
              active
                ? "border-accent-500 bg-accent-50 ring-1 ring-accent-300"
                : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
          >
            <div className={`text-xs font-semibold ${active ? "text-accent-700" : "text-gray-800"}`}>
              {opt.title}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
              {opt.hint}
            </div>
          </button>
        );
      })}
    </div>
  </div>
)}
```

Notice: **the toggle is hidden when editing an existing user or when linking an
existing org member**. SSO vs Native is only a question at first-time user creation.

### 3.3 Submit handler — what gets sent to the API

```ts
// apps/quikscale/app/(dashboard)/org-setup/users/page.tsx — lines 464–549
async function handleSubmit() {
  if (!form.firstName.trim()) { setError("First name is required."); return; }
  if (!form.lastName.trim())  { setError("Last name is required.");  return; }
  if (!form.email.trim())     { setError("Email is required.");      return; }

  setSaving(true);
  setError("");
  try {
    // Legacy `role` field still required for back-compat with OrgMember.role.
    // The authoritative role is the AppRole (PATCH /role below).
    const payload: Record<string, unknown> = {
      firstName: form.firstName,
      lastName:  form.lastName,
      email:     form.email,
      role:      "member",
      teamIds:   form.teamIds,
    };

    // Only attach password when the admin actually typed one.
    if (form.password.trim()) payload.password = form.password.trim();
    if (editUser) payload.status = form.status;
    if (!editUser && form.linkExistingUserId) {
      payload.linkExistingUserId = form.linkExistingUserId;
    }
    // Only send invitationMethod on a fresh create
    if (!editUser && !form.linkExistingUserId) {
      payload.invitationMethod = form.invitationMethod;   //  ← "sso" or "native"
    }

    const url = editUser
      ? `/api/org/users/${editUser.userId}`
      : "/api/org/users";
    const method = editUser ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) { setError(json.error || "Failed to save"); return; }

    const savedUser = json.data;

    // PATCH the chosen AppRole if it differs from the server-assigned default.
    if (form.appRoleId && form.appRoleId !== savedUser.appRoleId) {
      await fetch(`/api/org/users/${savedUser.userId}/role`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ roleId: form.appRoleId }),
      });
    }

    onSaved(savedUser);
    onClose();
  } finally {
    setSaving(false);
  }
}
```

**Wire-level request body for an SSO invite:**

```json
POST /api/org/users
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName":  "Smith",
  "email":     "jane@company.com",
  "role":      "member",
  "teamIds":   ["team_clxxx1", "team_clxxx2"],
  "invitationMethod": "sso"
}
```

> No `password` field is sent for SSO. The server stores `User.password = null`,
> which makes the credentials provider unable to authenticate this user — only
> OAuth works.

---

## 4. The API — `POST /api/org/users`

### 4.1 Zod schema

```ts
// apps/quikscale/lib/schemas/userSchema.ts — lines 55–87
import { z } from "zod";
import { USER_ROLE_VALUES } from "@quikit/shared";

export const createOrgUserSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName:  z.string().min(1, "Last name is required").max(100),
  email:     z.string().email("Invalid email").max(200),
  /** Required only when creating a brand-new auth.User. */
  password:  z.string().min(8, "Password must be at least 8 characters").max(200).optional(),
  role:      z.enum(USER_ROLE_VALUES).optional(),
  teamIds:   z.array(z.string()).optional(),
  teamId:    z.string().nullable().optional(),           // legacy single-team
  linkExistingUserId: z.string().min(1).optional(),       // "add existing to QuikScale"
  /** "native" | "sso". Defaults to "native" for back-compat. */
  invitationMethod: z.enum(["native", "sso"]).optional(),
});
export type CreateOrgUserInput = z.infer<typeof createOrgUserSchema>;
```

### 4.2 The route handler, annotated

```ts
// apps/quikscale/app/api/org/users/route.ts — lines 1–18, 147–388
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createOrgUserSchema } from "@/lib/schemas/userSchema";
import { getQuikScaleAppId } from "@/lib/api/permissions";
import { seedAllDefaultRoles, ensureUserOnRole } from "@/lib/api/seedAdminAppRole";
import {
  DEFAULT_INVITE_PASSWORD,
  INVITE_METHOD,
  renderInvitationEmail,
  type SsoProvider,
} from "@quikit/shared";
import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";
import { sendEmail } from "@/lib/services/email";

const withOrgAuth = withOrgAuthForModule("orgSetup.users");

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  /* ── 1. Validate input ──────────────────────────────────────────── */
  const parsed = createOrgUserSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const {
    firstName, lastName, email, password,
    role = "member", teamIds = [], teamId,
    linkExistingUserId,
    invitationMethod = "native",
  } = parsed.data;
  const resolvedTeamIds = teamIds.length ? teamIds : teamId ? [teamId] : [];
  const normalisedEmail = email.trim().toLowerCase();

  /* ── 2. SSO email-provider classification (ONLY when method = sso) ──
     Resolves the email's MX records to confirm Google Workspace or
     Microsoft 365 hosting. Fails fast if neither — we don't want a
     passwordless user that can never sign in.                         */
  let ssoProvider: SsoProvider | null = null;
  if (!linkExistingUserId && invitationMethod === INVITE_METHOD.SSO) {
    ssoProvider = await classifySsoProviderAsync(normalisedEmail);
    if (!ssoProvider) {
      return NextResponse.json(
        { success: false, error: "SSO invitations require a Google or Microsoft email address." },
        { status: 422 },
      );
    }
  }

  /* ── 3. Resolve default Native password if admin left it blank ─── */
  const isNativeNewUser =
    !linkExistingUserId && invitationMethod === INVITE_METHOD.NATIVE;
  const usedDefaultPassword = isNativeNewUser && !password;
  const effectivePassword  = usedDefaultPassword ? DEFAULT_INVITE_PASSWORD : password;

  /* ── 4. Create / locate the User row ─────────────────────────────── */
  let newUserId: string;
  let newUserCreated = false;

  if (linkExistingUserId) {
    // "Add existing org member to QuikScale" path — not SSO-specific.
    const member = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: linkExistingUserId } },
      select: { userId: true },
    });
    if (!member) {
      return NextResponse.json(
        { success: false, error: "User is not a member of this organisation" },
        { status: 404 },
      );
    }
    newUserId = member.userId;
  } else {
    const existingUser = await db.user.findUnique({
      where: { email: normalisedEmail },
    });

    if (existingUser) {
      // Email belongs to a different org — add as member of THIS org only.
      const existingMembership = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId, userId: existingUser.id } },
      });
      if (existingMembership) {
        return NextResponse.json(
          { success: false, error: "This user is already a member of the organisation." },
          { status: 409 },
        );
      }
      await db.orgMember.create({
        data: {
          orgId,
          userId: existingUser.id,
          role,
          teamId: resolvedTeamIds[0] ?? null,
          status: "active",
          createdBy: userId,
          invitationToken: crypto.randomUUID(),
          invitedAt: new Date(),
          inviteMethod: invitationMethod,       //  ← "sso" or "native"
          inviteProvider: ssoProvider,          //  ← "google" / "microsoft" / null
        },
      });
      newUserId = existingUser.id;
    } else {
      /* ── 4a. Brand-new user. ────────────────────────────────────────
         For SSO invites: password is NULL → credentials provider can't
         authenticate; only OAuth (Google / Microsoft) will work.
         For Native: hash either the admin-supplied or default password. */
      const isSso = invitationMethod === INVITE_METHOD.SSO;
      const hashedPassword = isSso
        ? null
        : await bcrypt.hash(effectivePassword!.trim(), 12);

      const user = await db.user.create({
        data: {
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          email:     normalisedEmail,
          password:  hashedPassword,
          mustChangePassword: !isSso,    // Native users must reset on first login
        },
      });
      await db.orgMember.create({
        data: {
          orgId,
          userId: user.id,
          role,
          teamId: resolvedTeamIds[0] ?? null,
          status: "active",
          createdBy: userId,
          invitationToken: crypto.randomUUID(),
          invitedAt: new Date(),
          inviteMethod: invitationMethod,
          inviteProvider: ssoProvider,
        },
      });
      newUserId = user.id;
      newUserCreated = true;
    }
  }

  /* ── 5. Team memberships ─────────────────────────────────────────── */
  for (const tId of resolvedTeamIds) {
    await db.userTeam.upsert({
      where:  { orgId_userId_teamId: { orgId, userId: newUserId, teamId: tId } },
      update: {},
      create: { orgId, userId: newUserId, teamId: tId },
    });
  }

  /* ── 6. Auto-grant QuikScale app access + default AppRole ───────── */
  const appId = await getQuikScaleAppId();
  let appRole: { id: string; name: string } | null = null;
  if (appId) {
    const existingAccess = await db.userAppAccess.findFirst({
      where: { orgId, appId, userId: newUserId },
      select: { id: true },
    });
    if (!existingAccess) {
      await db.userAppAccess.create({
        data: {
          userId: newUserId,
          orgId,
          appId,
          role: "member",
          grantedBy: userId,
        },
      });
    }

    // Seed both default roles for this org (admin + User), idempotent.
    const { adminRoleId, userRoleId } = await seedAllDefaultRoles(orgId);

    // Safety: first user in an admin-less org becomes admin to prevent lockout.
    const adminMemberCount = await db.userAppRole.count({
      where: { orgId, roleId: adminRoleId },
    });
    const targetRoleId   = adminMemberCount === 0 ? adminRoleId  : userRoleId;
    const targetRoleName = adminMemberCount === 0 ? "admin"      : "User";

    await ensureUserOnRole(newUserId, orgId, targetRoleId, userId);
    appRole = { id: targetRoleId, name: targetRoleName };
  }

  /* ── 7. Send the onboarding email ────────────────────────────────── */
  const membership = await db.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: newUserId } },
    include: { /* user + userTeams … see route source */ },
  });

  if (!linkExistingUserId && membership?.invitationToken) {
    try {
      const [org, inviter, appRow] = await Promise.all([
        db.org.findUnique({ where: { id: orgId }, select: { name: true, brandColor: true } }),
        db.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } }),
        appId ? db.app.findUnique({ where: { id: appId }, select: { name: true } })
              : Promise.resolve(null),
      ]);

      const appBaseUrl =
        process.env.NEXT_PUBLIC_AUTH_URL ??
        process.env.NEXTAUTH_URL ??
        "http://localhost:3000";

      const { subject, html } = renderInvitationEmail({
        to:             normalisedEmail,
        firstName:      firstName.trim(),
        orgName:        org?.name ?? "your organisation",
        orgLogoUrl:     null,
        orgBrandColor:  org?.brandColor ?? null,
        inviterName:    inviter
          ? `${inviter.firstName} ${inviter.lastName}`.trim() || "QuikScale Admin"
          : "QuikScale Admin",
        role:           appRole?.name ?? "User",
        appNames:       [appRow?.name ?? "QuikScale"],
        token:          membership.invitationToken,
        appBaseUrl,
        inviteMethod:   invitationMethod,        //  ← branches the template
        ssoProvider,                             //  ← "google" | "microsoft" | null
      });

      await sendEmail({ to: normalisedEmail, subject, html });
    } catch (err) {
      // Email failures are logged but DO NOT roll back user creation.
      console.error("[org/users] onboarding email failed:", err);
    }
  }

  /* ── 8. Respond ──────────────────────────────────────────────────── */
  return NextResponse.json(
    {
      success: true,
      data:    buildUserResponse(membership!, appRole),
      meta:    { usedDefaultPassword, newUserCreated },
    },
    { status: 201 },
  );
}, { fallbackErrorMessage: "Failed to create user" });
```

### 4.3 The auth guard wrapping this route

```ts
// apps/quikscale/lib/api/withOrgAuth.ts (simplified)
export function withOrgAuthForModule(moduleKey: string) {
  return (handler, options = {}) =>
    withOrgAuth(handler, { moduleKey, ...options });
}
```

`withOrgAuth` does, in order:

1. `getServerSession(authOptions)` — 401 if no session.
2. Resolve `orgId` from the session token — 403 if missing.
3. Gate by `moduleKey` (`"orgSetup.users"`) — 404 if the org has the module disabled.
4. Check the user's RBAC v2 permission (`canManageUsers`) for that module — 403 if denied.
5. Call the handler with `{ session, userId, orgId }`.

> **Replicating in your app.** If you don't have RBAC v2, fall back to a simple
> `requireAdmin()` wrapper that just checks the session's role.

---

## 5. The SSO email classifier

The classifier ensures the invitee can actually finish the OAuth flow. We don't
hard-code domain lists — we resolve MX records.

```ts
// packages/shared/lib/sso-domain-server.ts  — lines 31–113
import { resolveMx } from "node:dns/promises";
import { SSO_PROVIDER, type SsoProvider } from "./constants";
import { classifySsoProvider, _ssoInternal } from "./sso-domain";

const MICROSOFT_MX_SUFFIXES = [
  "mail.protection.outlook.com",
  "eo.outlook.com",
  "mail.eo.outlook.com",
  "outlook.com",
];
const GOOGLE_MX_SUFFIXES = [
  "aspmx.l.google.com",
  "googlemail.l.google.com",
  "googlemail.com",
  "google.com",
];

const MX_CACHE_TTL_MS = 60 * 60 * 1000;     // 1 hour
const NEGATIVE_TTL_MS = 5 * 60 * 1000;      // 5 min for failures
const cache = new Map<string, { provider: SsoProvider | null; expiresAt: number }>();

export async function classifySsoProviderAsync(email: string): Promise<SsoProvider | null> {
  // 1) Fast sync path for gmail / outlook / hotmail / etc.
  const fast = classifySsoProvider(email);
  if (fast) return fast;

  // 2) MX lookup for custom corporate domains.
  const domain = _ssoInternal.extractEmailDomain(email);
  if (!domain) return null;

  const cached = cache.get(domain);
  if (cached && cached.expiresAt > Date.now()) return cached.provider;

  let provider: SsoProvider | null = null;
  try {
    const records = await resolveMx(domain);
    if (mxMatches(records, MICROSOFT_MX_SUFFIXES))   provider = SSO_PROVIDER.MICROSOFT;
    else if (mxMatches(records, GOOGLE_MX_SUFFIXES)) provider = SSO_PROVIDER.GOOGLE;
  } catch { /* NXDOMAIN / timeout — null */ }

  cache.set(domain, {
    provider,
    expiresAt: Date.now() + (provider ? MX_CACHE_TTL_MS : NEGATIVE_TTL_MS),
  });
  return provider;
}
```

> **Subpath import is mandatory.** This file imports Node's `dns/promises`.
> Re-exporting it from the package barrel would pull DNS into client bundles.
> Always import as `import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server"`.

---

## 6. The constants

```ts
// packages/shared/lib/constants.ts — lines 90–111
export const INVITE_METHOD = {
  SSO:    "sso",
  NATIVE: "native",
} as const;
export type InviteMethod = (typeof INVITE_METHOD)[keyof typeof INVITE_METHOD];

/** System-defined default password for all native email invitations.
 *  Stored as a constant so email templates and Set-Password screen agree. */
export const DEFAULT_INVITE_PASSWORD = "Quikit2026";

export const SSO_PROVIDER = {
  GOOGLE:    "google",
  MICROSOFT: "microsoft",
} as const;
export type SsoProvider = (typeof SSO_PROVIDER)[keyof typeof SSO_PROVIDER];
```

---

## 7. Prisma models

Only the columns relevant to this flow are highlighted with comments.

```prisma
// packages/database/prisma/schema.prisma
model User {
  id                  String    @id @default(cuid())
  email               String    @unique
  emailVerified       DateTime?
  password            String?   // ← NULL for SSO-only invitees
  firstName           String
  lastName            String
  avatar              String?
  isSuperAdmin        Boolean   @default(false)
  mustChangePassword  Boolean   @default(false)   // ← Native invitees only
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  lastSignInAt        DateTime?

  accounts            Account[]
  memberships         OrgMember[]
  userTeams           UserTeam[]
  appAccess           UserAppAccess[]

  @@index([email])
  @@schema("auth")
}

// NextAuth's standard OAuth account-link table. Populated on first OAuth sign-in.
model Account {
  id                 String  @id @default(cuid())
  userId             String
  type               String
  provider           String                          // "google" | "azure-ad"
  providerAccountId  String
  access_token       String?
  token_type         String?
  scope              String?
  createdAt          DateTime @default(now())
  user               User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@schema("auth")
}

model OrgMember {
  id                String    @id @default(cuid())
  orgId             String
  userId            String
  role              String                            // "admin" | "manager" | "member"
  teamId            String?
  customPermissions String[]
  invitationToken   String?   @unique                 // ← random UUID per invite
  invitedAt         DateTime?
  acceptedAt        DateTime?
  status            String    @default("active")      // "invited" | "active" | …
  createdBy         String?
  inviteAppIds      String[]  @default([])
  /// "sso" or "native" — drives which onboarding email is sent
  inviteMethod      String?
  /// "google" | "microsoft" | null — for SSO email template rendering
  inviteProvider    String?

  org               Org   @relation(fields: [orgId],  references: [id], onDelete: Cascade)
  team              Team? @relation(fields: [teamId], references: [id])
  user              User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([orgId, userId])
  @@schema("quikit")
}

model UserTeam {
  id        String   @id @default(cuid())
  orgId     String
  userId    String
  teamId    String
  createdAt DateTime @default(now())

  @@unique([orgId, userId, teamId])
}

model UserAppAccess {
  id        String   @id @default(cuid())
  userId    String
  orgId     String
  appId     String
  role      String   @default("member")
  grantedBy String?
  grantedAt DateTime @default(now())

  @@unique([userId, orgId, appId])
}
```

---

## 8. The invitation email

### 8.1 Template — the SSO branch

```ts
// packages/shared/lib/onboarding-email-template.ts — lines 90–142
if (inviteMethod === INVITE_METHOD.SSO) {
  const provider = ssoProvider === SSO_PROVIDER.GOOGLE ? "Google" : "Microsoft";
  const ctaLabel = `Sign in with ${provider}`;

  const stepsHtml = ssoProvider === SSO_PROVIDER.GOOGLE
    ? `<ol>…
        <li>Click the <strong>Sign in with Google</strong> button below.</li>
        <li>Use your Google account <strong>${escapeHtml(to)}</strong>.</li>
        <li>You will be redirected to your Quikit dashboard.</li>
       </ol>`
    : `<ol>…
        <li>Click the <strong>Sign in with Microsoft</strong> button below.</li>
        <li>Use your Microsoft account <strong>${escapeHtml(to)}</strong>.</li>
        <li>You will be redirected to your Quikit dashboard.</li>
       </ol>`;

  const html = /* full styled HTML body with CTA → ${appBaseUrl}/login */;

  const subject = isReminder
    ? `Reminder: you've been invited to join ${orgName} on Quikit`
    : `You've been invited to join ${orgName} on Quikit`;

  return { subject, html };
}
```

> Note the SSO email **never embeds a password** and links to `/login` (not the
> `/invitations/accept?token=…` URL that the Native template uses). SSO users
> don't need a token-based accept page because the `signIn` callback auto-accepts
> the invite on their first OAuth login.

### 8.2 Transport — `sendEmail()`

```ts
// apps/quikscale/lib/services/email.ts (full file)
import nodemailer, { type Transporter } from "nodemailer";

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;

  const user = process.env.EMAIL_USER;
  const passB64 = process.env.EMAIL_PASSWORD_B64;
  const pass = passB64
    ? Buffer.from(passB64, "base64").toString("utf8")
    : process.env.EMAIL_PASSWORD;

  const host   = process.env.SMTP_HOST || "smtp.office365.com";
  const port   = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = (process.env.SMTP_SECURE ?? "false") === "true";

  if (!user || !pass) {
    console.warn("[email] EMAIL_USER / EMAIL_PASSWORD not configured — disabled.");
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
    requireTLS: !secure,
  });
  return cachedTransporter;
}

export async function sendEmail({ to, subject, html, text }: SendEmailParams) {
  const transporter = getTransporter();
  if (!transporter) return { ok: false, error: "Email transporter not configured" };

  const from = process.env.SMTP_FROM || process.env.EMAIL_USER!;
  try {
    const info = await transporter.sendMail({ from, to, subject, html, text });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "send failed";
    return { ok: false, error: message };
  }
}
```

Swap nodemailer for Resend / SendGrid by reimplementing this single file — the
rest of the codebase is unchanged because everywhere else just calls `sendEmail()`.

---

## 9. NextAuth configuration

### 9.1 Provider registration

```ts
// packages/auth/index.ts — lines 164–221
providers: [
  CredentialsProvider({ /* email + password — for Native users */ }),

  // Google — only registered when both env vars are set so the provider
  // never appears in /api/auth/providers in unconfigured dev environments.
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? [
        GoogleProvider({
          clientId:     process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          // Force account chooser every time
          authorization: { params: { prompt: "select_account" } },
          profile(profile) {
            return {
              id:    profile.sub,            // placeholder; signIn() replaces it
              email: profile.email ?? "",
              name:  profile.name ?? "",
              oauthFirstName: profile.given_name ?? "",
              oauthLastName:  profile.family_name ?? "",
            };
          },
        }),
      ]
    : []),

  // Microsoft / Azure AD / Entra ID. MICROSOFT_TENANT_ID="common" accepts both
  // work/school AND personal Microsoft accounts. Set a specific tenant GUID
  // to restrict to one organization.
  ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
    ? [
        AzureADProvider({
          clientId:     process.env.MICROSOFT_CLIENT_ID,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
          tenantId:     process.env.MICROSOFT_TENANT_ID || "common",
          profile(profile) {
            const split = splitName(profile.name);
            return {
              id:    profile.sub ?? profile.oid ?? "",
              email: profile.email ?? profile.preferred_username ?? "",
              name:  profile.name ?? "",
              oauthFirstName: split.first,
              oauthLastName:  split.last,
            };
          },
        }),
      ]
    : []),
],
```

### 9.2 The `signIn` callback — where the SSO invite is auto-accepted

This is the single most important block in the whole flow. When the invitee
OAuths in, this code finds their pending invite and activates it.

```ts
// packages/auth/index.ts — lines 249–347
async signIn({ user, account }) {
  if (account?.provider === "google" || account?.provider === "azure-ad") {
    const email = (user.email ?? "").toLowerCase();
    if (!email) return "/login?reason=invalid_user_info";

    // 1) Confirm the OAuth email already exists in our User table.
    //    No auto-create — invitees must be added by an admin first.
    const dbUser = await db.user.findFirst({
      where:  { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true, firstName: true, lastName: true, isSuperAdmin: true },
    });
    if (!dbUser) return "/login?reason=invalid_user_info";

    // 2) Auto-accept any pending SSO invitations for this user. This is the
    //    SSO equivalent of the token-based accept-invite POST handler.
    //
    //    Because OrgMember.userId points at the User row whose email column
    //    we just matched, BR-005 ("the SSO-authenticated email must equal
    //    the invitation email") is satisfied automatically.
    const pendingInvites = await db.orgMember.findMany({
      where: { userId: dbUser.id, status: "invited", inviteMethod: "sso" },
    });
    for (const inv of pendingInvites) {
      await db.orgMember.update({
        where: { id: inv.id },
        data:  { status: "active", acceptedAt: new Date(), invitationToken: null },
      });
      if (inv.inviteAppIds.length > 0) {
        const userAppRole = inv.role === "app_admin" ? "admin" : "member";
        await db.userAppAccess.createMany({
          data: inv.inviteAppIds.map((appId) => ({
            userId: dbUser.id, orgId: inv.orgId, appId, role: userAppRole,
            grantedBy: inv.createdBy,
          })),
          skipDuplicates: true,
        });
      }
    }

    // 3) Replace the provider-supplied id with the real DB id so downstream
    //    callbacks (jwt, session) find the right OrgMember rows.
    user.id = dbUser.id;
    user.email = dbUser.email;
    user.isSuperAdmin = dbUser.isSuperAdmin;
    return true;
  }
  return true;   // credentials provider — handled in jwt() callback
}
```

### 9.3 The `jwt` and `session` callbacks

```ts
async jwt({ token, user }) {
  if (user) {
    token.id           = user.id;
    token.email        = user.email;
    token.isSuperAdmin = user.isSuperAdmin ?? false;
    token.sessionId    = await createAuthSession(user.id, 30 * 24 * 60 * 60);

    // Auto-select first active org so /apps launcher and /dashboard work.
    const firstMembership = await db.orgMember.findFirst({
      where:   { userId: user.id, status: "active" },
      orderBy: { createdAt: "asc" },
      select:  { orgId: true, role: true },
    });
    if (firstMembership) {
      token.orgId          = firstMembership.orgId;
      token.membershipRole = firstMembership.role;
    }
  }
  return token;
},

async session({ session, token }) {
  session.user = {
    ...session.user,
    id:             token.id,
    email:          token.email,
    orgId:          token.orgId,
    membershipRole: token.membershipRole,
    isSuperAdmin:   token.isSuperAdmin,
  };
  return session;
},
```

---

## 10. The `/login` page (where the invitee lands)

The email's CTA points at `${appBaseUrl}/login`. That page renders the standard
NextAuth sign-in form **plus** a "Sign in with Google" and "Sign in with Microsoft"
button, conditional on the corresponding env vars being set (because providers
not registered above won't appear in `/api/auth/providers` and the buttons are
rendered from that list).

```tsx
// apps/auth/app/login/page.tsx  (illustrative)
import { signIn } from "next-auth/react";

<button onClick={() => signIn("google",   { callbackUrl: "/apps" })}>
  Sign in with Google
</button>
<button onClick={() => signIn("azure-ad", { callbackUrl: "/apps" })}>
  Sign in with Microsoft
</button>
```

Clicking either button → NextAuth performs the standard OAuth round-trip →
`signIn()` callback above runs → invite is auto-accepted → JWT minted with
`orgId` → user redirected to `/apps` (which then routes them to the dashboard).

---

## 11. Environment variables

```bash
# ── Database ─────────────────────────────────────────────
DATABASE_URL=postgresql://user:pwd@host:5432/db
DATABASE_URL_DIRECT=postgresql://user:pwd@host:5432/db   # for prisma migrate

# ── NextAuth ─────────────────────────────────────────────
NEXTAUTH_SECRET=openssl-rand-base64-32-goes-here
NEXTAUTH_URL=https://your-app.com                         # canonical app URL
NEXT_PUBLIC_AUTH_URL=https://your-app.com                 # used by email template

# ── Google OAuth (https://console.cloud.google.com/) ─────
# Authorized redirect URI:
#   https://your-app.com/api/auth/callback/google
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...

# ── Microsoft / Azure AD (https://entra.microsoft.com/) ──
# App Registration → Redirect URI (Web):
#   https://your-app.com/api/auth/callback/azure-ad
# "common"      = both work/school AND personal accounts
# <tenant-guid> = restrict to one organization
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_TENANT_ID=common

# ── SMTP (nodemailer transport) ──────────────────────────
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false                  # STARTTLS on 587
EMAIL_USER=no-reply@yourcompany.com
EMAIL_PASSWORD=                    # OR EMAIL_PASSWORD_B64=<base64>
SMTP_FROM="Quikit <no-reply@yourcompany.com>"
```

---

## 12. Integration checklist for a fresh app

Follow this in order — each step depends on the ones above.

- [ ] **Install deps**:
  `next-auth @auth/prisma-adapter bcryptjs zod nodemailer next-auth/providers/google next-auth/providers/azure-ad`
- [ ] **Copy/adapt Prisma models** (`User`, `Account`, `OrgMember`, `UserTeam`,
  `UserAppAccess`) from §7. Run `prisma migrate dev`.
- [ ] **Add the constants** (`INVITE_METHOD`, `SSO_PROVIDER`,
  `DEFAULT_INVITE_PASSWORD`) — §6.
- [ ] **Add `classifySsoProviderAsync`** — §5. Remember the subpath-import rule
  (it imports `node:dns`).
- [ ] **Configure Google in Google Cloud Console**: create OAuth credentials,
  add `https://your-app.com/api/auth/callback/google` as an authorized redirect
  URI, set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- [ ] **Configure Microsoft in Entra**: register an App, add
  `https://your-app.com/api/auth/callback/azure-ad`, expose `email` + `openid` +
  `profile` scopes, set `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` /
  `MICROSOFT_TENANT_ID`.
- [ ] **Register NextAuth providers** — §9.1. Wrap each in the
  `process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET` guard so missing
  config simply hides the button.
- [ ] **Wire the `signIn` callback** — §9.2. Most important step — without
  this, OAuth users can sign in but their invite stays `invited` forever.
- [ ] **Wire the `jwt` and `session` callbacks** — §9.3.
- [ ] **Add the Zod schema** — §4.1.
- [ ] **Add the `POST /api/org/users` route** — §4.2. Copy verbatim and adjust
  guard / DB import paths.
- [ ] **Add `sendEmail()` transport** — §8.2.
- [ ] **Add `renderInvitationEmail()`** — §8.1 (full file is `onboarding-email-template.ts`).
- [ ] **Build the UI panel** — §3. The two-card toggle is the only SSO-specific UI;
  the rest of the form (First/Last/Email/Role/Teams) is generic.
- [ ] **Add SSO buttons to `/login`** — §10. Use `signIn("google")` /
  `signIn("azure-ad")` from `next-auth/react`.
- [ ] **Smoke-test end-to-end**:
  1. Create a new SSO invite for a Gmail or Outlook address you control.
  2. Confirm `OrgMember.status = "invited"`, `inviteMethod = "sso"`,
     `inviteProvider` matches, `User.password IS NULL`.
  3. Check the inbox — email subject "You've been invited…", CTA says
     "Sign in with Google" or "Sign in with Microsoft".
  4. Click CTA → land on `/login` → click SSO button → complete OAuth.
  5. After OAuth callback, confirm `OrgMember.status = "active"`,
     `acceptedAt` set, `invitationToken IS NULL`.
  6. You should land on the dashboard with the correct org context.

---

## 13. Common pitfalls

| Symptom | Likely cause | Fix |
|---|---|---|
| **SSO button missing** on `/login` | `GOOGLE_CLIENT_ID` / `MICROSOFT_CLIENT_ID` not set | The provider registration is guarded by env-var presence (§9.1) — set the vars and restart. |
| **422 "SSO invitations require a Google or Microsoft email address"** | The invitee's domain MX records don't resolve to Google or Microsoft | Either ask them to use a Gmail/Outlook address, or invite via Native instead. |
| **OAuth succeeds but user lands on `/login?reason=invalid_user_info`** | `User` row doesn't exist for the OAuth email | Confirm the admin created the user first. We deliberately don't auto-create on first OAuth — every user must be invited. |
| **Invite stays "invited" forever after OAuth** | `signIn` callback missing the auto-accept loop (§9.2) | Add the `db.orgMember.findMany({ status:"invited", inviteMethod:"sso" })` block. |
| **`token.orgId` undefined after OAuth → launcher can't find org** | `jwt` callback missing the `firstMembership` lookup | Add §9.3. |
| **Email delivered but link 404s** | `NEXT_PUBLIC_AUTH_URL` / `NEXTAUTH_URL` not set in the env that the API route runs in | Both fallback to `http://localhost:3000` — set them in production. |
| **MX classifier returns null for a valid corporate email** | The domain proxies mail through a non-Google/MS provider but uses Workspace/365 for users (rare) | Add the domain's MX suffix to the constant lists in `sso-domain-server.ts`. |

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **Native invite** | Admin creates user with a password (or system default `Quikit2026`); user signs in with email + password and must reset on first login. |
| **SSO invite** | Admin creates user with `password = NULL`; user signs in via Google / Microsoft OAuth, never has a password. |
| **OrgMember** | Pivot row between `User` and `Org`. Carries the invitation token, status, method, and provider. |
| **AppRole** | Dynamic per-app role (e.g. "admin", "User", "Accountability User"). Stored in `UserAppRole`. Different from the legacy `OrgMember.role` enum. |
| **UserAppAccess** | Grant row: "user X has access to app Y in org Z". Created automatically when a QuikScale user is invited. |
| **Auto-accept** | The act of flipping `OrgMember.status` from `invited → active` after the invitee finishes their first authentication. For SSO, this happens in NextAuth's `signIn` callback. For Native, in the `jwt` callback (or via the explicit `/api/invitations/accept` POST). |

---

*Last updated: 2026-05-20. Maintained alongside the implementation — if you change any
file referenced above, update this doc in the same PR.*
