'use client'

import { useState, useEffect, useRef } from 'react'
import { useHelpdesk } from '@/components/layout/HelpdeskProvider'
import { StatusBadge, PriorityBadge, SLAPill, SLABar, AppChip } from '@/components/ui/badges'
import { Avatar } from '@/components/ui/avatar'
import { formatDateTime, timeAgo, formatFileSize } from '@/lib/utils'
import { MatIcon } from '@/lib/icons'
import type { Ticket, Message, Attachment, StatusHistoryEntry, TicketStatus, TicketPriority, User } from '@/types'
import { STATUS_TRANSITIONS, STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from '@/types'

export function TicketDetail({ ticketId }: { ticketId: string }) {
  const { currentUser, navigate, refreshTickets, showToast, tenant, theme } = useHelpdesk()
  const accent = theme.accent || tenant?.accent || '#10B981'
  const isAgent = ['HELPDESK_ADMIN', 'CATEGORY_LEAD', 'AGENT'].includes(currentUser?.role || '')

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [history, setHistory] = useState<StatusHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [sending, setSending] = useState(false)
  const [tab, setTab] = useState<'thread' | 'history'>('thread')
  const [statusOpen, setStatusOpen] = useState(false)
  const [agentUsers, setAgentUsers] = useState<User[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadTicket() }, [ticketId])
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => {
      if (d.success) setAgentUsers(d.data.filter((u: User) => ['HELPDESK_ADMIN', 'CATEGORY_LEAD', 'AGENT'].includes(u.role)))
    }).catch(() => {})
  }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadTicket() {
    setLoading(true)
    try {
      const [ticketRes, msgRes, attRes] = await Promise.all([
        fetch(`/api/tickets/${ticketId}`),
        fetch(`/api/tickets/${ticketId}/messages`),
        fetch(`/api/tickets/${ticketId}/attachments`),
      ])
      const [ticketData, msgData, attData] = await Promise.all([ticketRes.json(), msgRes.json(), attRes.json()])
      if (ticketData.success) { setTicket(ticketData.data); setHistory(ticketData.data.status_history || []) }
      if (msgData.success) setMessages(msgData.data)
      if (attData.success) setAttachments(attData.data)
    } catch { showToast('Failed to load ticket', 'error') }
    setLoading(false)
  }

  async function sendReply() {
    if (!reply.trim()) return
    setSending(true)
    try {
      const messageType = isInternal ? 'internal_note' : isAgent ? 'agent_reply' : 'customer_reply'
      const res = await fetch(`/api/tickets/${ticketId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply, is_internal: isInternal, message_type: messageType }),
      })
      const data = await res.json()
      if (data.success) { setMessages(prev => [...prev, data.data]); setReply(''); setIsInternal(false) }
      else showToast(data.error || 'Failed to send', 'error')
    } catch { showToast('Failed to send', 'error') }
    setSending(false)
  }

  async function updateStatus(status: TicketStatus) {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (data.success) { setTicket(data.data); await loadTicket(); refreshTickets(); showToast(`Status → ${STATUS_LABELS[status]}`) }
      else showToast(data.error || 'Failed', 'error')
    } catch { showToast('Failed', 'error') }
  }

  async function updatePriority(priority: TicketPriority) {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority }),
      })
      const data = await res.json()
      if (data.success) { setTicket(data.data); refreshTickets(); showToast('Priority updated') }
    } catch { showToast('Failed', 'error') }
  }

  async function updateAssignee(userId: string | null) {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to_id: userId }),
      })
      const data = await res.json()
      if (data.success) { setTicket(data.data); refreshTickets(); showToast('Assignee updated') }
      else showToast(data.error || 'Failed', 'error')
    } catch { showToast('Failed', 'error') }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch(`/api/tickets/${ticketId}/attachments`, { method: 'POST', body: form })
      const data = await res.json()
      if (data.success) { setAttachments(prev => [...prev, data.data]); showToast('File attached') }
      else showToast(data.error || 'Upload failed', 'error')
    } catch { showToast('Upload failed', 'error') }
    e.target.value = ''
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#94A3B8' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', borderWidth: 3, borderStyle: 'solid', borderTopColor: 'transparent', borderRightColor: accent, borderBottomColor: accent, borderLeftColor: accent }} />
      <span style={{ fontSize: 14 }}>Loading ticket…</span>
    </div>
  )
  if (!ticket) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444', fontSize: 14 }}>
      Ticket not found
    </div>
  )

  const allowedTransitions = STATUS_TRANSITIONS[ticket.status] || []
  const statusColor = STATUS_COLORS[ticket.status]

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── Main panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{ flexShrink: 0, background: theme.cardBg, borderBottom: `1px solid ${theme.cardBorder}` }}>
          {/* Breadcrumb row */}
          <div style={{ padding: '12px 24px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => navigate('tickets')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#64748B', fontSize: 13, fontWeight: 500, padding: 0,
            }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Tickets
            </button>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth={2}><path d="M9 18l6-6-6-6" /></svg>
            <code style={{ fontSize: 12, color: '#94A3B8', background: '#F1F5F9', padding: '2px 8px', borderRadius: 5 }}>{ticket.ticket_number}</code>
            {ticket.app && <AppChip app={ticket.app} />}
          </div>

          {/* Title */}
          <div style={{ padding: '0 24px 12px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: 0, lineHeight: 1.35 }}>{ticket.subject}</h2>
          </div>

          {/* Badge row */}
          <div style={{ padding: '0 24px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            {ticket.category && (
              <span style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
                <MatIcon name={ticket.category.icon} size={14} /><span>{ticket.category.name}</span>
                {ticket.subcategory && <span style={{ color: '#94A3B8' }}>› {ticket.subcategory.name}</span>}
              </span>
            )}
            <SLAPill ticket={ticket} />
            {ticket.requester && (
              <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 'auto', flexShrink: 0 }}>
                by <strong style={{ color: '#64748B', fontWeight: 600 }}>{ticket.requester.name}</strong> · {timeAgo(ticket.created_at)}
              </span>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, padding: '0 16px', borderTop: `1px solid ${theme.cardBorder}` }}>
            {(['thread', 'history'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === t ? 700 : 500,
                color: tab === t ? accent : '#64748B',
                borderBottom: tab === t ? `2px solid ${accent}` : '2px solid transparent',
                marginBottom: -1,
              }}>
                {t === 'thread' ? `Thread (${messages.length})` : 'History'}
              </button>
            ))}
          </div>
        </div>

        {/* Thread tab */}
        {tab === 'thread' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {ticket.description && (
              <div style={{
                background: theme.cardBg, borderRadius: 12, padding: '16px 20px',
                marginBottom: 20, border: `1px solid ${theme.cardBorder}`,
                borderLeft: `3px solid ${accent}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Description</div>
                <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{ticket.description}</div>
              </div>
            )}

            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} currentUserId={currentUser?.id || ''} accent={accent} theme={theme} />
            ))}

            {attachments.length > 0 && (
              <div style={{ marginTop: 20, padding: '16px 20px', background: theme.cardBg, borderRadius: 12, border: `1px solid ${theme.cardBorder}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Attachments ({attachments.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {attachments.map(att => <AttachmentChip key={att.id} att={att} theme={theme} />)}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* History tab */}
        {tab === 'history' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#CBD5E1', fontSize: 13 }}>No history yet</div>
            ) : (
              <div style={{ position: 'relative', paddingLeft: 32 }}>
                <div style={{ position: 'absolute', left: 11, top: 12, bottom: 12, width: 2, background: theme.cardBorder, borderRadius: 2 }} />
                {history.map(h => (
                  <div key={h.id} style={{ display: 'flex', gap: 16, marginBottom: 24, position: 'relative' }}>
                    <div style={{
                      position: 'absolute', left: -32, top: 2,
                      width: 22, height: 22, borderRadius: '50%',
                      background: theme.cardBg, border: `2px solid ${theme.cardBorder}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: '#94A3B8',
                    }}>→</div>
                    <div>
                      <div style={{ fontSize: 13, color: '#374151', fontWeight: 500, marginBottom: 4 }}>
                        {h.from_status ? <span style={{ color: '#94A3B8' }}>{STATUS_LABELS[h.from_status]} → </span> : ''}
                        <strong style={{ color: '#0F172A' }}>{STATUS_LABELS[h.to_status]}</strong>
                      </div>
                      {h.note && <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4, fontStyle: 'italic' }}>{h.note}</div>}
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>
                        {h.changed_by?.name} · {formatDateTime(h.changed_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reply box */}
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${theme.cardBorder}`, background: theme.cardBg, flexShrink: 0 }}>
          {isAgent && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, background: '#F1F5F9', borderRadius: 8, padding: 3, width: 'fit-content' }}>
              {['Reply', 'Internal Note'].map((label, i) => {
                const active = i === 0 ? !isInternal : isInternal
                return (
                  <button key={label} onClick={() => setIsInternal(i === 1)} style={{
                    padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600,
                    background: active ? (i === 1 ? '#FEF3C7' : '#fff') : 'transparent',
                    color: active ? (i === 1 ? '#B45309' : '#374151') : '#94A3B8',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s',
                  }}>{label}</button>
                )
              })}
            </div>
          )}
          <div style={{
            border: `1.5px solid ${isInternal ? '#FDE68A' : theme.cardBorder}`,
            borderRadius: 12, overflow: 'hidden',
            background: isInternal ? '#FFFBEB' : theme.cardBg,
            transition: 'border-color 0.2s',
          }}>
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              placeholder={isInternal ? 'Internal note — not visible to customer…' : 'Write a reply…'}
              rows={3}
              style={{
                width: '100%', padding: '12px 16px', border: 'none', outline: 'none',
                fontSize: 14, fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box',
                background: 'transparent', lineHeight: 1.7, color: '#1F2937',
              }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply() }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderTop: `1px solid ${theme.cardBorder}` }}>
              <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, color: '#94A3B8', fontSize: 12, padding: '4px 8px', borderRadius: 6, transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                Attach
                <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: '#CBD5E1' }}>⌘↵ to send</span>
                <button onClick={sendReply} disabled={!reply.trim() || sending} style={{
                  padding: '7px 18px', borderRadius: 8, border: 'none', cursor: reply.trim() && !sending ? 'pointer' : 'not-allowed',
                  background: reply.trim() && !sending ? accent : '#E2E8F0',
                  color: reply.trim() && !sending ? '#fff' : '#94A3B8',
                  fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.15s',
                }}>
                  {sending ? 'Sending…' : (
                    <>
                      Send
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <div style={{ width: 256, borderLeft: `1px solid ${theme.cardBorder}`, overflowY: 'auto', background: theme.cardBg, flexShrink: 0 }}>

        {/* Status */}
        <SideSection title="Status" theme={theme}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setStatusOpen(v => !v)}
              disabled={!isAgent || allowedTransitions.length === 0}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 8,
                cursor: isAgent && allowedTransitions.length > 0 ? 'pointer' : 'default',
                border: `1.5px solid ${statusColor.dot}40`, background: statusColor.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontFamily: 'inherit', outline: 'none', transition: 'all 0.15s',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', background: statusColor.dot, flexShrink: 0,
                  boxShadow: `0 0 0 2px ${statusColor.dot}25`,
                }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: statusColor.text }}>{STATUS_LABELS[ticket.status]}</span>
              </span>
              {isAgent && allowedTransitions.length > 0 && (
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={statusColor.text} strokeWidth={2.5} strokeLinecap="round">
                  <path d={statusOpen ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
                </svg>
              )}
            </button>

            {statusOpen && allowedTransitions.length > 0 && (
              <>
                <div onClick={() => setStatusOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                  background: theme.cardBg, borderRadius: 10, border: `1px solid ${theme.cardBorder}`,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', zIndex: 99,
                }}>
                  {allowedTransitions.map(s => {
                    const sc = STATUS_COLORS[s]
                    return (
                      <button key={s} onClick={() => { updateStatus(s); setStatusOpen(false) }} style={{
                        width: '100%', padding: '8px 12px', border: 'none', background: 'transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 12, fontWeight: 500, textAlign: 'left', fontFamily: 'inherit',
                        transition: 'background 0.1s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = sc.bg }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                        <span style={{ color: sc.text }}>{STATUS_LABELS[s]}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </SideSection>

        {/* Priority */}
        {isAgent && (
          <SideSection title="Priority" theme={theme}>
            <div style={{ display: 'flex', gap: 5 }}>
              {(['critical', 'high', 'medium', 'low'] as TicketPriority[]).map(p => {
                const pc = PRIORITY_COLORS[p]
                const active = ticket.priority === p
                return (
                  <button key={p} onClick={() => updatePriority(p)} style={{
                    flex: 1, padding: '4px 3px', borderRadius: 6,
                    border: `1.5px solid ${active ? pc.dot : theme.cardBorder}`,
                    background: active ? pc.bg : 'transparent',
                    color: active ? pc.text : '#94A3B8',
                    fontSize: 10, fontWeight: active ? 600 : 400, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                    transition: 'all 0.12s', whiteSpace: 'nowrap',
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? pc.dot : '#D1D5DB', flexShrink: 0, transition: 'background 0.12s' }} />
                    {PRIORITY_LABELS[p]}
                  </button>
                )
              })}
            </div>
          </SideSection>
        )}

        {/* SLA */}
        {ticket.sla_due_at && (
          <SideSection title="SLA" theme={theme}>
            <SLABar ticket={ticket} />
          </SideSection>
        )}

        {/* Requester */}
        <SideSection title="Requester" theme={theme}>
          {ticket.requester ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar user={ticket.requester} size={28} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>{ticket.requester.name}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>{ticket.requester.email}</div>
              </div>
            </div>
          ) : <span style={{ fontSize: 11, color: '#CBD5E1' }}>Unknown</span>}
        </SideSection>

        {/* Assignee */}
        <SideSection title="Assignee" theme={theme}>
          {isAgent ? (
            <select
              value={ticket.assignee?.id || ''}
              onChange={e => updateAssignee(e.target.value || null)}
              style={{
                width: '100%', padding: '6px 8px', borderRadius: 7,
                border: `1.5px solid ${theme.cardBorder}`, fontSize: 12, fontFamily: 'inherit',
                background: theme.cardBg, color: '#374151', cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="">— Unassigned —</option>
              {agentUsers.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          ) : ticket.assignee ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar user={ticket.assignee} size={28} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>{ticket.assignee.name}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  {ticket.assignee.title || ticket.assignee.role?.replace(/_/g, ' ').toLowerCase()}
                </div>
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: '#CBD5E1' }}>Unassigned</span>
          )}
        </SideSection>

        {/* Details */}
        <SideSection title="Details" theme={theme}>
          <DetailRow label="Created" value={formatDateTime(ticket.created_at)} />
          <DetailRow label="Updated" value={timeAgo(ticket.updated_at)} />
          {ticket.first_response_at && <DetailRow label="First Response" value={formatDateTime(ticket.first_response_at)} />}
          {ticket.resolved_at && <DetailRow label="Resolved" value={formatDateTime(ticket.resolved_at)} />}
          <DetailRow label="Source" value={ticket.source} />
          {ticket.tags?.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tags</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {ticket.tags.map(tag => (
                  <span key={tag} style={{
                    padding: '1px 7px', borderRadius: 20,
                    background: `${accent}18`, fontSize: 10, color: accent, fontWeight: 600,
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          )}
        </SideSection>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MessageBubble({ message, currentUserId, accent, theme }: {
  message: Message; currentUserId: string; accent: string; theme: any
}) {
  const isOwn = message.sender_id === currentUserId
  const isInternal = message.is_internal
  const isSystem = message.message_type === 'system' || message.message_type === 'status_update'

  if (isSystem) {
    return (
      <div style={{ textAlign: 'center', margin: '14px 0' }}>
        <span style={{ fontSize: 11, color: '#94A3B8', background: '#F1F5F9', padding: '4px 14px', borderRadius: 20 }}>
          {message.body}
        </span>
      </div>
    )
  }

  return (
    <div style={{
      marginBottom: 20, display: 'flex',
      flexDirection: isOwn ? 'row-reverse' : 'row',
      gap: 10, alignItems: 'flex-start',
    }}>
      {message.sender && <Avatar user={message.sender} size={32} />}
      <div style={{ maxWidth: '72%' }}>
        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 5, textAlign: isOwn ? 'right' : 'left', display: 'flex', gap: 6, alignItems: 'center', flexDirection: isOwn ? 'row-reverse' : 'row' }}>
          <span style={{ fontWeight: 600, color: '#64748B' }}>{message.sender?.name}</span>
          <span>·</span>
          <span>{timeAgo(message.created_at)}</span>
          {isInternal && (
            <span style={{ background: '#FEF3C7', color: '#B45309', padding: '1px 7px', borderRadius: 4, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Internal</span>
          )}
        </div>
        <div style={{
          padding: '11px 15px', borderRadius: 14, fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap',
          background: isInternal ? '#FFFBEB' : isOwn ? `${accent}18` : theme.cardBg,
          color: isInternal ? '#92400E' : '#374151',
          border: isInternal ? '1px solid #FDE68A' : `1px solid ${theme.cardBorder}`,
          borderBottomRightRadius: isOwn ? 4 : 14,
          borderBottomLeftRadius: isOwn ? 14 : 4,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {message.body}
        </div>
      </div>
    </div>
  )
}

function AttachmentChip({ att, theme }: { att: Attachment; theme: any }) {
  const icon = att.mime_type.startsWith('image/') ? '🖼' : att.mime_type === 'application/pdf' ? '📄' : '📎'
  return (
    <a href={att.file_url} target="_blank" rel="noreferrer" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 8, border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg, fontSize: 12, color: '#374151', textDecoration: 'none',
      transition: 'border-color 0.1s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#94A3B8' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = theme.cardBorder }}
    >
      <span>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{att.file_name}</span>
      <span style={{ color: '#94A3B8', flexShrink: 0 }}>{formatFileSize(att.file_size)}</span>
    </a>
  )
}

function SideSection({ title, children, theme }: { title: string; children: React.ReactNode; theme: any }) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${theme.cardBorder}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>{title}</div>
      {children}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'flex-start', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 11, color: '#374151', fontWeight: 500, textTransform: 'capitalize', textAlign: 'right' }}>{value}</span>
    </div>
  )
}
