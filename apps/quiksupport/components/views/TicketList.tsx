'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useHelpdesk } from '@/components/layout/HelpdeskProvider'
import { StatusBadge, PriorityBadge, SLAPill, AppChip } from '@/components/ui/badges'
import { Avatar } from '@/components/ui/avatar'
import { timeAgo, slaStatus } from '@/lib/utils'
import { MatIcon } from '@/lib/icons'
import type { Ticket, TicketStatus, TicketPriority } from '@/types'

// ─── Column system ────────────────────────────────────────────────────────────
interface ColDef {
  id: string
  label: string
  width: number
  minWidth: number
  visible: boolean
  sortable: boolean
  frozen: boolean
}

const INIT_COLS: ColDef[] = [
  { id: 'number',   label: 'Ticket #',  width: 96,  minWidth: 70,  visible: true,  sortable: false, frozen: true },
  { id: 'subject',  label: 'Subject',   width: 300, minWidth: 140, visible: true,  sortable: true,  frozen: true },
  { id: 'status',   label: 'Status',    width: 140, minWidth: 100, visible: true,  sortable: true,  frozen: false },
  { id: 'priority', label: 'Priority',  width: 110, minWidth: 90,  visible: true,  sortable: true,  frozen: false },
  { id: 'app',      label: 'App',       width: 130, minWidth: 80,  visible: true,  sortable: false, frozen: false },
  { id: 'category', label: 'Category',  width: 150, minWidth: 100, visible: false, sortable: false, frozen: false },
  { id: 'assignee', label: 'Assignee',  width: 160, minWidth: 110, visible: true,  sortable: false, frozen: false },
  { id: 'sla',      label: 'SLA',       width: 140, minWidth: 90,  visible: true,  sortable: true,  frozen: false },
  { id: 'created',  label: 'Created',   width: 110, minWidth: 80,  visible: true,  sortable: true,  frozen: false },
]

const STATUS_META: Record<TicketStatus, { label: string; color: string; bg: string }> = {
  open:             { label: 'Open',        color: '#2563EB', bg: '#EFF6FF' },
  in_progress:      { label: 'In Progress', color: '#7C3AED', bg: '#F5F3FF' },
  waiting_customer: { label: 'Waiting',     color: '#D97706', bg: '#FFFBEB' },
  resolved:         { label: 'Resolved',    color: '#059669', bg: '#F0FDF4' },
  closed:           { label: 'Closed',      color: '#6B7280', bg: '#F3F4F6' },
}

// ─── Cell renderer ────────────────────────────────────────────────────────────
function Cell({ colId, ticket }: { colId: string; ticket: Ticket }) {
  const sla = slaStatus(ticket)
  switch (colId) {
    case 'number':
      return (
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94A3B8', fontWeight: 700, letterSpacing: '0.03em' }}>
          {ticket.ticket_number}
        </span>
      )
    case 'subject':
      return (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
            {ticket.subject}
          </div>
          {ticket.requester && (
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ticket.requester.name}
            </div>
          )}
        </div>
      )
    case 'status':
      return <StatusBadge status={ticket.status} />
    case 'priority':
      return <PriorityBadge priority={ticket.priority} />
    case 'app':
      return ticket.app ? <AppChip app={ticket.app} small /> : <Dash />
    case 'category':
      return ticket.category
        ? <span style={{ fontSize: 12, color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: 4 }}><MatIcon name={ticket.category.icon} size={13} />{ticket.category.name}</span>
        : <Dash />
    case 'assignee':
      return ticket.assignee ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Avatar user={ticket.assignee} size={24} />
          <span style={{ fontSize: 12, color: '#374151', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ticket.assignee.name.split(' ')[0]}
          </span>
        </div>
      ) : <span style={{ fontSize: 12, color: '#CBD5E1', fontStyle: 'italic' }}>Unassigned</span>
    case 'sla':
      return sla.state !== 'none' ? <SLAPill ticket={ticket} size="sm" /> : <Dash />
    case 'created':
      return <span style={{ fontSize: 12, color: '#94A3B8' }}>{timeAgo(ticket.created_at)}</span>
    default:
      return null
  }
}

function Dash() {
  return <span style={{ color: '#CBD5E1', fontSize: 13 }}>—</span>
}

// ─── Sort icon ────────────────────────────────────────────────────────────────
function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
      stroke={active ? '#6366F1' : 'rgba(0,0,0,0.2)'} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, transition: 'transform 0.15s', transform: active && dir === 'desc' ? 'rotate(180deg)' : 'none' }}
    >
      <polyline points="6 9 12 3 18 9"/><line x1="12" y1="3" x2="12" y2="21"/>
    </svg>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export function TicketList() {
  const { tickets, apps, categories, currentUser, navigate, tenant, theme } = useHelpdesk()
  const accent = theme.accent || tenant?.accent || '#6366F1'
  const isCustomer = currentUser?.role === 'CUSTOMER'

  // Filter state
  const [search, setSearch]               = useState('')
  const [statusFilter, setStatusFilter]   = useState<TicketStatus | ''>('')
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | ''>('')
  const [appFilter, setAppFilter]         = useState('')
  const [slaFilter, setSlaFilter]         = useState<'' | 'at_risk' | 'breached'>('')

  // Grid state
  const [cols, setCols]           = useState<ColDef[]>(INIT_COLS)
  const [sortCol, setSortCol]     = useState('created_at')
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc')
  const [colsOpen, setColsOpen]   = useState(false)
  const [resizing, setResizing]   = useState<{ id: string; startX: number; startW: number } | null>(null)
  const [dragCol, setDragCol]     = useState<string | null>(null)
  const [dragOver, setDragOver]   = useState<string | null>(null)

  // Column resize handlers
  useEffect(() => {
    if (!resizing) return
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX
      setCols(prev => prev.map(c => c.id === resizing.id ? { ...c, width: Math.max(c.minWidth, resizing.startW + delta) } : c))
    }
    const onUp = () => setResizing(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [resizing])

  // Compute sticky left offsets for frozen columns
  const colsWithOffset = useMemo(() => {
    let left = 0
    return cols.map(col => {
      const offset = col.frozen && col.visible ? left : undefined
      if (col.frozen && col.visible) left += col.width
      return { ...col, stickyLeft: offset }
    })
  }, [cols])

  const visibleCols = colsWithOffset.filter(c => c.visible)

  function toggleSort(id: string) {
    if (sortCol === id) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(id); setSortDir('asc') }
  }

  function toggleCol(id: string) {
    setCols(prev => prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c))
  }

  // Column drag-to-reorder
  function onDragStart(id: string) { setDragCol(id) }
  function onDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setDragOver(id) }
  function onDrop(targetId: string) {
    if (!dragCol || dragCol === targetId) { setDragCol(null); setDragOver(null); return }
    setCols(prev => {
      const arr = [...prev]
      const from = arr.findIndex(c => c.id === dragCol)
      const to   = arr.findIndex(c => c.id === targetId)
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return arr
    })
    setDragCol(null); setDragOver(null)
  }

  // Filtering + sorting
  const filtered = useMemo(() => {
    let list = isCustomer ? tickets.filter(t => t.requester_id === currentUser?.id) : tickets
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(t => t.subject.toLowerCase().includes(q) || t.ticket_number.toLowerCase().includes(q) || t.requester?.name?.toLowerCase().includes(q))
    }
    if (statusFilter)   list = list.filter(t => t.status === statusFilter)
    if (priorityFilter) list = list.filter(t => t.priority === priorityFilter)
    if (appFilter)      list = list.filter(t => t.app_id === appFilter)
    if (slaFilter)      list = list.filter(t => slaStatus(t).state === slaFilter)

    const dir = sortDir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      switch (sortCol) {
        case 'subject':  return dir * a.subject.localeCompare(b.subject)
        case 'status':   return dir * a.status.localeCompare(b.status)
        case 'priority': { const p = { critical:0, high:1, medium:2, low:3 }; return dir * ((p[a.priority]??2)-(p[b.priority]??2)) }
        case 'sla': {
          const da = a.sla_due_at ? new Date(a.sla_due_at).getTime() : Infinity
          const db = b.sla_due_at ? new Date(b.sla_due_at).getTime() : Infinity
          return dir * (da - db)
        }
        default: return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      }
    })
  }, [tickets, search, statusFilter, priorityFilter, appFilter, slaFilter, sortCol, sortDir, isCustomer, currentUser])

  const counts = useMemo(() => {
    const base = isCustomer ? tickets.filter(t => t.requester_id === currentUser?.id) : tickets
    return {
      all: base.length,
      open: base.filter(t => t.status === 'open').length,
      in_progress: base.filter(t => t.status === 'in_progress').length,
      waiting_customer: base.filter(t => t.status === 'waiting_customer').length,
      resolved: base.filter(t => ['resolved','closed'].includes(t.status)).length,
    }
  }, [tickets, isCustomer, currentUser])

  const hasFilters = search || priorityFilter || appFilter || slaFilter

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'inherit' }}>

      {/* ── Page header ── */}
      <div style={{
        padding: '20px 28px 0',
        background: theme.cardBg,
        borderBottom: `1px solid ${theme.cardBorder}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.3px' }}>
              {isCustomer ? 'My Tickets' : 'Tickets'}
            </h1>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0', fontWeight: 500 }}>
              {filtered.length} of {counts.all} tickets
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setPriorityFilter(''); setAppFilter(''); setSlaFilter('') }}
                style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: 'transparent', color: '#64748B', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Clear filters
              </button>
            )}
            <button
              onClick={() => navigate('create-ticket')}
              style={{
                padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: accent, color: '#fff', fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: `0 2px 10px ${accent}40`,
              }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Ticket
            </button>
          </div>
        </div>

        {/* Status tabs */}
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
          {([
            { key: '', label: 'All', count: counts.all },
            { key: 'open', label: 'Open', count: counts.open },
            { key: 'in_progress', label: 'In Progress', count: counts.in_progress },
            { key: 'waiting_customer', label: 'Waiting', count: counts.waiting_customer },
            { key: 'resolved', label: 'Done', count: counts.resolved },
          ] as const).map(tab => {
            const active = statusFilter === tab.key
            return (
              <button key={tab.key} onClick={() => setStatusFilter(tab.key as TicketStatus | '')}
                style={{
                  padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? accent : '#64748B',
                  borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
                  marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
                  whiteSpace: 'nowrap', transition: 'color 0.12s',
                }}>
                {tab.label}
                <span style={{
                  minWidth: 18, padding: '1px 5px', borderRadius: 20, fontSize: 10.5, fontWeight: 700, textAlign: 'center',
                  background: active ? `${accent}18` : theme.cardBorder,
                  color: active ? accent : '#94A3B8',
                }}>
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{
        padding: '10px 28px',
        background: theme.cardBg,
        borderBottom: `1px solid ${theme.cardBorder}`,
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tickets…"
            style={{
              width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
              border: `1px solid ${theme.cardBorder}`, fontSize: 13, fontFamily: 'inherit',
              outline: 'none', color: '#0F172A', background: theme.mainBg,
            }}
          />
        </div>

        {/* Priority filter */}
        <ToolbarSelect
          value={priorityFilter}
          onChange={v => setPriorityFilter(v as TicketPriority | '')}
          theme={theme}
          placeholder="Priority"
        >
          <option value="">All Priorities</option>
          {(['critical','high','medium','low'] as TicketPriority[]).map(p => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </ToolbarSelect>

        {/* App filter */}
        {apps.length > 1 && (
          <ToolbarSelect value={appFilter} onChange={v => setAppFilter(v)} theme={theme} placeholder="App">
            <option value="">All Apps</option>
            {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </ToolbarSelect>
        )}

        {/* SLA filter */}
        <ToolbarSelect value={slaFilter} onChange={v => setSlaFilter(v as '' | 'at_risk' | 'breached')} theme={theme} placeholder="SLA">
          <option value="">All SLA</option>
          <option value="at_risk">At Risk</option>
          <option value="breached">Breached</option>
        </ToolbarSelect>

        <div style={{ flex: 1 }} />

        {/* Columns toggle */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setColsOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 8,
              border: `1px solid ${colsOpen ? accent : theme.cardBorder}`,
              background: colsOpen ? `${accent}10` : 'transparent',
              color: colsOpen ? accent : '#64748B', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.13s',
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" height="18"/>
            </svg>
            Columns
          </button>

          {colsOpen && (
            <>
              <div onClick={() => setColsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 99,
                background: '#fff', borderRadius: 12,
                border: `1px solid ${theme.cardBorder}`,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                minWidth: 200, padding: '8px 0',
              }}>
                <div style={{ padding: '6px 14px 8px', fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Toggle Columns
                </div>
                {cols.map(col => (
                  <label key={col.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 14px', cursor: 'pointer',
                    opacity: col.frozen ? 0.5 : 1,
                  }}>
                    <input type="checkbox" checked={col.visible} disabled={col.frozen}
                      onChange={() => !col.frozen && toggleCol(col.id)}
                      style={{ accentColor: accent, width: 14, height: 14 }}
                    />
                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{col.label}</span>
                    {col.frozen && <span style={{ fontSize: 10, color: '#94A3B8', marginLeft: 'auto' }}>frozen</span>}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Data grid ── */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: '#94A3B8' }}>
            <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 9a1 1 0 011-1h18a1 1 0 011 1v2a2 2 0 000 4v2a1 1 0 01-1 1H3a1 1 0 01-1-1v-2a2 2 0 000-4V9z"/>
              <line x1="9" y1="8" x2="9" y2="16" strokeDasharray="2 2"/>
            </svg>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#64748B' }}>No tickets found</div>
            <div style={{ fontSize: 13 }}>
              {hasFilters || statusFilter ? 'Try adjusting your filters' : 'Create your first ticket to get started'}
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
            {/* Colgroup for widths */}
            <colgroup>
              {visibleCols.map(c => <col key={c.id} style={{ width: c.width }} />)}
            </colgroup>

            {/* Sticky header */}
            <thead>
              <tr>
                {visibleCols.map(col => {
                  const isSorted = sortCol === col.id
                  const isOver = dragOver === col.id
                  return (
                    <th
                      key={col.id}
                      draggable
                      onDragStart={() => onDragStart(col.id)}
                      onDragOver={e => onDragOver(e, col.id)}
                      onDrop={() => onDrop(col.id)}
                      onDragEnd={() => { setDragCol(null); setDragOver(null) }}
                      style={{
                        position: col.frozen ? 'sticky' : 'sticky',
                        top: 0,
                        left: col.frozen ? col.stickyLeft : undefined,
                        zIndex: col.frozen ? 30 : 20,
                        background: isOver ? `${accent}08` : theme.cardBg,
                        borderBottom: `2px solid ${theme.cardBorder}`,
                        borderRight: col.frozen && col.stickyLeft !== undefined ? `1px solid ${theme.cardBorder}` : undefined,
                        padding: '0',
                        userSelect: 'none',
                        transition: 'background 0.1s',
                        cursor: 'grab',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', position: 'relative', height: 40 }}>
                        {/* Sort button */}
                        {col.sortable ? (
                          <button
                            onClick={() => toggleSort(col.id)}
                            style={{
                              flex: 1, display: 'flex', alignItems: 'center', gap: 5,
                              padding: '0 8px 0 12px', height: '100%',
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              color: isSorted ? accent : '#94A3B8',
                              transition: 'color 0.12s',
                            }}
                          >
                            {col.label}
                            <SortIcon active={isSorted} dir={sortDir} />
                          </button>
                        ) : (
                          <span style={{
                            flex: 1, padding: '0 8px 0 12px',
                            fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: '0.06em', color: '#94A3B8',
                          }}>
                            {col.label}
                          </span>
                        )}

                        {/* Resize handle */}
                        <div
                          onMouseDown={e => {
                            e.stopPropagation()
                            e.preventDefault()
                            setResizing({ id: col.id, startX: e.clientX, startW: col.width })
                          }}
                          style={{
                            position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
                            cursor: 'col-resize', zIndex: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <div style={{ width: 1, height: 16, background: theme.cardBorder, borderRadius: 1 }} />
                        </div>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {filtered.map((ticket, i) => (
                <TableRow
                  key={ticket.id}
                  ticket={ticket}
                  cols={visibleCols}
                  cardBg={theme.cardBg}
                  cardBorder={theme.cardBorder}
                  isLast={i === filtered.length - 1}
                  onClick={() => navigate('ticket-detail', ticket.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer count ── */}
      <div style={{
        padding: '8px 28px',
        background: theme.cardBg,
        borderTop: `1px solid ${theme.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>
          {filtered.length} ticket{filtered.length !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 12, color: '#94A3B8' }}>
          Drag column headers to reorder · Drag edges to resize · Click to sort
        </span>
      </div>
    </div>
  )
}

// ─── Table row ────────────────────────────────────────────────────────────────
function TableRow({ ticket, cols, cardBg, cardBorder, isLast, onClick }: {
  ticket: Ticket
  cols: (ColDef & { stickyLeft?: number })[]
  cardBg: string; cardBorder: string; isLast: boolean
  onClick: () => void
}) {
  const [hov, setHov] = useState(false)

  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ cursor: 'pointer', background: hov ? `${cardBg}F0` : cardBg, transition: 'background 0.1s' }}
    >
      {cols.map(col => (
        <td
          key={col.id}
          style={{
            padding: '0 12px',
            height: 52,
            borderBottom: isLast ? 'none' : `1px solid ${cardBorder}`,
            borderRight: col.frozen && col.stickyLeft !== undefined ? `1px solid ${cardBorder}` : undefined,
            position: col.frozen ? 'sticky' : undefined,
            left: col.frozen ? col.stickyLeft : undefined,
            zIndex: col.frozen ? 10 : undefined,
            background: hov
              ? `color-mix(in srgb, ${cardBg} 96%, #6366F1 4%)`
              : cardBg,
            maxWidth: col.width,
            overflow: 'hidden',
            transition: 'background 0.1s',
          }}
        >
          <Cell colId={col.id} ticket={ticket} />
        </td>
      ))}
    </tr>
  )
}

// ─── Toolbar select ───────────────────────────────────────────────────────────
function ToolbarSelect({ value, onChange, children, theme, placeholder }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode
  theme: { cardBg: string; cardBorder: string; mainBg: string }
  placeholder?: string
}) {
  const hasValue = !!value
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '7px 10px', borderRadius: 8,
        border: `1px solid ${hasValue ? '#6366F1' : theme.cardBorder}`,
        fontSize: 12, fontFamily: 'inherit',
        background: hasValue ? '#EEF2FF' : theme.mainBg,
        color: hasValue ? '#4338CA' : '#374151',
        cursor: 'pointer', outline: 'none', fontWeight: hasValue ? 600 : 400,
      }}
    >
      {children}
    </select>
  )
}
