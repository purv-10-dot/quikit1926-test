import { Resend } from "resend";
import { requireProdEnv } from "@quikit/shared/env";
import {
  renderInvitationEmail,
  sendWithRetry,
  type RenderInvitationParams,
  type InviteMethod,
  type SsoProvider,
} from "@quikit/shared";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");
  }
  return _resend;
}

/**
 * Base URL the invitation email's "Set Up My Account" link should point at.
 * That destination is the central auth service (which hosts /login AND
 * /invitations/accept) — NOT the launcher — because unauthenticated users
 * have no session on the launcher and would be bounced through a redirect
 * loop. Resolved lazily so a preview env without the var doesn't crash on
 * import.
 */
function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_AUTH_URL ||
    requireProdEnv("APP_URL", "http://localhost:3000") // prod-safety-allow: dev fallback, prod throws
  );
}

interface InvitationEmailParams {
  to: string;
  firstName: string;
  orgName: string;
  orgLogoUrl?: string | null;
  orgBrandColor?: string | null;
  inviterName: string;
  /** Display label e.g. "Org Admin" / "App Admin" / "User". */
  role: string;
  /** App names the invitee will get access to (FRD §4 — listed in body). */
  appNames: string[];
  /** Single-use invitation token. */
  token: string;
  /** Drives template branch: SSO vs Native (FRD §3.3 / §3.4). */
  inviteMethod: InviteMethod;
  /** For SSO invites — drives the dynamic CTA per FR-SA-005. */
  ssoProvider?: SsoProvider | null;
  /** When true, subject + heading say "Reminder" instead of first-time wording. */
  isReminder?: boolean;
}

/**
 * FRD §4 — sends either the SSO Invitation Email or the Native Email
 * Invitation Email depending on `inviteMethod`. Template is rendered by the
 * shared renderer so apps/quikit and apps/admin produce identical content.
 *
 * FRD §7 — wraps the actual send in `sendWithRetry` (3 attempts, linear
 * back-off). The result includes `attempts` so callers can audit-log a
 * partial-success case ("delivered on retry 2") if they want to.
 */
export async function sendInvitationEmail(params: InvitationEmailParams) {
  const renderParams: RenderInvitationParams = {
    ...params,
    appBaseUrl: appUrl(),
  };
  const { subject, html } = renderInvitationEmail(renderParams);

  return sendWithRetry(
    async () => {
      try {
        const { data, error } = await getResend().emails.send({
          from: `${params.orgName} via Quikit <onboarding@resend.dev>`,
          to: params.to,
          subject,
          html,
        });
        if (error) {
          return { success: false, error };
        }
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err };
      }
    },
    { label: `invitation-email[${params.to}]`, attempts: 3 }
  );
}
