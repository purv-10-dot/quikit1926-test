# Native (Email + Password) "Add New User" Flow — Integration Guide

> **Scope.** Everything a backend/frontend engineer needs to reproduce the QuikScale
> "Add New User → Invitation Method: Native (Email + Password)" feature in another
> Next.js + Prisma + NextAuth app. Read top to bottom — each section builds on the
> previous one.
>
> **The picture in one paragraph.** An admin opens the right-side panel `Add New User`,
> types First Name / Last Name / Email, leaves the **Native (Email + Password)** card
> selected (the default), optionally types a password (otherwise the system seeds the
> default `Quikit2026`), picks a Role + Teams, and submits. The server creates a
> `User` row with the bcrypt-hashed password and `mustChangePassword = true`, creates
> an `OrgMember` row with `inviteMethod = "native"` and a single-use `invitationToken`
> UUID, grants QuikScale app access + a default `AppRole`, joins the requested teams,
> and emails the invitee a branded "Set Up My Account" link that embeds the
> invitation token. The invitee clicks the link → lands on `/invitations/accept?token=…`
> → enters the temporary password → either sets a new password (Save & Continue) or
> skips (Skip for now). Either way the `OrgMember.status` flips to `active` and they
> get auto-signed-in and dropped onto the launcher.

---

## 1. End-to-end sequence

```
┌──────────────┐                                           ┌─────────┐ ┌────────────────┐
│  Admin (UI)  │                                           │   API   │ │  Email service │
└──────┬───────┘                                           └────┬────┘ └────────┬───────┘
       │  1. Open "Add New User" panel                          │               │
       │  2. Fill form, leave "Native (Email + Password)"       │               │
       │  3. POST /api/org/users                                │               │
       │     { invitationMethod:"native",  password?:"…" }      │               │
       │ ────────────────────────────────────────────────────▶  │               │
       │                                                         │ bcrypt.hash  │
       │                                                         │ password OR  │
       │                                                         │ DEFAULT_     │
       │                                                         │ INVITE_      │
       │                                                         │ PASSWORD     │
       │                                                         │ ("Quikit2026")│
       │                                                         │               │
       │                                                         │ User.create   │
       │                                                         │ (password=hash│
       │                                                         │  must=true)   │
       │                                                         │               │
       │                                                         │ OrgMember     │
       │                                                         │ .create       │
       │                                                         │ inviteMethod  │
       │                                                         │ ="native"     │
       │                                                         │ inviteProvider│
       │                                                         │ =null         │
       │                                                         │ token=uuid    │
       │                                                         │               │
       │                                                         │ UserTeam.*    │
       │                                                         │ UserAppAccess │
       │                                                         │ UserAppRole   │
       │                                                         │               │
       │                                                         │ renderInvite  │
       │                                                         │ Email(native) │ ──▶ SMTP send
       │                                                         │   (subject:   │     "Welcome to … —
       │                                                         │    welcome,   │      your login details"
       │                                                         │    embeds temp│      with temp password
       │                                                         │    password + │      Quikit2026
       │                                                         │    accept URL)│
       │                                                         │               │
       │  201 { success:true, data:{userId, appRole, ...},       │               │
       │        meta:{ usedDefaultPassword, newUserCreated } }   │               │
       │  ◀──────────────────────────────────────────────────── │               │
       │                                                         │               │

… time passes, invitee opens email …

┌──────────────┐                                           ┌─────────┐
│  Invitee     │  4. Click "Set Up My Account"              │  Auth   │
└──────┬───────┘  ─────────────────────────────────────────▶ │  app    │
       │  GET /invitations/accept?token={UUID}                  │
       │ ─────────────────────────────────────────────────────▶ │
       │  5. Page mounts, calls GET /api/invitations/accept     │
       │     → validates token, returns orgName + email + role  │
       │  ◀───────────────────────────────────────────────────── │
       │                                                         │
       │  6a. Path A — Save & Continue                          │
       │      Enter currentPassword (default or admin-supplied) │
       │      + newPassword + confirmPassword                   │
       │      POST /api/invitations/accept                      │
       │         { token, currentPassword, newPassword, confirm}│
       │ ─────────────────────────────────────────────────────▶ │
       │                                  • bcrypt-verify       │
       │                                    currentPassword     │
       │                                  • policy-check        │
       │                                    newPassword         │
       │                                  • bcrypt.hash + store │
       │                                  • mustChangePassword  │
       │                                    = false             │
       │                                  • OrgMember:          │
       │                                    status="active"     │
       │                                    invitationToken=null│
       │                                  • UserAppAccess +     │
       │                                    UserAppRole grants  │
       │                                                         │
       │  6b. Path B — Skip for now                             │
       │      POST /api/invitations/accept { token, skip:true } │
       │ ─────────────────────────────────────────────────────▶ │
       │                                  • mustChangePassword  │
       │                                    = false  (default   │
       │                                    password stays)     │
       │                                  • OrgMember active    │
       │                                                         │
       │  7. Client calls signIn("credentials", {email, pwd})    │
       │     using either newPassword or default                 │
       │ ─────────────────────────────────────────────────────▶ │
       │                                  authorize() — bcrypt   │
       │                                  jwt() callback —       │
       │                                  auto-accepts ANY       │
       │                                  remaining pending      │
       │                                  native invites         │
       │                                  (defense in depth)     │
       │                                                         │
       │  8. Redirect → /apps (launcher) → /dashboard            │
       │  ◀───────────────────────────────────────────────────── │
```

---

## 2. Files at a glance

| Layer | File | Lines | Purpose |
|-------|------|-------|---------|
| UI form | [apps/quikscale/app/(dashboard)/org-setup/users/page.tsx](../app/(dashboard)/org-setup/users/page.tsx) | 342–957 | `UserPanel` component (the right-side panel from the screenshot) |
| Form state | same | 62–101 | `FormState` + `InvitationMethod` type |
| Toggle UI | same | 734–775 | The two-card "Native / SSO" buttons |
| Password input | same | 777–797 | Optional password field (only visible in Edit mode) |
| Native notice banner | same | 800–807 | The "Temporary password will be emailed" callout |
| Submit handler | same | 464–549 | Builds payload, calls POST `/api/org/users` |
| Zod schema | [apps/quikscale/lib/schemas/userSchema.ts](../lib/schemas/userSchema.ts) | 55–87 | `createOrgUserSchema` |
| POST handler | [apps/quikscale/app/api/org/users/route.ts](../app/api/org/users/route.ts) | 147–388 | Validates, creates User + OrgMember, sends email |
| Auth guard | [apps/quikscale/lib/api/withOrgAuth.ts](../lib/api/withOrgAuth.ts) | 60–182 | `withOrgAuthForModule("orgSetup.users")` |
| Constants | [packages/shared/lib/constants.ts](../../../packages/shared/lib/constants.ts) | 90–111 | `INVITE_METHOD`, `DEFAULT_INVITE_PASSWORD` |
| Email template | [packages/shared/lib/onboarding-email-template.ts](../../../packages/shared/lib/onboarding-email-template.ts) | 144–187 | `renderInvitationEmail()` — Native branch |
| Email transport | [apps/quikscale/lib/services/email.ts](../lib/services/email.ts) | 1–68 | `sendEmail()` (nodemailer + Office365 SMTP) |
| Accept-invite page | [apps/auth/app/invitations/accept/page.tsx](../../../apps/auth/app/invitations/accept/page.tsx) | 1–44 | Renders `SignInComponent` opened on `"invitation"` step |
| Accept-invite GET | [apps/auth/app/api/invitations/accept/route.ts](../../../apps/auth/app/api/invitations/accept/route.ts) | 30–87 | Validates token, returns org + user details |
| Accept-invite POST | same | 97–264 | Sets new password OR skips, activates membership |
| Password policy | same | 266–277 | Length, uppercase, digit, special, ≠ default |
| Credentials provider | [packages/auth/index.ts](../../../packages/auth/index.ts) | 81–165 | `authorize()` — bcrypt verify, rate-limited |
| jwt callback | same | 348–477 | Auto-accepts ANY remaining pending native invites on login |
| Prisma models | [packages/database/prisma/schema.prisma](../../../packages/database/prisma/schema.prisma) | 269–465 | `User`, `OrgMember`, `UserTeam`, `UserAppAccess` |

---

## 3. The UI — `Add New User` panel (Native branch)

### 3.1 Form state shape

Same `FormState` as the SSO flow — only the `invitationMethod` value differs.
For Native, `invitationMethod = "native"` (which is also the default).

```ts
// apps/quikscale/app/(dashboard)/org-setup/users/page.tsx — lines 62–101
type InvitationMethod = "native" | "sso";

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;                  // ← Native uses this; SSO ignores it
  role: string;
  appRoleId: string | null;
  teamIds: string[];
  status: string;
  linkExistingUserId: string | null;
  /** "native" → admin enters (or omits) a password; user signs in with
   *             email+password and is forced to change it on first login.
   *  "sso"    → no password collected. */
  invitationMethod: InvitationMethod;
};

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",                      // ← blank = server seeds DEFAULT_INVITE_PASSWORD
  role: "member",
  appRoleId: null,
  teamIds: [],
  status: "active",
  linkExistingUserId: null,
  invitationMethod: "native",        // ← default
};
```

### 3.2 The toggle card

```tsx
// apps/quikscale/app/(dashboard)/org-setup/users/page.tsx — lines 734–775
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

### 3.3 The "Temporary password will be emailed" notice

Shown only when **Native + Create + Not linking**. Tells the admin that leaving
the password blank still works (the system seeds the default).

```tsx
// apps/quikscale/app/(dashboard)/org-setup/users/page.tsx — lines 800–807
{!editUser && !form.linkExistingUserId && form.invitationMethod === "native" && (
  <div className="bg-accent-50 border border-accent-200 rounded-lg px-3 py-2 text-[11px] text-accent-800 leading-snug">
    <strong className="font-semibold">Temporary password will be emailed.</strong>{" "}
    The user will receive <span className="font-mono font-semibold">Quikit2026</span> at{" "}
    <span className="font-medium">{form.email || "their email"}</span> and be prompted
    to set a new password on first sign-in.
  </div>
)}
```

### 3.4 Password input (Edit mode only)

For **creates** we don't ask the admin to type a password — the server emails
`Quikit2026`. The password input only appears when **editing an existing user**.

```tsx
// apps/quikscale/app/(dashboard)/org-setup/users/page.tsx — lines 777–797
{editUser && !form.linkExistingUserId && (
  <div>
    <label className="text-xs font-medium text-gray-600 block mb-1.5">
      Password{" "}
      <span className="text-gray-400 font-normal">(leave blank to keep unchanged)</span>
    </label>
    <input
      type="password"
      value={form.password}
      onChange={(e) => set("password", e.target.value)}
      placeholder="Enter new password to change"
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 placeholder-gray-400"
    />
  </div>
)}
```

### 3.5 Submit handler — what gets sent for a Native invite

```ts
// apps/quikscale/app/(dashboard)/org-setup/users/page.tsx — lines 464–549
async function handleSubmit() {
  if (!form.firstName.trim()) { setError("First name is required."); return; }
  if (!form.lastName.trim())  { setError("Last name is required.");  return; }
  if (!form.email.trim())     { setError("Email is required.");      return; }
  // Native invites no longer require a typed password — when left blank,
  // the server seeds Quikit2026 and emails it to the invitee.

  setSaving(true);
  setError("");
  try {
    const payload: Record<string, unknown> = {
      firstName: form.firstName,
      lastName:  form.lastName,
      email:     form.email,
      role:      "member",
      teamIds:   form.teamIds,
    };

    // Only attach password when the admin actually typed one. An empty
    // string would fail Zod's min(8) on the server. For new Native users
    // who leave it blank, the server seeds the Quikit2026 default.
    if (form.password.trim()) payload.password = form.password.trim();
    if (editUser) payload.status = form.status;
    if (!editUser && !form.linkExistingUserId) {
      payload.invitationMethod = form.invitationMethod;   // ← "native"
    }

    const res = await fetch(editUser
        ? `/api/org/users/${editUser.userId}`
        : "/api/org/users", {
      method:  editUser ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) { setError(json.error || "Failed to save"); return; }

    // Apply chosen AppRole via PATCH if it differs from server default.
    if (form.appRoleId && form.appRoleId !== json.data.appRoleId) {
      await fetch(`/api/org/users/${json.data.userId}/role`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ roleId: form.appRoleId }),
      });
    }

    onSaved(json.data);
    onClose();
  } finally {
    setSaving(false);
  }
}
```

**Wire-level request for a Native invite with default password:**

```json
POST /api/org/users
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName":  "Smith",
  "email":     "jane@company.com",
  "role":      "member",
  "teamIds":   ["team_clxxx1", "team_clxxx2"],
  "invitationMethod": "native"
}
```

**Wire-level request when admin supplies a password:**

```json
POST /api/org/users
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName":  "Smith",
  "email":     "jane@company.com",
  "password":  "TempSecret#42",
  "role":      "member",
  "teamIds":   [],
  "invitationMethod": "native"
}
```

---

## 4. The API — `POST /api/org/users` (Native branch)

### 4.1 Zod schema

```ts
// apps/quikscale/lib/schemas/userSchema.ts — lines 55–87
import { z } from "zod";
import { USER_ROLE_VALUES } from "@quikit/shared";

export const createOrgUserSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName:  z.string().min(1, "Last name is required").max(100),
  email:     z.string().email("Invalid email").max(200),
  /** Required only when creating a brand-new auth.User. When the caller
   *  passes `linkExistingUserId`, the user already has credentials — we
   *  skip user.create and just grant them quikscale access. */
  password:  z.string().min(8, "Password must be at least 8 characters").max(200).optional(),
  role:      z.enum(USER_ROLE_VALUES).optional(),
  teamIds:   z.array(z.string()).optional(),
  teamId:    z.string().nullable().optional(),                // legacy single-team
  linkExistingUserId: z.string().min(1).optional(),            // "add existing to QuikScale"
  /** "native" | "sso". Defaults to "native" for back-compat. */
  invitationMethod: z.enum(["native", "sso"]).optional(),
});
export type CreateOrgUserInput = z.infer<typeof createOrgUserSchema>;
```

### 4.2 The route handler — Native path, annotated

```ts
// apps/quikscale/app/api/org/users/route.ts — lines 147–388
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { createOrgUserSchema } from "@/lib/schemas/userSchema";
import { getQuikScaleAppId } from "@/lib/api/permissions";
import { seedAllDefaultRoles, ensureUserOnRole } from "@/lib/api/seedAdminAppRole";
import {
  DEFAULT_INVITE_PASSWORD,         //  "Quikit2026"
  INVITE_METHOD,                    //  { SSO: "sso", NATIVE: "native" }
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
    invitationMethod = "native",        // ← defaults to native
  } = parsed.data;
  const resolvedTeamIds = teamIds.length ? teamIds : teamId ? [teamId] : [];
  const normalisedEmail = email.trim().toLowerCase();

  /* ── 2. SSO MX classification — skipped for Native ──────────────── */
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

  /* ── 3. Resolve default Native password if admin left it blank ───
     Mirrors the QuikIT super-admin first-Org-Admin flow: invitee gets
     Quikit2026 in their email and must change it on first login.    */
  const isNativeNewUser =
    !linkExistingUserId && invitationMethod === INVITE_METHOD.NATIVE;
  const usedDefaultPassword = isNativeNewUser && !password;
  const effectivePassword  = usedDefaultPassword
    ? DEFAULT_INVITE_PASSWORD
    : password;

  /* ── 4. Create / locate the User row ─────────────────────────────── */
  let newUserId: string;
  let newUserCreated = false;

  if (linkExistingUserId) {
    // "Add existing org member to QuikScale" — they already have a password.
    const member = await db.orgMember.findUnique({
      where:  { orgId_userId: { orgId, userId: linkExistingUserId } },
      select: { userId: true },
    });
    if (!member) return NextResponse.json(
      { success: false, error: "User is not a member of this organisation" },
      { status: 404 },
    );
    newUserId = member.userId;
  } else {
    const existingUser = await db.user.findUnique({
      where: { email: normalisedEmail },
    });

    if (existingUser) {
      // Email belongs to a different org — add membership to THIS org only.
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
          inviteMethod: invitationMethod,         // "native"
          inviteProvider: ssoProvider,            //  null  (Native has no provider)
        },
      });
      newUserId = existingUser.id;
    } else {
      /* ── 4a. Brand-new Native user ────────────────────────────────
         Hash either the admin-supplied or default password with bcrypt
         (cost 12). Set mustChangePassword=true so the post-login flow
         routes the user to /set-password on first credentials sign-in
         (unless they accepted via /invitations/accept first, which also
         clears the flag).                                              */
      const isSso = invitationMethod === INVITE_METHOD.SSO;
      const hashedPassword = isSso
        ? null                                              // SSO branch
        : await bcrypt.hash(effectivePassword!.trim(), 12); // ← NATIVE BRANCH

      const user = await db.user.create({
        data: {
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          email:     normalisedEmail,
          password:  hashedPassword,
          mustChangePassword: !isSso,             // true for Native invitees
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
          invitationToken: crypto.randomUUID(),   // single-use UUID
          invitedAt: new Date(),
          inviteMethod: invitationMethod,         // "native"
          inviteProvider: ssoProvider,            //  null
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
      where:  { orgId, appId, userId: newUserId },
      select: { id: true },
    });
    if (!existingAccess) {
      await db.userAppAccess.create({
        data: { userId: newUserId, orgId, appId, role: "member", grantedBy: userId },
      });
    }

    const { adminRoleId, userRoleId } = await seedAllDefaultRoles(orgId);

    // Safety: first user in an admin-less org becomes admin (prevents lockout).
    const adminMemberCount = await db.userAppRole.count({
      where: { orgId, roleId: adminRoleId },
    });
    const targetRoleId   = adminMemberCount === 0 ? adminRoleId : userRoleId;
    const targetRoleName = adminMemberCount === 0 ? "admin"     : "User";

    await ensureUserOnRole(newUserId, orgId, targetRoleId, userId);
    appRole = { id: targetRoleId, name: targetRoleName };
  }

  /* ── 7. Send the onboarding email ────────────────────────────────── */
  const membership = await db.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: newUserId } },
    include: { /* user + userTeams … */ },
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
        inviteMethod:   invitationMethod,                 // ← "native" branches template
        ssoProvider,                                       //  null
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
      meta:    {
        usedDefaultPassword,    // true → admin omitted password; default seeded
        newUserCreated,         // true → brand-new auth.User row; false → linked
      },
    },
    { status: 201 },
  );
}, { fallbackErrorMessage: "Failed to create user" });
```

### 4.3 The auth guard

```ts
// apps/quikscale/lib/api/withOrgAuth.ts (simplified)
export function withOrgAuthForModule(moduleKey: string) {
  return (handler, options = {}) =>
    withOrgAuth(handler, { moduleKey, ...options });
}
```

`withOrgAuth` runs (in order): session check (401), `orgId` resolve (403), module
gate (404), permission check (403), then calls the handler with
`{ session, userId, orgId }`. If your app doesn't have RBAC v2, drop in a simple
`requireAdmin()` wrapper.

---

## 5. Constants

```ts
// packages/shared/lib/constants.ts — lines 90–111
export const INVITE_METHOD = {
  SSO:    "sso",
  NATIVE: "native",
} as const;
export type InviteMethod = (typeof INVITE_METHOD)[keyof typeof INVITE_METHOD];

/** System-defined default password for all native email invitations.
 *  Stored as a constant so email templates, accept endpoint, and policy
 *  check all agree on the exact string. */
export const DEFAULT_INVITE_PASSWORD = "Quikit2026";

export const SSO_PROVIDER = {
  GOOGLE:    "google",
  MICROSOFT: "microsoft",
} as const;
export type SsoProvider = (typeof SSO_PROVIDER)[keyof typeof SSO_PROVIDER];
```

---

## 6. Prisma models

```prisma
// packages/database/prisma/schema.prisma
model User {
  id                  String    @id @default(cuid())
  email               String    @unique
  emailVerified       DateTime?
  password            String?                          // ← bcrypt hash for Native
  firstName           String
  lastName            String
  avatar              String?
  isSuperAdmin        Boolean   @default(false)
  mustChangePassword  Boolean   @default(false)        // ← TRUE for Native invitees
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  lastSignInAt        DateTime?

  memberships         OrgMember[]
  userTeams           UserTeam[]
  appAccess           UserAppAccess[]

  @@index([email])
  @@schema("auth")
}

model OrgMember {
  id                String    @id @default(cuid())
  orgId             String
  userId            String
  role              String                              // "admin" | "manager" | "member"
  teamId            String?
  customPermissions String[]
  invitationToken   String?   @unique                   // ← random UUID; cleared on accept
  invitedAt         DateTime?
  acceptedAt        DateTime?
  status            String    @default("active")        // "invited" | "active" | …
  createdBy         String?
  inviteAppIds      String[]  @default([])
  /// "sso" or "native" — drives which onboarding email is sent
  inviteMethod      String?
  /// "google" | "microsoft" | null — null for native
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

## 7. The invitation email (Native branch)

### 7.1 Template

```ts
// packages/shared/lib/onboarding-email-template.ts — lines 144–187
// ── Native Email branch (FRD §4.2) ──────────────────────────────────────
const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(15,23,42,0.07);">
    <div style="background:${accent};padding:32px 40px;">${headerInner}</div>
    <div style="padding:40px;">
      <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;font-weight:600;">Hi ${safeFirst},</h2>
      <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">
        ${safeInviter} has set you up as the <strong>${safeRole}</strong>
        for <strong>${safeOrg}</strong> on the Quikit platform.
      </p>
      <p style="margin:0 0 8px;color:#0f172a;font-size:14px;font-weight:600;">You have been granted access to:</p>
      ${appListHtml(appNames)}

      {/* ── credentials block — UNIQUE TO NATIVE ── */}
      <div style="margin:0 0 16px;padding:16px;background:#f1f5f9;border-radius:8px;">
        <p style="margin:0 0 6px;color:#0f172a;font-size:14px;font-weight:600;">Your login details</p>
        <p style="margin:0 0 4px;color:#0f172a;font-size:14px;">
          Email: <strong>${escapeHtml(to)}</strong>
        </p>
        <p style="margin:0;color:#0f172a;font-size:14px;">
          Temporary password: <strong>${DEFAULT_INVITE_PASSWORD}</strong>
        </p>
      </div>

      <p style="margin:0 0 8px;color:#0f172a;font-size:14px;font-weight:600;">Getting started:</p>
      <ol style="margin:0 0 16px;padding-left:20px;color:#0f172a;font-size:14px;line-height:1.6;">
        <li>Click the link below.</li>
        <li>Enter your temporary password.</li>
        <li>You will be prompted to set a new password (or skip to keep the default for now).</li>
        <li>Log in with your credentials.</li>
      </ol>
      <a href="${acceptUrl}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:500;">
        Set Up My Account
      </a>
      <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;line-height:1.5;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${acceptUrl}" style="color:${accent};word-break:break-all;">${acceptUrl}</a>
      </p>
      <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">
        For security, we recommend setting a new password on your first login.
        This invitation is valid for 7 days.
      </p>
    </div>
    <div style="padding:20px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:12px;">
        Quikit by Moreyeahs &middot; If you didn't expect this, you can ignore this email.
      </p>
    </div>
  </div>
</body></html>`;

const subject = isReminder
  ? `Reminder: welcome to ${orgName} on Quikit — your login details`
  : `Welcome to ${orgName} on Quikit — your login details`;

return { subject, html };
```

> **Two key differences from the SSO email:**
> 1. Embeds **email + temporary password** as plaintext (`Quikit2026` by default,
>    or whatever the admin supplied).
> 2. CTA links to `${appBaseUrl}/invitations/accept?token={UUID}` — NOT `/login`.
>    The accept page is what validates the token and runs the Set-Password flow.

Both templates are produced by a single `renderInvitationEmail()` call — the
`inviteMethod` argument selects the branch:

```ts
import { renderInvitationEmail } from "@quikit/shared";

const { subject, html } = renderInvitationEmail({
  to:             "jane@company.com",
  firstName:      "Jane",
  orgName:        "Acme Co.",
  orgBrandColor:  "#6366f1",
  inviterName:    "Admin User",
  role:           "User",
  appNames:       ["QuikScale"],
  token:          membership.invitationToken,
  appBaseUrl:     process.env.NEXT_PUBLIC_AUTH_URL!,
  inviteMethod:   "native",       // ← selects the Native branch
  ssoProvider:    null,
});
```

### 7.2 Transport — `sendEmail()`

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
rest of the codebase is unchanged.

---

## 8. The accept-invite page

When the invitee clicks **Set Up My Account** in their email they land here.

```tsx
// apps/auth/app/invitations/accept/page.tsx (full file)
"use client";
import { useSearchParams } from "next/navigation";
import { SignInComponent } from "@quikit/ui";

export default function InvitationAcceptPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const launcherUrl =
    process.env.NEXT_PUBLIC_LAUNCHER_URL ?? "http://localhost:3001/apps";
  const launcherApps =
    `${launcherUrl.replace(/\/+$/, "").replace(/\/apps$/, "")}/apps`;

  return (
    <SignInComponent
      brandName="QuikIT"
      redirectPath={launcherApps}
      hardNavigate
      initialStep="invitation"          // ← opens on the Set-Password step
      invitationToken={token}           // ← passed to GET /api/invitations/accept
      invitationLauncherUrl={launcherUrl}
    />
  );
}
```

**What the component does** (handled inside `@quikit/ui` `SignInComponent`):

1. On mount, calls `GET /api/invitations/accept?token={UUID}` to validate the
   token. Bad/expired token → renders an error screen.
2. Valid token → renders the **Set your password** form with three fields:
   `currentPassword` (placeholder "Default password"), `newPassword`,
   `confirmPassword` — plus a **Skip for now** secondary button.
3. **Save & Continue** → `POST /api/invitations/accept` with all three fields →
   on success calls `signIn("credentials", { email, password: newPassword })`
   → redirects to `/apps`.
4. **Skip for now** → `POST /api/invitations/accept` with `{ skip: true }` →
   on success falls back to the email step so the user signs in manually with
   the default password.

> The page lives at the **top level** (not under the `(auth)` route group) so
> the SignInComponent's own `min-h-screen w-screen` shell takes the whole
> viewport rather than being boxed inside the auth-card layout.

---

## 9. The accept-invite API

### 9.1 `GET /api/invitations/accept?token=…` — validate token

```ts
// apps/auth/app/api/invitations/accept/route.ts — lines 30–87
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Token is required" },
      { status: 400 },
    );
  }

  const membership = await db.orgMember.findUnique({
    where: { invitationToken: token },
    include: {
      org:  { select: { name: true, logoUrl: true, brandColor: true } },
      user: { select: { email: true, firstName: true, lastName: true } },
    },
  });

  if (!membership) {
    return NextResponse.json(
      { success: false, error: "Invalid or expired invitation" },
      { status: 404 },
    );
  }

  // BR-006 — replay prevention: once active, the token is dead even if the
  // attacker has the URL.
  if (membership.status === "active") {
    return NextResponse.json(
      { success: false, error: "Invitation already accepted. Please sign in." },
      { status: 400 },
    );
  }

  // BRV-009 — 7-day TTL.
  if (
    membership.invitedAt &&
    Date.now() - membership.invitedAt.getTime() > INVITATION_TTL_MS
  ) {
    return NextResponse.json(
      { success: false, error: "This invitation has expired. Please ask the admin to resend it." },
      { status: 410 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      orgName:      membership.org.name,
      orgLogo:      membership.org.logoUrl,
      orgColor:     membership.org.brandColor,
      email:        membership.user.email,
      firstName:    membership.user.firstName,
      lastName:     membership.user.lastName,
      role:         membership.role,
      inviteMethod: membership.inviteMethod,
    },
  });
}
```

### 9.2 `POST /api/invitations/accept` — set password or skip

```ts
// apps/auth/app/api/invitations/accept/route.ts — lines 97–264
import bcrypt from "bcryptjs";
import { DEFAULT_INVITE_PASSWORD, INVITE_METHOD, MEMBERSHIP_ROLES } from "@quikit/shared";
import { assignAppRoles } from "@quikit/auth/assign-app-roles";

interface AcceptBody {
  token?: string;
  skip?: boolean;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export async function POST(request: NextRequest) {
  let body: AcceptBody = {};
  try { body = (await request.json()) as AcceptBody; }
  catch {
    return NextResponse.json(
      { success: false, error: "Body must be JSON" },
      { status: 400 },
    );
  }

  const { token, skip, currentPassword, newPassword, confirmPassword } = body;
  if (!token) return NextResponse.json(
    { success: false, error: "Token is required" },
    { status: 400 },
  );

  const membership = await db.orgMember.findUnique({
    where: { invitationToken: token },
    include: { user: { select: { id: true, email: true, password: true } } },
  });

  if (!membership || membership.status === "active") {
    return NextResponse.json(
      { success: false, error: "Invalid or already accepted invitation" },
      { status: 400 },
    );
  }

  // 7-day TTL again (defense in depth — the form is open ≥1s after GET).
  if (
    membership.invitedAt &&
    Date.now() - membership.invitedAt.getTime() > INVITATION_TTL_MS
  ) {
    return NextResponse.json(
      { success: false, error: "This invitation has expired. Please ask the admin to resend it." },
      { status: 410 },
    );
  }

  const inviteMethod = membership.inviteMethod ?? INVITE_METHOD.NATIVE;

  /* ── Native flow: branch on Skip vs Save ─────────────────────────── */
  if (inviteMethod === INVITE_METHOD.NATIVE) {
    if (skip) {
      // FR-SA-010 — user opted to keep the default password for now. We
      // just clear the must-change flag so they're not routed back to
      // /set-password on every login.
      await db.user.update({
        where: { id: membership.user.id },
        data:  { mustChangePassword: false },
      });
    } else {
      /* ── Validate the three password fields ──────────────────────── */
      if (!currentPassword || !newPassword || !confirmPassword) {
        return NextResponse.json(
          { success: false, error: "All password fields are required." },
          { status: 400 },
        );
      }
      if (newPassword !== confirmPassword) {
        return NextResponse.json(
          { success: false, error: "Passwords do not match. Please re-enter." },
          { status: 400 },
        );
      }

      // BRV-008 — current password must match what's stored. For a freshly
      // invited user that's the system default (Quikit2026) or the
      // admin-supplied password; for someone retrying after a failed reset
      // it's whatever they last set.
      if (!membership.user.password) {
        return NextResponse.json(
          { success: false, error: "Account has no password set. Use Forgot Password." },
          { status: 400 },
        );
      }
      const okCurrent = await bcrypt.compare(currentPassword, membership.user.password);
      if (!okCurrent) {
        return NextResponse.json(
          { success: false, error: "Incorrect password. Please enter your default password to proceed." },
          { status: 400 },
        );
      }

      // Password policy: ≥8 chars, 1 uppercase, 1 digit, 1 special, ≠ default.
      const policyError = checkPasswordPolicy(newPassword);
      if (policyError) {
        return NextResponse.json(
          { success: false, error: policyError },
          { status: 400 },
        );
      }

      // Store the new hash + clear must-change.
      const hashed = await bcrypt.hash(newPassword, 10);
      await db.user.update({
        where: { id: membership.user.id },
        data:  { password: hashed, mustChangePassword: false },
      });
    }
  }

  /* ── Activate the membership + invalidate the token ──────────────── */
  // FR-SA-006 — single-use token: clearing it prevents replay.
  await db.orgMember.update({
    where: { id: membership.id },
    data: {
      status:          "active",
      acceptedAt:      new Date(),
      invitationToken: null,
    },
  });

  /* ── Grant the apps the inviter selected ─────────────────────────── */
  // FR-SA-002 / FR-OA-002. Creates UserAppAccess rows and (for RBAC v2
  // apps like quikscale + quiktrack) UserAppRole rows.
  const grantAppIds = membership.inviteAppIds ?? [];
  if (grantAppIds.length > 0) {
    const userAppRole =
      membership.role === MEMBERSHIP_ROLES.APP_ADMIN ? "admin" : "member";
    await db.userAppAccess.createMany({
      data: grantAppIds.map((appId) => ({
        userId: membership.user.id,
        orgId:  membership.orgId,
        appId,
        role:   userAppRole,
        grantedBy: membership.createdBy,
      })),
      skipDuplicates: true,
    });

    await assignAppRoles(
      db,
      membership.orgId,
      grantAppIds.map((appId) => ({
        userId:   membership.user.id,
        appId,
        roleName: userAppRole === "admin" ? "Admin" : "",   // "" → helper's default
      })),
    ).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    data: {
      email:   membership.user.email,
      // Tells the client whether to attempt auto-sign-in (Save & Continue)
      // or send the user to /login to enter credentials manually (Skip).
      skipped: Boolean(skip),
    },
  });
}
```

### 9.3 Password policy

```ts
// apps/auth/app/api/invitations/accept/route.ts — lines 266–277
function checkPasswordPolicy(pw: string): string | null {
  if (pw.length < 8)
    return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pw))
    return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(pw))
    return "Password must contain at least one number.";
  if (!/[^A-Za-z0-9]/.test(pw))
    return "Password must contain at least one special character.";
  if (pw === DEFAULT_INVITE_PASSWORD)
    return "New password cannot be the same as the default password.";
  return null;
}
```

---

## 10. NextAuth — the credentials provider

This is what lets the invitee log in after they finish the accept-invite flow.

### 10.1 The credentials provider

```ts
// packages/auth/index.ts — lines 81–165
CredentialsProvider({
  name: "Credentials",
  credentials: {
    email:    { label: "Email",    type: "email"    },
    password: { label: "Password", type: "password" },
  },
  async authorize(credentials, req) {
    if (!credentials?.email || !credentials?.password) {
      throw new Error("Invalid credentials");
    }

    // ── Two-axis rate limit, both distributed via Redis when REDIS_URL is set.
    // Per-email: stops targeted guessing on one account.
    // Per-IP:    stops credential-stuffing across many emails.
    const emailKey = String(credentials.email).toLowerCase();
    const emailRL = await rateLimitAsync({
      routeKey:   "auth:login:email",
      clientKey:  emailKey,
      limit:      5,
      windowMs:   15 * 60 * 1000,
      failClosed: FAIL_CLOSED,
    });
    if (!emailRL.ok) {
      throw new Error("Too many login attempts. Please try again in 15 minutes.");
    }

    const ipRL = await rateLimitAsync({
      routeKey:   "auth:login:ip",
      clientKey:  nextAuthIp(req),
      limit:      20,
      windowMs:   15 * 60 * 1000,
      failClosed: FAIL_CLOSED,
    });
    if (!ipRL.ok) {
      throw new Error("Too many login attempts from this IP. Try again later.");
    }

    // Case-insensitive lookup — historical rows may have mixed-case emails.
    const user = await db.user.findFirst({
      where: { email: { equals: String(credentials.email), mode: "insensitive" } },
    });

    if (!user || !user.password) {
      // No row OR SSO-only user (password is NULL) — both surface as
      // "Invalid credentials" so an attacker can't enumerate accounts.
      throw new Error("Invalid credentials");
    }

    const isPasswordValid = await bcrypt.compare(
      credentials.password as string,
      user.password,
    );
    if (!isPasswordValid) throw new Error("Invalid credentials");

    // Users added by admin start with empty firstName/lastName (collected
    // on first login via /complete-profile). Fall back to email so
    // session.user.name is never blank.
    const fullName = `${user.firstName} ${user.lastName}`.trim();
    return {
      id: user.id,
      email: user.email,
      name: fullName || user.email,
      isSuperAdmin: user.isSuperAdmin,
    };
  },
})
```

### 10.2 The `jwt` callback — defense-in-depth auto-accept

The `/api/invitations/accept` POST handler already activates the membership.
But the `jwt` callback **also** auto-accepts any remaining `inviteMethod: "native"`
memberships that are still in `status: "invited"` — useful if (a) the admin
told the user the password verbally and the user logged in directly without
clicking the accept link, or (b) the email never arrived.

```ts
// packages/auth/index.ts — lines 348–477
async jwt({ token, user, trigger, session }) {
  if (user) {
    token.id           = user.id;
    token.email        = user.email;
    token.isSuperAdmin = user.isSuperAdmin ?? false;
    token.sessionId    = await createAuthSession(user.id, 30 * 24 * 60 * 60);
    token.sessionTouchedAt = Date.now();

    // FR-SA-006 — auto-accept any pending NATIVE invitations for this user.
    // SSO invites are accepted in the signIn callback (OAuth-only). Native
    // credentials logins would otherwise leave invited memberships stuck —
    // token.orgId stays undefined and the launcher can never resolve an
    // org. The user has authenticated against their stored password, so
    // we treat that as proof of identity equivalent to clicking the
    // accept-invite link.
    const pendingNativeInvites = await db.orgMember.findMany({
      where: { userId: user.id, status: "invited", inviteMethod: "native" },
    });
    for (const inv of pendingNativeInvites) {
      await db.orgMember.update({
        where: { id: inv.id },
        data:  { status: "active", acceptedAt: new Date(), invitationToken: null },
      });
      if (inv.inviteAppIds.length > 0) {
        const userAppRole = inv.role === "app_admin" ? "admin" : "member";
        await db.userAppAccess.createMany({
          data: inv.inviteAppIds.map((appId) => ({
            userId: user.id, orgId: inv.orgId, appId, role: userAppRole,
            grantedBy: inv.createdBy,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Auto-select first active org so launcher and /dashboard work.
    const firstMembership = await db.orgMember.findFirst({
      where:   { userId: user.id, status: "active" },
      orderBy: { createdAt: "asc" },
      select:  { orgId: true, role: true },
    });
    if (firstMembership) {
      token.orgId          = firstMembership.orgId;
      token.membershipRole = firstMembership.role;
      token.membershipCheckedAt = Date.now();
    }
  }
  // … session-touch + recheck-every-5-min logic … (see source)
  return token;
}
```

### 10.3 The `session` callback

```ts
async session({ session, token }) {
  session.user = {
    ...session.user,
    id:                token.id          as string,
    email:             token.email       as string,
    orgId:             token.orgId       as string | undefined,
    membershipRole:    token.membershipRole as string | undefined,
    membershipInvalid: token.membershipInvalid as boolean | undefined,
    isSuperAdmin:      token.isSuperAdmin   as boolean | undefined,
  };
  return session;
}
```

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
NEXT_PUBLIC_LAUNCHER_URL=https://your-app.com/apps        # used by accept page

# ── SMTP (nodemailer transport) ──────────────────────────
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false                  # STARTTLS on 587
EMAIL_USER=no-reply@yourcompany.com
EMAIL_PASSWORD=                    # OR EMAIL_PASSWORD_B64=<base64>
SMTP_FROM="Quikit <no-reply@yourcompany.com>"

# ── (Optional) Distributed rate limiter for credentials ──
REDIS_URL=rediss://default:pwd@host:6379
```

Native flow does **not** require `GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID`, or
anything OAuth-related — but the credentials provider still needs `DATABASE_URL`,
`NEXTAUTH_SECRET`, and a working SMTP transport.

---

## 12. Integration checklist for a fresh app

Follow in order — each step depends on the previous.

- [ ] **Install deps**:
  `next-auth bcryptjs zod nodemailer` (+ Prisma + the `@quikit/shared` constants
  + email template if vendoring those, or copy them locally).
- [ ] **Copy/adapt Prisma models** (`User`, `OrgMember`, `UserTeam`,
  `UserAppAccess`) from §6. Run `prisma migrate dev`.
- [ ] **Add the constants** (`INVITE_METHOD`, `DEFAULT_INVITE_PASSWORD`) — §5.
- [ ] **Add the Zod schema** for the create-user request — §4.1.
- [ ] **Add the `POST /api/org/users` route** — §4.2. Copy verbatim and adjust
  guard / DB import paths. Use `bcryptjs.hash(pw, 12)` for the password.
- [ ] **Add `sendEmail()` transport** — §7.2. Plug in your SMTP credentials.
- [ ] **Add `renderInvitationEmail()`** — §7.1 (full file is
  `onboarding-email-template.ts` — both branches in one function).
- [ ] **Build the UI panel** — §3. The Native branch is the default; the toggle,
  password input, and notice banner are the only Native-specific UI elements.
- [ ] **Add `GET /api/invitations/accept`** — §9.1. Token validation + 7-day TTL.
- [ ] **Add `POST /api/invitations/accept`** — §9.2. Set-password vs skip,
  password policy, membership activation, app grants.
- [ ] **Build the accept-invite page at `/invitations/accept`** — §8. If you
  don't have a shared `SignInComponent`, build a simple form with three
  password inputs + a "Skip for now" button.
- [ ] **Add NextAuth `CredentialsProvider`** — §10.1. bcrypt-verify + optional
  rate limiting.
- [ ] **Wire the `jwt` callback** — §10.2. The `pendingNativeInvites`
  auto-accept block is mandatory — without it, users who log in directly
  (instead of via the accept link) get stuck on the launcher with no
  `token.orgId`.
- [ ] **Wire the `session` callback** — §10.3.
- [ ] **Smoke-test end-to-end**:
  1. Create a Native invite. Confirm the response includes
     `meta.usedDefaultPassword = true` and `meta.newUserCreated = true`.
  2. Confirm `User.password IS NOT NULL`, `mustChangePassword = true`,
     `OrgMember.status = "invited"`, `inviteMethod = "native"`, `inviteProvider
     IS NULL`, `invitationToken IS NOT NULL`.
  3. Check the inbox — subject "Welcome to … on Quikit — your login details",
     body shows `Email: …` and `Temporary password: Quikit2026`, CTA links
     to `${NEXT_PUBLIC_AUTH_URL}/invitations/accept?token=…`.
  4. Click CTA → land on accept page → enter `Quikit2026` + a new password
     that satisfies the policy → click **Save & Continue** → land on `/apps`.
  5. Confirm `User.password` now hashes the new password,
     `mustChangePassword = false`, `OrgMember.status = "active"`,
     `acceptedAt` set, `invitationToken IS NULL`.
- [ ] **Smoke-test "Skip for now"**:
  1. Create another Native invite.
  2. Click email CTA → accept page → click **Skip for now**.
  3. Confirm `User.password` is unchanged (still hashes `Quikit2026`),
     `mustChangePassword = false` (cleared even though they didn't set a
     new one), membership active.
  4. Go to `/login`, sign in with email + `Quikit2026` — should succeed.
- [ ] **Smoke-test the defense-in-depth `jwt` auto-accept**:
  1. Create another Native invite, but **don't** click the email link.
  2. Tell the user the password verbally and have them go straight to
     `/login`.
  3. After credentials sign-in, confirm the `jwt` callback flipped the
     membership to `active` and minted a JWT with `orgId` populated.

---

## 13. Common pitfalls

| Symptom | Likely cause | Fix |
|---|---|---|
| **400 "Password must be at least 8 characters"** | Form submitted with `password: ""` instead of omitting the field | Only attach `password` to the payload when `form.password.trim() !== ""` — see [submit handler §3.5]. |
| **Email arrives without temp password** | `inviteMethod` wasn't passed to `renderInvitationEmail` (defaults to SSO branch?) | Always pass `inviteMethod: "native"` explicitly to the renderer. |
| **User signs in but lands on `/login?error=…`** | `signIn("credentials", …)` was called with the WRONG password (e.g. tried `newPassword` even though Skip was clicked) | Check the `skipped` flag in the POST response — use the default password if `skipped: true`, else `newPassword`. |
| **`token.orgId` undefined after login** | `jwt` callback missing the `firstMembership` lookup or the native auto-accept block | Add both blocks from §10.2. |
| **"Incorrect password. Please enter your default password to proceed."** | User typed the new password into the **currentPassword** field | Re-explain: current = the one in the email, new = whatever they want to set going forward. |
| **Email delivered but accept link 404s** | `NEXT_PUBLIC_AUTH_URL` not set, so `appBaseUrl` falls back to `http://localhost:3000` in prod | Set `NEXT_PUBLIC_AUTH_URL` (and ideally `NEXTAUTH_URL`) in the env that the API route runs in. |
| **`OrgMember.status` stays "invited" forever** | User logged in via credentials, but the `jwt` callback isn't running the auto-accept block | Add the `pendingNativeInvites` loop — §10.2. |
| **Invite link works once, then says "Invitation already accepted"** | Working as designed — single-use token. The user should now use `/login` directly. | None — surface a "Sign in with your password" link on the error screen. |

---

## 14. Native vs SSO at a glance

| Aspect | Native | SSO |
|---|---|---|
| **Password stored on User** | bcrypt hash (admin's or `Quikit2026`) | NULL |
| **`mustChangePassword` initial value** | `true` | `false` |
| **`OrgMember.inviteProvider`** | `null` | `"google"` or `"microsoft"` |
| **Email subject** | "Welcome to … — your login details" | "You've been invited to join …" |
| **Email body** | Embeds email + temporary password | Provider-specific CTA, no credentials |
| **Email CTA destination** | `/invitations/accept?token=…` | `/login` |
| **Token validation endpoint** | `GET /api/invitations/accept` | n/a (no token validation needed) |
| **Membership activation trigger** | `POST /api/invitations/accept` OR NextAuth `jwt` callback | NextAuth `signIn` callback |
| **Login mechanism** | Credentials provider | Google or Azure AD OAuth provider |
| **Rate limiting** | Yes (per-email + per-IP, 5 / 15 min) | Handled by provider |
| **Required env vars** | `SMTP_*`, `NEXTAUTH_*` | `GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID`, etc. |
| **MX-record validation** | No | Yes (Google Workspace / Microsoft 365 check) |

---

## 15. Glossary

| Term | Meaning |
|---|---|
| **Native invite** | Admin creates user with a password (admin-supplied or system default `Quikit2026`); user signs in with email + password and must reset on first accept. |
| **SSO invite** | Admin creates user with `password = NULL`; user signs in via Google / Microsoft OAuth, never has a password. |
| **`DEFAULT_INVITE_PASSWORD`** | The string `"Quikit2026"`. Used in three places: server-side seeding when admin omits a password, email template body, and the `checkPasswordPolicy()` denylist. |
| **`mustChangePassword`** | Boolean on `User`. Set to `true` for fresh Native invitees; cleared by `/api/invitations/accept` POST (regardless of Save or Skip) so the user isn't routed back to `/set-password` on every login. |
| **`invitationToken`** | Random UUID stored on `OrgMember`. Single-use: the accept POST clears it (`null`) when activating the membership. Validates against a 7-day TTL. |
| **Single-use** | Once `OrgMember.status = "active"`, the token is gone (`null`), so a leaked email link can't be replayed. The GET endpoint also rejects already-active memberships explicitly. |
| **Defense-in-depth auto-accept** | The NextAuth `jwt` callback flips `status: invited → active` for any pending Native invites on credentials login. Covers the case where the user got the password verbally and skipped the email link entirely. |

---

*Last updated: 2026-05-20. Maintained alongside the implementation — if you change any
file referenced above, update this doc in the same PR.*
