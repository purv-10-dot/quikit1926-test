import nodemailer from 'nodemailer'
import { enqueueJob, EMAIL_QUEUE } from './redis'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export interface EmailPayload {
  to: string | string[]
  subject: string
  template: EmailTemplate
  data: Record<string, unknown>
}

export type EmailTemplate =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'status_changed'
  | 'new_message'
  | 'sla_at_risk'
  | 'sla_breached'
  | 'ticket_resolved'

// Queue email for async processing
export async function queueEmail(payload: EmailPayload) {
  await enqueueJob(EMAIL_QUEUE, payload as unknown as Record<string, unknown>)
}

/**
 * Send a pre-rendered HTML email (no helpdesk template). Used by the org
 * user-invite flow, which renders the canonical onboarding email via
 * `@quikit/shared` renderInvitationEmail(). Mirrors quiktrack's sendEmail().
 */
export async function sendHtmlEmail(payload: { to: string | string[]; subject: string; html: string }) {
  const from = process.env.SMTP_FROM || 'QuikSupport <support@quikit.ai>'
  await transporter.sendMail({
    from,
    to: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
    subject: payload.subject,
    html: payload.html,
  })
}

// Send email directly (used by worker)
export async function sendEmail(payload: EmailPayload) {
  const html = renderTemplate(payload.template, payload.data)
  const from = process.env.SMTP_FROM || 'Helpdesk <helpdesk@yourorg.com>'

  await transporter.sendMail({
    from,
    to: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
    subject: payload.subject,
    html,
  })
}

function renderTemplate(template: EmailTemplate, data: Record<string, unknown>): string {
  const baseStyle = `
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #F8FAFC;
    margin: 0;
    padding: 0;
  `
  const accent = (data.accent as string) || '#10B981'

  const header = `
    <div style="background: linear-gradient(135deg, #0F172A, #1E293B); padding: 32px 40px; text-align: center;">
      <div style="display: inline-flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        <div style="width: 40px; height: 40px; background: ${accent}; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; color: #fff; line-height: 40px; text-align: center;">H</div>
        <span style="font-size: 22px; font-weight: 700; color: #fff; letter-spacing: -0.5px;">Helpdesk</span>
      </div>
      <div style="font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 4px;">${data.tenantName || 'Your Organization'}</div>
    </div>
  `

  const footer = `
    <div style="background: #F1F5F9; padding: 24px 40px; text-align: center; border-top: 1px solid #E2E8F0;">
      <p style="font-size: 12px; color: #94A3B8; margin: 0 0 8px 0;">
        You received this email because you're involved in this support ticket.
      </p>
      <p style="font-size: 12px; color: #94A3B8; margin: 0;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/helpdesk" style="color: ${accent}; text-decoration: none;">View in Helpdesk Portal</a>
      </p>
    </div>
  `

  const templates: Record<EmailTemplate, string> = {
    ticket_created: `
      <body style="${baseStyle}">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <tr><td>${header}</td></tr>
          <tr><td style="padding: 40px;">
            <h1 style="font-size: 22px; font-weight: 700; color: #0F172A; margin: 0 0 8px 0;">New Ticket Created</h1>
            <p style="font-size: 14px; color: #64748B; margin: 0 0 28px 0;">A new support ticket has been submitted and assigned to you.</p>

            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span style="font-size: 11px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em;">Ticket Number</span>
                <span style="font-size: 13px; font-weight: 700; color: #6366F1; font-family: monospace;">${data.ticketNumber}</span>
              </div>
              <div style="margin-bottom: 16px;">
                <h2 style="font-size: 16px; font-weight: 700; color: #0F172A; margin: 0 0 8px 0;">${data.subject}</h2>
                <p style="font-size: 13px; color: #64748B; margin: 0; line-height: 1.6;">${data.description || ''}</p>
              </div>
              <table width="100%" cellpadding="6" cellspacing="0">
                <tr>
                  <td style="font-size: 12px; color: #94A3B8; width: 100px;">App</td>
                  <td style="font-size: 12px; font-weight: 600; color: #374151;">${data.appName}</td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #94A3B8;">Priority</td>
                  <td><span style="font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: ${getPriorityBg(data.priority as string)}; color: ${getPriorityColor(data.priority as string)};">${String(data.priority || '').toUpperCase()}</span></td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #94A3B8;">Category</td>
                  <td style="font-size: 12px; font-weight: 600; color: #374151;">${data.categoryName || '—'}</td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #94A3B8;">Requester</td>
                  <td style="font-size: 12px; font-weight: 600; color: #374151;">${data.requesterName}</td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #94A3B8;">SLA Target</td>
                  <td style="font-size: 12px; font-weight: 600; color: #374151;">Resolve within ${data.resolveHrs}h</td>
                </tr>
              </table>
            </div>

            <a href="${process.env.NEXT_PUBLIC_APP_URL}/helpdesk/tickets/${data.ticketId}"
               style="display: inline-block; background: ${accent}; color: #fff; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; letter-spacing: -0.2px;">
              View Ticket →
            </a>
          </td></tr>
          <tr><td>${footer}</td></tr>
        </table>
      </body>
    `,

    ticket_assigned: `
      <body style="${baseStyle}">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <tr><td>${header}</td></tr>
          <tr><td style="padding: 40px;">
            <h1 style="font-size: 22px; font-weight: 700; color: #0F172A; margin: 0 0 8px 0;">Ticket Assigned to You</h1>
            <p style="font-size: 14px; color: #64748B; margin: 0 0 28px 0;">A ticket has been assigned to you for resolution.</p>

            <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
              <p style="font-size: 13px; color: #1E40AF; margin: 0; font-weight: 600;">
                🎯 You are now responsible for resolving: <strong>${data.ticketNumber}</strong>
              </p>
            </div>

            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
              <h2 style="font-size: 16px; font-weight: 700; color: #0F172A; margin: 0 0 12px 0;">${data.subject}</h2>
              <table width="100%" cellpadding="6" cellspacing="0">
                <tr>
                  <td style="font-size: 12px; color: #94A3B8; width: 100px;">Priority</td>
                  <td><span style="font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: ${getPriorityBg(data.priority as string)}; color: ${getPriorityColor(data.priority as string)};">${String(data.priority || '').toUpperCase()}</span></td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #94A3B8;">SLA Due</td>
                  <td style="font-size: 12px; font-weight: 600; color: #EF4444;">${data.slaDue}</td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #94A3B8;">Assigned By</td>
                  <td style="font-size: 12px; font-weight: 600; color: #374151;">${data.assignedBy}</td>
                </tr>
              </table>
            </div>

            <a href="${process.env.NEXT_PUBLIC_APP_URL}/helpdesk/tickets/${data.ticketId}"
               style="display: inline-block; background: ${accent}; color: #fff; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
              Open Ticket →
            </a>
          </td></tr>
          <tr><td>${footer}</td></tr>
        </table>
      </body>
    `,

    status_changed: `
      <body style="${baseStyle}">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <tr><td>${header}</td></tr>
          <tr><td style="padding: 40px;">
            <h1 style="font-size: 22px; font-weight: 700; color: #0F172A; margin: 0 0 8px 0;">Ticket Status Updated</h1>
            <p style="font-size: 14px; color: #64748B; margin: 0 0 28px 0;">The status of your ticket has been updated.</p>

            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
              <div style="text-align: center; margin-bottom: 20px;">
                <span style="font-size: 13px; color: #94A3B8;">Status changed</span><br/>
                <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px;">
                  <span style="font-size: 13px; font-weight: 700; padding: 6px 14px; border-radius: 20px; background: #F1F5F9; color: #64748B;">${data.fromStatus}</span>
                  <span style="font-size: 18px; color: #94A3B8;">→</span>
                  <span style="font-size: 13px; font-weight: 700; padding: 6px 14px; border-radius: 20px; background: ${getStatusBg(data.toStatus as string)}; color: ${getStatusColor(data.toStatus as string)};">${data.toStatus}</span>
                </div>
              </div>
              <h2 style="font-size: 15px; font-weight: 700; color: #0F172A; margin: 0 0 8px 0;">${data.ticketNumber} — ${data.subject}</h2>
              ${data.note ? `<div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 12px; font-size: 13px; color: #92400E; margin-top: 12px;">${data.note}</div>` : ''}
              <div style="margin-top: 12px; font-size: 12px; color: #94A3B8;">Updated by: <strong style="color: #374151;">${data.changedBy}</strong></div>
            </div>

            <a href="${process.env.NEXT_PUBLIC_APP_URL}/helpdesk/tickets/${data.ticketId}"
               style="display: inline-block; background: ${accent}; color: #fff; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
              View Ticket →
            </a>
          </td></tr>
          <tr><td>${footer}</td></tr>
        </table>
      </body>
    `,

    new_message: `
      <body style="${baseStyle}">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <tr><td>${header}</td></tr>
          <tr><td style="padding: 40px;">
            <h1 style="font-size: 22px; font-weight: 700; color: #0F172A; margin: 0 0 8px 0;">New Reply on Your Ticket</h1>
            <p style="font-size: 14px; color: #64748B; margin: 0 0 28px 0;">${data.senderName} replied to <strong>${data.ticketNumber}</strong></p>

            <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: ${accent}; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px; font-weight: 700; flex-shrink: 0;">${String(data.senderName || '').charAt(0)}</div>
                <div>
                  <div style="font-size: 13px; font-weight: 700; color: #0F172A;">${data.senderName}</div>
                  <div style="font-size: 11px; color: #94A3B8;">${data.sentAt}</div>
                </div>
              </div>
              <div style="font-size: 14px; color: #374151; line-height: 1.7; white-space: pre-wrap;">${data.messageBody}</div>
            </div>

            <a href="${process.env.NEXT_PUBLIC_APP_URL}/helpdesk/tickets/${data.ticketId}"
               style="display: inline-block; background: ${accent}; color: #fff; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
              Reply Now →
            </a>
          </td></tr>
          <tr><td>${footer}</td></tr>
        </table>
      </body>
    `,

    sla_at_risk: `
      <body style="${baseStyle}">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <tr><td>${header}</td></tr>
          <tr><td style="padding: 40px;">
            <div style="text-align: center; margin-bottom: 28px;">
              <div style="font-size: 48px; margin-bottom: 12px;">⏱️</div>
              <h1 style="font-size: 22px; font-weight: 700; color: #B45309; margin: 0 0 8px 0;">SLA At Risk</h1>
              <p style="font-size: 14px; color: #64748B; margin: 0;">Ticket ${data.ticketNumber} is approaching its SLA deadline.</p>
            </div>

            <div style="background: #FFFBEB; border: 2px solid #FDE68A; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
              <h2 style="font-size: 15px; font-weight: 700; color: #92400E; margin: 0 0 8px 0;">${data.subject}</h2>
              <p style="font-size: 13px; color: #B45309; margin: 0 0 16px 0;">⏰ <strong>${data.timeRemaining}</strong> remaining before SLA breach</p>
              <div style="background: #FEF3C7; border-radius: 8px; height: 8px; overflow: hidden;">
                <div style="background: linear-gradient(90deg, #F59E0B, #EF4444); width: 85%; height: 100%; border-radius: 8px;"></div>
              </div>
              <div style="margin-top: 12px; font-size: 12px; color: #94A3B8;">Assigned to: <strong style="color: #374151;">${data.assigneeName || 'Unassigned'}</strong></div>
            </div>

            <a href="${process.env.NEXT_PUBLIC_APP_URL}/helpdesk/tickets/${data.ticketId}"
               style="display: inline-block; background: #F59E0B; color: #fff; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
              Resolve Now →
            </a>
          </td></tr>
          <tr><td>${footer}</td></tr>
        </table>
      </body>
    `,

    sla_breached: `
      <body style="${baseStyle}">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <tr><td style="background: linear-gradient(135deg, #7F1D1D, #EF4444); padding: 32px 40px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 12px;">🚨</div>
            <h1 style="font-size: 22px; font-weight: 700; color: #fff; margin: 0 0 8px 0;">SLA BREACHED</h1>
            <p style="font-size: 14px; color: rgba(255,255,255,0.85); margin: 0;">Immediate action required on ${data.ticketNumber}</p>
          </td></tr>
          <tr><td style="padding: 40px;">
            <div style="background: #FEF2F2; border: 2px solid #FECACA; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
              <h2 style="font-size: 15px; font-weight: 700; color: #DC2626; margin: 0 0 8px 0;">${data.subject}</h2>
              <p style="font-size: 13px; color: #991B1B; margin: 0 0 12px 0;">⚠️ SLA breached <strong>${data.overdueBy}</strong> ago — customer is waiting!</p>
              <table width="100%" cellpadding="6" cellspacing="0">
                <tr>
                  <td style="font-size: 12px; color: #94A3B8; width: 100px;">Priority</td>
                  <td><span style="font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: #FEF2F2; color: #DC2626;">${String(data.priority || '').toUpperCase()}</span></td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #94A3B8;">App</td>
                  <td style="font-size: 12px; font-weight: 600; color: #374151;">${data.appName}</td>
                </tr>
                <tr>
                  <td style="font-size: 12px; color: #94A3B8;">Assigned to</td>
                  <td style="font-size: 12px; font-weight: 600; color: #374151;">${data.assigneeName || 'Unassigned'}</td>
                </tr>
              </table>
            </div>

            <a href="${process.env.NEXT_PUBLIC_APP_URL}/helpdesk/tickets/${data.ticketId}"
               style="display: inline-block; background: #EF4444; color: #fff; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
              🚨 Resolve Immediately →
            </a>
          </td></tr>
          <tr><td>${footer}</td></tr>
        </table>
      </body>
    `,

    ticket_resolved: `
      <body style="${baseStyle}">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <tr><td>${header}</td></tr>
          <tr><td style="padding: 40px;">
            <div style="text-align: center; margin-bottom: 28px;">
              <div style="width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, #22C55E, #16A34A); display: inline-flex; align-items: center; justify-content: center; font-size: 36px; margin-bottom: 16px;">✓</div>
              <h1 style="font-size: 22px; font-weight: 700; color: #0F172A; margin: 0 0 8px 0;">Ticket Resolved!</h1>
              <p style="font-size: 14px; color: #64748B; margin: 0;">Your support request has been resolved.</p>
            </div>

            <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
              <h2 style="font-size: 15px; font-weight: 700; color: #166534; margin: 0 0 8px 0;">${data.ticketNumber} — ${data.subject}</h2>
              <p style="font-size: 13px; color: #15803D; margin: 0 0 12px 0;">Resolved by <strong>${data.resolvedBy}</strong> in ${data.resolutionTime}</p>
              ${data.resolutionNote ? `<div style="background: #fff; border-radius: 8px; padding: 12px; font-size: 13px; color: #374151; line-height: 1.6;">${data.resolutionNote}</div>` : ''}
            </div>

            <p style="font-size: 13px; color: #64748B; margin: 0 0 20px 0;">
              If you're satisfied, no action is needed. If the issue persists, you can reopen the ticket.
            </p>

            <a href="${process.env.NEXT_PUBLIC_APP_URL}/helpdesk/tickets/${data.ticketId}"
               style="display: inline-block; background: ${accent}; color: #fff; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
              View Resolution →
            </a>
          </td></tr>
          <tr><td>${footer}</td></tr>
        </table>
      </body>
    `,
  }

  return templates[template] || `<body><p>Email template not found</p></body>`
}

function getPriorityBg(priority: string): string {
  const map: Record<string, string> = {
    critical: '#FEF2F2', high: '#FFF7ED', medium: '#FFFBEB', low: '#F0FDF4',
  }
  return map[priority] || '#F1F5F9'
}

function getPriorityColor(priority: string): string {
  const map: Record<string, string> = {
    critical: '#DC2626', high: '#C2410C', medium: '#B45309', low: '#15803D',
  }
  return map[priority] || '#64748B'
}

function getStatusBg(status: string): string {
  const map: Record<string, string> = {
    open: '#EEF2FF', in_progress: '#EFF6FF', waiting_customer: '#FFFBEB',
    resolved: '#F0FDF4', closed: '#F1F5F9',
  }
  return map[status] || '#F1F5F9'
}

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    open: '#4F46E5', in_progress: '#2563EB', waiting_customer: '#B45309',
    resolved: '#15803D', closed: '#475569',
  }
  return map[status] || '#64748B'
}
