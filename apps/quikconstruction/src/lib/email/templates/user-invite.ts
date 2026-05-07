/**
 * User invitation email template — QuikConstruction.
 *
 * Dark-themed card layout with a friendly greeting, "Exciting News"
 * banner, credentials block, and a white "Click here to login" CTA.
 * Pure inline CSS so it renders identically in Gmail, Outlook, Apple
 * Mail, and the `.eml` files written to `.data/outbox/` in dev.
 */

import { USER_TYPE_LABELS } from "./_shared";

export interface UserInviteTemplateInput {
  fullName: string;
  /** Pre-filled "Click here to login" URL (/login?email=…) */
  inviteUrl: string;
  invitedByName: string;
  userType: string;
  department?: string;
  expiresInText: string; // e.g. "3 days"
  /** Login email shown on the credentials block. */
  loginEmail?: string;
  /**
   * One-time system-generated password. Rendered in the credentials
   * block so the recipient can log in immediately. They can rotate it
   * on first login.
   */
  tempPassword?: string;
}

export function buildUserInviteEmail(input: UserInviteTemplateInput): {
  subject: string;
  html: string;
} {
  const roleLabel = USER_TYPE_LABELS[input.userType] ?? input.userType;
  const subject = `You're invited to QuikConstruction`;
  // Short handle for the greeting — strip the domain from an email or
  // fall back to the first word of the full name.
  const greetingName =
    (input.loginEmail ? input.loginEmail.split("@")[0] : "") ||
    (input.fullName ? input.fullName.split(/\s+/)[0] : "there");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width" />
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e7eb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;">
    <tr>
      <td align="center" style="padding:40px 12px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#1e293b;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.35);">

          <!-- Greeting -->
          <tr>
            <td align="center" style="padding:40px 36px 0 36px;">
              <div style="font-size:22px;font-weight:700;color:#ffffff;line-height:32px;">
                Hi, ${escapeHtml(greetingName)} <span style="font-size:24px;">👋</span>
              </div>
            </td>
          </tr>

          <!-- Exciting News header -->
          <tr>
            <td align="center" style="padding:24px 36px 8px 36px;">
              <div style="font-size:20px;font-weight:700;color:#ffffff;">
                🎉 Exciting News
              </div>
            </td>
          </tr>

          <!-- Body copy -->
          <tr>
            <td style="padding:18px 44px 6px 44px;">
              <p style="margin:0;font-size:14px;line-height:22px;color:#cbd5e1;text-align:center;">
                You've just been invited to join
                <strong style="color:#ffffff;">${escapeHtml(input.invitedByName ?? "QuikConstruction")}</strong>
                on <strong style="color:#ffffff;">QuikConstruction</strong>.
                ${
                  input.loginEmail
                    ? `The invitation was sent to your email
                       <a href="mailto:${escapeAttr(input.loginEmail)}" style="color:#60a5fa;text-decoration:underline;">${escapeHtml(input.loginEmail)}</a>.`
                    : ""
                }
              </p>
            </td>
          </tr>

          <!-- Tagline -->
          <tr>
            <td style="padding:18px 44px 0 44px;">
              <p style="margin:0;font-size:14px;line-height:22px;color:#cbd5e1;text-align:center;">
                This is where work meets simplicity. Whether it's tracking
                daily site progress, managing BOQs, or approving purchase
                orders — QuikConstruction has your back.
              </p>
            </td>
          </tr>

          <!-- Role badge -->
          <tr>
            <td align="center" style="padding:22px 44px 0 44px;">
              <span style="display:inline-block;background:#334155;color:#f1f5f9;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:6px 14px;border-radius:999px;border:1px solid #475569;">
                ${escapeHtml(roleLabel)}${input.department ? ` &middot; ${escapeHtml(input.department)}` : ""}
              </span>
            </td>
          </tr>

          ${
            input.loginEmail && input.tempPassword
              ? `<!-- Credentials block -->
                 <tr>
                   <td style="padding:26px 44px 6px 44px;">
                     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border:1px dashed #475569;border-radius:12px;">
                       <tr>
                         <td style="padding:14px 18px;font-size:11px;color:#94a3b8;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">Email</td>
                         <td style="padding:14px 18px;font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#ffffff;font-weight:600;text-align:right;">${escapeHtml(input.loginEmail)}</td>
                       </tr>
                       <tr>
                         <td style="padding:14px 18px;font-size:11px;color:#94a3b8;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border-top:1px dashed #475569;">Temporary Password</td>
                         <td style="padding:14px 18px;text-align:right;border-top:1px dashed #475569;white-space:nowrap;">
                           <span
                             data-pwd="${escapeAttr(input.tempPassword)}"
                             title="Click to copy"
                             onclick="var el=this,t=el.getAttribute('data-pwd'),lbl=el.querySelector('.qc-copy-icon');function done(ok){if(!lbl)return;var prev=lbl.innerHTML;lbl.innerHTML=ok?'&#10003;':'&#33;';setTimeout(function(){lbl.innerHTML=prev;},1500);}try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){done(true);},function(){done(false);});}else{var ta=document.createElement('textarea');ta.value=t;ta.setAttribute('readonly','');ta.style.position='absolute';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done(true);}catch(e){done(false);}document.body.removeChild(ta);}}catch(e){done(false);}"
                             style="display:inline-block;cursor:pointer;font-family:ui-monospace,Menlo,monospace;font-size:14px;color:#fbbf24;font-weight:700;padding:4px 10px;border-radius:6px;background:rgba(251,191,36,.08);"
                           >${escapeHtml(input.tempPassword)}<span class="qc-copy-icon" aria-hidden="true" style="display:inline-block;margin-left:10px;font-size:18px;line-height:1;color:#94a3b8;vertical-align:middle;font-family:'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols 2','Segoe UI',sans-serif;">&#10697;</span></span>
                         </td>
                       </tr>
                     </table>
                     <p style="margin:10px 0 0 0;font-size:11px;color:#94a3b8;text-align:center;">
                       Change this password on your first login for security.
                     </p>
                   </td>
                 </tr>`
              : ""
          }

          <!-- Ready to hop in? -->
          <tr>
            <td align="center" style="padding:30px 36px 4px 36px;">
              <div style="font-size:15px;font-weight:700;color:#ffffff;">
                Ready to hop in?
              </div>
            </td>
          </tr>

          <!-- CTA button -->
          <tr>
            <td align="center" style="padding:18px 36px 4px 36px;">
              <a href="${escapeAttr(input.inviteUrl)}"
                 style="display:inline-block;background:#ffffff;color:#2563eb;text-decoration:none;font-weight:700;font-size:14px;padding:14px 36px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,.2);">
                Click here to login
              </a>
              <p style="margin:14px 0 0 0;font-size:11px;color:#94a3b8;">
                Your credentials are valid immediately. The invite expires
                in <strong style="color:#cbd5e1;">${escapeHtml(input.expiresInText)}</strong>.
              </p>
            </td>
          </tr>

          <!-- Closing line -->
          <tr>
            <td style="padding:28px 44px 10px 44px;">
              <p style="margin:0;font-size:13px;line-height:20px;color:#cbd5e1;text-align:center;">
                We can't wait to see you inside and make your site
                operations a whole lot easier.
              </p>
            </td>
          </tr>

          <!-- Reply-to line -->
          <tr>
            <td style="padding:20px 36px 30px 36px;border-top:1px solid #334155;">
              <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
                Just reply to this email — <a href="mailto:support@quikit.ai" style="color:#60a5fa;text-decoration:underline;">support@quikit.ai</a>
              </p>
            </td>
          </tr>

        </table>

        <!-- Plaintext fallback link for mail clients that strip buttons -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;">
          <tr>
            <td style="padding:18px 12px;">
              <p style="margin:0;font-size:11px;color:#64748b;text-align:center;line-height:16px;">
                Trouble with the button? Paste this link into your browser:<br/>
                <span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#94a3b8;word-break:break-all;">${escapeHtml(input.inviteUrl)}</span>
              </p>
              <p style="margin:14px 0 0 0;font-size:10px;color:#475569;text-align:center;">
                If you weren't expecting this email, please contact your
                administrator and ignore the credentials above.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

// ─── Escaping helpers (prevent HTML injection from names / roles) ─

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/\s/g, "%20");
}
