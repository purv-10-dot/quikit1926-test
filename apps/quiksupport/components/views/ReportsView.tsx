'use client'

import { useState, useEffect } from 'react'
import { useHelpdesk } from '@/components/layout/HelpdeskProvider'
import { Avatar } from '@/components/ui/avatar'
import { MatIcon } from '@/lib/icons'
import { PRIORITY_LABELS, PRIORITY_COLORS } from '@/types'
import type { TicketPriority } from '@/types'

type ReportTab = 'overview' | 'agents' | 'sla'

interface DashboardReport {
  summary: { total: number; open: number; in_progress: number; resolved: number; closed: number; avg_resolution_hrs: number | null; sla_breach_count: number; first_response_breach_count: number }
  byCategory: { name: string; icon: string; total: number; open: number; resolved: number }[]
  byPriority: { priority: string; count: number }[]
  agentLoad: { agent: { id: string; name: string; email: string; color: string; avatar_url?: string | null }; assigned: number; resolved: number }[]
  dailyVolume: { date: string; created: number; resolved: number }[]
}
interface AgentReport {
  agents: { agent: { id: string; name: string; email: string; color: string; avatar_url?: string | null; title?: string | null }; total: number; resolved: number; avg_resolution_hrs: number | null; open: number; in_progress: number }[]
}
interface SlaReport {
  byPriority: { priority: string; total: number; breached: number; compliance_pct: number }[]
}

export function ReportsView() {
  const { tenant, theme } = useHelpdesk()
  const accent = theme.accent || tenant?.accent || '#10B981'
  const [tab, setTab] = useState<ReportTab>('overview')
  const [loading, setLoading] = useState(false)
  const [dashData, setDashData] = useState<DashboardReport | null>(null)
  const [agentData, setAgentData] = useState<AgentReport | null>(null)
  const [slaData, setSlaData] = useState<SlaReport | null>(null)
  const [range, setRange] = useState('30')

  useEffect(() => { loadReport() }, [tab, range])

  async function loadReport() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ days: range })
      if (tab === 'overview') {
        const res = await fetch(`/api/reports?type=dashboard&${params}`)
        const d = await res.json()
        if (d.success) setDashData(d.data)
      } else if (tab === 'agents') {
        const res = await fetch(`/api/reports?type=agents&${params}`)
        const d = await res.json()
        if (d.success) setAgentData(d.data)
      } else {
        const res = await fetch(`/api/reports?type=sla&${params}`)
        const d = await res.json()
        if (d.success) setSlaData(d.data)
      }
    } catch {}
    setLoading(false)
  }

  const tabs: { id: ReportTab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: 'bar_chart' },
    { id: 'agents', label: 'Agent Performance', icon: 'people' },
    { id: 'sla', label: 'SLA Compliance', icon: 'schedule' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 28px 0', flexShrink: 0, background: theme.cardBg, borderBottom: `1px solid ${theme.cardBorder}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0F172A', margin: 0 }}>Reports & Analytics</h1>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: '4px 0 0' }}>Track performance, SLA compliance, and team productivity</p>
          </div>
          <select
            value={range} onChange={e => setRange(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${theme.cardBorder}`,
              fontSize: 12, fontFamily: 'inherit', background: theme.cardBg,
              outline: 'none', cursor: 'pointer', color: '#374151', fontWeight: 600,
            }}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 2 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? accent : '#64748B',
              borderBottom: tab === t.id ? `2px solid ${accent}` : '2px solid transparent',
              marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.15s',
            }}>
              <MatIcon name={t.icon} size={16} color={tab === t.id ? accent : '#64748B'} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: '#94A3B8', gap: 10 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', borderWidth: 3, borderStyle: 'solid', borderTopColor: 'transparent', borderRightColor: accent, borderBottomColor: accent, borderLeftColor: accent }} />
            <span style={{ fontSize: 14 }}>Loading…</span>
          </div>
        ) : tab === 'overview' && dashData ? (
          <OverviewTab data={dashData} accent={accent} theme={theme} />
        ) : tab === 'agents' && agentData ? (
          <AgentsTab data={agentData} accent={accent} theme={theme} />
        ) : tab === 'sla' && slaData ? (
          <SlaTab data={slaData} accent={accent} theme={theme} />
        ) : null}
      </div>
    </div>
  )
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ data, accent, theme }: { data: DashboardReport; accent: string; theme: any }) {
  const { summary, byCategory, byPriority, agentLoad, dailyVolume } = data

  const statCards = [
    { label: 'Total Tickets', value: summary.total, iconBg: '#EEF2FF', iconColor: '#6366F1', icon: 'confirmation_number' },
    { label: 'Open', value: summary.open, iconBg: '#EFF6FF', iconColor: '#3B82F6', icon: 'inbox' },
    { label: 'Resolved', value: summary.resolved, iconBg: '#F0FDF4', iconColor: '#22C55E', icon: 'check_circle' },
    { label: 'SLA Breaches', value: summary.sla_breach_count, iconBg: '#FEF2F2', iconColor: '#EF4444', icon: 'schedule', sub: `${summary.first_response_breach_count} first response` },
    { label: 'Avg Resolution', value: summary.avg_resolution_hrs ? `${Math.round(summary.avg_resolution_hrs)}h` : '—', iconBg: '#FFFBEB', iconColor: '#F59E0B', icon: 'bolt' },
  ]

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        {statCards.map(s => (
          <div key={s.label} style={{
            flex: '1 1 140px', background: theme.cardBg, borderRadius: 14,
            border: `1px solid ${theme.cardBorder}`, padding: '18px 20px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{s.label}</span>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: s.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MatIcon name={s.icon} size={18} color={s.iconColor} />
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px' }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 11, color: '#94A3B8' }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Category breakdown */}
        <ReportPanel title="By Category" theme={theme}>
          {byCategory.length === 0 ? (
            <EmptyState />
          ) : byCategory.map(cat => {
            const pct = cat.total > 0 ? (cat.resolved / cat.total) * 100 : 0
            return (
              <div key={cat.name} style={{ padding: '12px 18px', borderBottom: `1px solid ${theme.cardBorder}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'inline-flex', alignItems: 'center', gap: 5 }}><MatIcon name={cat.icon} size={14} />{cat.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: '#64748B' }}>{cat.resolved}/{cat.total}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: pct >= 80 ? '#22C55E' : pct >= 50 ? '#F59E0B' : '#EF4444' }}>{Math.round(pct)}%</span>
                  </div>
                </div>
                <div style={{ height: 5, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct >= 80 ? '#22C55E' : pct >= 50 ? '#F59E0B' : accent, borderRadius: 3, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            )
          })}
        </ReportPanel>

        {/* Priority breakdown */}
        <ReportPanel title="By Priority" theme={theme}>
          {byPriority.map(bp => {
            const pct = summary.total > 0 ? (bp.count / summary.total) * 100 : 0
            const colors = PRIORITY_COLORS[bp.priority as TicketPriority]
            return (
              <div key={bp.priority} style={{ padding: '12px 18px', borderBottom: `1px solid ${theme.cardBorder}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: colors?.text || '#374151' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors?.dot }} />
                    {PRIORITY_LABELS[bp.priority as TicketPriority] || bp.priority}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748B' }}>{bp.count} tickets</span>
                </div>
                <div style={{ height: 5, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: colors?.dot || '#94A3B8', borderRadius: 3 }} />
                </div>
              </div>
            )
          })}
        </ReportPanel>
      </div>

      {/* Daily volume */}
      {dailyVolume.length > 0 && (
        <ReportPanel title="Daily Volume" sub="Created vs resolved per day" theme={theme}>
          <div style={{ padding: '16px 20px 20px' }}>
            <VolumeChart data={dailyVolume} accent={accent} />
          </div>
        </ReportPanel>
      )}

      {/* Agent load */}
      {agentLoad.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <ReportPanel title="Agent Load" theme={theme}>
            {agentLoad.map((al, i) => (
              <div key={al.agent.id} style={{ padding: '12px 18px', borderBottom: i < agentLoad.length - 1 ? `1px solid ${theme.cardBorder}` : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar user={al.agent} size={34} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{al.agent.name}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{al.assigned} assigned · {al.resolved} resolved</div>
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px' }}>{al.assigned}</div>
              </div>
            ))}
          </ReportPanel>
        </div>
      )}
    </div>
  )
}

// ── Agents Tab ────────────────────────────────────────────────────────────────
function AgentsTab({ data, accent, theme }: { data: AgentReport; accent: string; theme: any }) {
  const maxTickets = Math.max(...data.agents.map(a => a.total), 1)
  const cols = ['Agent', 'Total', 'Open', 'In Progress', 'Resolved', 'Avg Resolution', 'Load']

  return (
    <div style={{ background: theme.cardBg, borderRadius: 16, border: `1px solid ${theme.cardBorder}`, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#F8FAFC', borderBottom: `2px solid ${theme.cardBorder}` }}>
            {cols.map(h => (
              <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.agents.length === 0 ? (
            <tr><td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#CBD5E1', fontSize: 14 }}>No agent data</td></tr>
          ) : data.agents.map(({ agent, total, open, in_progress, resolved, avg_resolution_hrs }, i) => (
            <tr key={agent.id} style={{ borderBottom: `1px solid ${theme.cardBorder}`, transition: 'background 0.1s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <td style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar user={agent} size={32} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{agent.name}</div>
                    {agent.title && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{agent.title}</div>}
                  </div>
                </div>
              </td>
              <td style={{ padding: '14px 16px', fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{total}</td>
              <td style={{ padding: '14px 16px' }}><Chip value={open} color="#3B82F6" bg="#EFF6FF" /></td>
              <td style={{ padding: '14px 16px' }}><Chip value={in_progress} color="#F59E0B" bg="#FFFBEB" /></td>
              <td style={{ padding: '14px 16px' }}><Chip value={resolved} color="#22C55E" bg="#F0FDF4" /></td>
              <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748B', fontWeight: 500 }}>
                {avg_resolution_hrs ? `${Math.round(avg_resolution_hrs)}h` : '—'}
              </td>
              <td style={{ padding: '14px 16px', minWidth: 120 }}>
                <div style={{ height: 5, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(total / maxTickets) * 100}%`, background: accent, borderRadius: 3 }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── SLA Tab ───────────────────────────────────────────────────────────────────
function SlaTab({ data, accent, theme }: { data: SlaReport; accent: string; theme: any }) {
  const cols = ['Priority', 'Total Tickets', 'Breached', 'Compliant', 'Compliance Rate']

  return (
    <div style={{ background: theme.cardBg, borderRadius: 16, border: `1px solid ${theme.cardBorder}`, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#F8FAFC', borderBottom: `2px solid ${theme.cardBorder}` }}>
            {cols.map(h => (
              <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.byPriority.length === 0 ? (
            <tr><td colSpan={5} style={{ padding: 48, textAlign: 'center', color: '#CBD5E1', fontSize: 14 }}>No data</td></tr>
          ) : data.byPriority.map(row => {
            const colors = PRIORITY_COLORS[row.priority as TicketPriority]
            const compliant = row.total - row.breached
            const good = row.compliance_pct >= 90
            const warn = row.compliance_pct >= 70
            const barColor = good ? '#22C55E' : warn ? '#F59E0B' : '#EF4444'
            return (
              <tr key={row.priority} style={{ borderBottom: `1px solid ${theme.cardBorder}` }}>
                <td style={{ padding: '16px 20px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: colors?.bg, color: colors?.text, fontSize: 12, fontWeight: 700 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors?.dot }} />
                    {PRIORITY_LABELS[row.priority as TicketPriority] || row.priority}
                  </span>
                </td>
                <td style={{ padding: '16px 20px', fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{row.total}</td>
                <td style={{ padding: '16px 20px' }}><Chip value={row.breached} color="#EF4444" bg="#FEF2F2" /></td>
                <td style={{ padding: '16px 20px' }}><Chip value={compliant} color="#22C55E" bg="#F0FDF4" /></td>
                <td style={{ padding: '16px 20px', minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 6, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${row.compliance_pct}%`, background: barColor, borderRadius: 3, transition: 'width 0.5s ease' }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: barColor, minWidth: 40, textAlign: 'right' }}>
                      {Math.round(row.compliance_pct)}%
                    </span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Shared components ─────────────────────────────────────────────────────────
function ReportPanel({ title, sub, children, theme }: { title: string; sub?: string; children: React.ReactNode; theme: any }) {
  return (
    <div style={{ background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.cardBorder}`, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${theme.cardBorder}` }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

function Chip({ value, color, bg }: { value: number; color: string; bg: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 36, padding: '3px 10px', borderRadius: 20, background: bg, color, fontSize: 13, fontWeight: 700 }}>
      {value}
    </span>
  )
}

function EmptyState() {
  return <div style={{ padding: '32px 18px', textAlign: 'center', color: '#CBD5E1', fontSize: 13 }}>No data for this period</div>
}

function VolumeChart({ data, accent }: { data: { date: string; created: number; resolved: number }[]; accent: string }) {
  const max = Math.max(...data.flatMap(d => [d.created, d.resolved]), 1)
  const recent = data.slice(-14)

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
        <LegendDot color={accent} label="Created" />
        <LegendDot color="#22C55E" label="Resolved" />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 96 }}>
        {recent.map(d => {
          const createdPct = (d.created / max) * 100
          const resolvedPct = (d.resolved / max) * 100
          const label = new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          return (
            <div key={d.date} style={{ flex: 1, minWidth: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
                <div title={`${d.created} created`} style={{ width: 10, height: `${createdPct}%`, background: accent, borderRadius: '3px 3px 0 0', minHeight: 2 }} />
                <div title={`${d.resolved} resolved`} style={{ width: 10, height: `${resolvedPct}%`, background: '#22C55E', borderRadius: '3px 3px 0 0', minHeight: 2 }} />
              </div>
              <div style={{ fontSize: 9, color: '#CBD5E1', whiteSpace: 'nowrap', transform: 'rotate(-30deg)', transformOrigin: 'center', marginTop: 2 }}>{label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>{label}</span>
    </div>
  )
}
