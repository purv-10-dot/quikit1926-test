'use client'

import { useState, useEffect, useMemo } from 'react'
import { useHelpdesk } from '@/components/layout/HelpdeskProvider'
import { Avatar } from '@/components/ui/avatar'
import { PriorityBadge } from '@/components/ui/badges'
import { timeAgo } from '@/lib/utils'
import { MatIcon } from '@/lib/icons'
import type { Ticket } from '@/types'
import { PRIORITY_COLORS, PRIORITY_LABELS } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────
interface DashSummary {
  totalActive: number; open: number; inProgress: number; waiting: number
  resolved: number; closed: number; overdue: number; slaCompliance: number
}
interface AgentStat {
  user: { id: string; name: string; color: string; role: string }
  active: number; resolved: number; overdue: number
}
interface AppStat { id: string; name: string; icon: string; color: string; total: number; active: number }
interface VolumePoint { date: string; count: number }
interface SlaStatItem { priority: string; total: number; breached: number; atRisk: number; compliance: number }
interface SlaConfig { priority: string; category_id?: string | null; resolve_hrs: number; first_response_hrs: number }
interface DashData {
  summary: DashSummary; agents: AgentStat[]; apps: AppStat[]
  volumeChart: VolumePoint[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n) }
function fmtHrs(ms: number) {
  const h = Math.round(ms / 3600000)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}
function breachedAgo(due: string) {
  const diff = Date.now() - new Date(due).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'Just now'
  return `${h}h ago`
}
function dayLabel(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function todayStr() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

const APP_PALETTE = ['#6366F1', '#06B6D4', '#22C55E', '#F59E0B', '#EC4899', '#8B5CF6', '#F97316']

// ─── Donut chart ──────────────────────────────────────────────────────────────
function DonutChart({ segments, total }: { segments: Array<{ value: number; color: string }>; total: number }) {
  const r = 52, cx = 68, cy = 68, sw = 16, circ = 2 * Math.PI * r
  let cum = 0
  return (
    <svg width={136} height={136} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={sw} />
      {total === 0 ? null : segments.map((seg, i) => {
        if (!seg.value) { cum += seg.value; return null }
        const dash = (seg.value / total) * circ - 1.5
        const offset = circ * 0.25 - (cum / total) * circ
        cum += seg.value
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth={sw}
            strokeDasharray={`${Math.max(dash, 0)} ${circ}`}
            strokeDashoffset={offset} strokeLinecap="butt" />
        )
      })}
      <text x={cx} y={cy - 7} textAnchor="middle" fontSize={26} fontWeight={700} fill="#0F172A">{fmt(total)}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={11} fill="#94A3B8">Active</text>
    </svg>
  )
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ data, color = '#6366F1' }: { data: number[]; color?: string }) {
  if (data.length < 2) return <div style={{ height: 56, background: '#F8FAFC', borderRadius: 8 }} />
  const max = Math.max(...data, 1)
  const W = 400, H = 56, pad = 4
  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (W - 2 * pad),
    y: H - pad - (v / max) * (H - 2 * pad),
  }))
  const line = pts.map(p => `${p.x},${p.y}`).join(' ')
  const area = [`${pts[0].x},${H}`, ...pts.map(p => `${p.x},${p.y}`), `${pts[pts.length - 1].x},${H}`].join(' ')
  const id = `sg-${color.replace('#', '')}`
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const icons = {
  ticket: (c: string) => (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a1 1 0 011-1h18a1 1 0 011 1v2a2 2 0 000 4v2a1 1 0 01-1 1H3a1 1 0 01-1-1v-2a2 2 0 000-4V9z" />
    </svg>
  ),
  shield: (c: string) => (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" />
    </svg>
  ),
  alert: (c: string) => (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  clock: (c: string) => (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
}

// ─── MetricCard ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, iconBg, iconColor, iconEl, trend, trendUp, onClick, cardBg, cardBorder, cardShadow }: {
  label: string; value: string | number; sub?: string
  iconBg: string; iconColor: string; iconEl: React.ReactNode
  trend?: string; trendUp?: boolean; onClick?: () => void
  cardBg?: string; cardBorder?: string; cardShadow?: string
}) {
  const [hov, setHov] = useState(false)
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: cardBg || '#fff', borderRadius: 16, padding: '20px 22px',
        border: `1px solid ${hov && onClick ? '#C7D2FE' : (cardBorder || '#F1F5F9')}`,
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: hov && onClick ? '0 8px 28px rgba(99,102,241,0.10)' : (cardShadow || 'none'),
        transition: 'all 0.17s', transform: hov && onClick ? 'translateY(-2px)' : 'none',
        display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', overflow: 'hidden',
      }}>
      {/* top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </span>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {iconEl}
        </div>
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: '#0F172A', lineHeight: 1, marginBottom: 5, letterSpacing: '-1px' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>{sub}</div>}
      {trend && (
        <div style={{ marginTop: 'auto', paddingTop: sub ? 0 : 10 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: trendUp ? '#F0FDF4' : '#FEF2F2',
            color: trendUp ? '#15803D' : '#DC2626',
          }}>
            <span style={{ fontSize: 9 }}>{trendUp ? '▲' : '▼'}</span>
            {trend}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────
function Panel({ title, sub, action, onAction, children, cardBg, cardBorder, cardShadow, panelHeaderBorder }: {
  title: string; sub?: string; action?: string; onAction?: () => void; children: React.ReactNode
  cardBg?: string; cardBorder?: string; cardShadow?: string; panelHeaderBorder?: string
}) {
  return (
    <div style={{
      background: cardBg || '#fff', borderRadius: 16, border: `1px solid ${cardBorder || '#F1F5F9'}`,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      boxShadow: cardShadow || 'none',
    }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${panelHeaderBorder || '#F8FAFC'}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{sub}</div>}
        </div>
        {action && onAction && (
          <button onClick={onAction} style={{ fontSize: 12, fontWeight: 600, color: '#6366F1', background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: 0.8 }}>
            {action} →
          </button>
        )}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export function Dashboard() {
  const { tickets, currentUser, navigate, tenant, theme } = useHelpdesk()
  const accent = theme.accent || tenant?.accent || '#6366F1'
  const isAgent = ['HELPDESK_ADMIN', 'CATEGORY_LEAD', 'AGENT'].includes(currentUser?.role || '')

  const [dashData, setDashData] = useState<DashData | null>(null)
  const [slaStats, setSlaStats] = useState<SlaStatItem[]>([])
  const [slaConfigs, setSlaConfigs] = useState<SlaConfig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAgent) { setLoading(false); return }
    Promise.all([
      fetch('/api/reports?type=dashboard&days=7').then(r => r.json()),
      fetch('/api/reports?type=sla').then(r => r.json()),
      fetch('/api/sla-config').then(r => r.json()),
    ]).then(([dash, sla, cfg]) => {
      if (dash.success) setDashData(dash.data)
      if (sla.success) setSlaStats((sla.data.byPriority ?? sla.data).map((s: any) => ({ ...s, compliance: s.compliance_pct ?? s.compliance ?? 100 })))
      if (cfg.success) setSlaConfigs(cfg.data.filter((c: SlaConfig) => !c.category_id))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [isAgent])

  const breachedTickets = useMemo(() =>
    tickets.filter(t => t.sla_due_at && !['resolved', 'closed'].includes(t.status) && new Date(t.sla_due_at) < new Date())
      .sort((a, b) => new Date(a.sla_due_at!).getTime() - new Date(b.sla_due_at!).getTime())
      .slice(0, 6),
    [tickets])

  const atRiskCount = useMemo(() =>
    tickets.filter(t => {
      if (!t.sla_due_at || ['resolved', 'closed'].includes(t.status)) return false
      const due = new Date(t.sla_due_at).getTime()
      const created = new Date(t.created_at).getTime()
      const pct = (Date.now() - created) / (due - created)
      return pct >= 0.75 && Date.now() < due
    }).length, [tickets])

  const avgResolutionMs = useMemo(() => {
    const resolved = tickets.filter(t => t.resolved_at)
    if (!resolved.length) return 0
    return resolved.reduce((s, t) => s + (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()), 0) / resolved.length
  }, [tickets])

  const volumeSeries = useMemo(() => {
    if (!dashData?.volumeChart) return Array(7).fill(0)
    return Array.from({ length: 7 }, (_, i) => {
      const label = dayLabel(6 - i)
      return dashData.volumeChart.find(p => p.date === label)?.count || 0
    })
  }, [dashData])

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#94A3B8' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', borderWidth: 3, borderStyle: 'solid', borderTopColor: 'transparent', borderRightColor: accent, borderBottomColor: accent, borderLeftColor: accent }} />
        <span style={{ fontSize: 14 }}>Loading dashboard…</span>
      </div>
    )
  }

  const summary = dashData?.summary
  const agents = (dashData?.agents || []).slice(0, 5)
  const apps = dashData?.apps || []

  return (
    <div style={{ padding: '24px 28px 32px', overflowY: 'auto', height: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.3px' }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: '4px 0 0' }}>
            Welcome back, <span style={{ fontWeight: 600, color: '#64748B' }}>{currentUser?.name?.split(' ')[0]}</span>. Here's what's happening.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {(summary?.overdue || 0) > 0 && (
            <button onClick={() => navigate('queue')} style={{
              padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: '#FEF2F2', color: '#DC2626', fontSize: 12, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#EF4444', display: 'inline-block', flexShrink: 0 }} />
              {summary?.overdue} overdue
            </button>
          )}
          <span style={{ fontSize: 12, color: '#94A3B8' }}>{todayStr()}</span>
        </div>
      </div>

      {/* ── Row 1: Metric cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <MetricCard
          label="Active Tickets"
          value={fmt(summary?.totalActive ?? tickets.filter(t => !['resolved', 'closed'].includes(t.status)).length)}
          sub={`${summary?.open ?? 0} open · ${summary?.inProgress ?? 0} in progress`}
          iconBg="#EFF6FF" iconColor="#3B82F6" iconEl={icons.ticket('#3B82F6')}
          trend={summary?.overdue ? `${summary.overdue} overdue` : undefined} trendUp={false}
          onClick={() => navigate('tickets')}
          cardBg={theme.cardBg} cardBorder={theme.cardBorder} cardShadow={theme.cardShadow}
        />
        <MetricCard
          label="SLA Compliance"
          value={`${summary?.slaCompliance ?? 100}%`}
          sub={summary?.overdue ? `${summary.overdue} breached` : 'All on track'}
          iconBg="#FFF7ED" iconColor="#F97316" iconEl={icons.shield('#F97316')}
          trend={summary?.slaCompliance !== undefined && summary.slaCompliance < 80 ? `${100 - summary.slaCompliance}% at risk` : undefined} trendUp={false}
          onClick={() => navigate('queue')}
          cardBg={theme.cardBg} cardBorder={theme.cardBorder} cardShadow={theme.cardShadow}
        />
        <MetricCard
          label="At Risk"
          value={fmt(atRiskCount)}
          sub="SLA &gt; 75% elapsed"
          iconBg="#FFFBEB" iconColor="#F59E0B" iconEl={icons.alert('#F59E0B')}
          onClick={() => navigate('queue')}
          cardBg={theme.cardBg} cardBorder={theme.cardBorder} cardShadow={theme.cardShadow}
        />
        <MetricCard
          label="Avg Resolution"
          value={avgResolutionMs > 0 ? fmtHrs(avgResolutionMs) : '—'}
          sub="Resolved tickets"
          iconBg="#F5F3FF" iconColor="#8B5CF6" iconEl={icons.clock('#8B5CF6')}
          trend={summary?.resolved ? `${summary?.resolved} resolved` : undefined} trendUp={true}
          onClick={() => navigate('reports')}
          cardBg={theme.cardBg} cardBorder={theme.cardBorder} cardShadow={theme.cardShadow}
        />
      </div>

      {/* ── Row 2: Charts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* Tickets by App */}
        <Panel title="Tickets by App" sub="Active tickets per product"
          cardBg={theme.cardBg} cardBorder={theme.cardBorder} cardShadow={theme.cardShadow} panelHeaderBorder={theme.panelHeaderBorder}>
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
            <DonutChart
              segments={apps.map((a, i) => ({ value: a.active, color: a.color || APP_PALETTE[i % APP_PALETTE.length] }))}
              total={apps.reduce((s, a) => s + a.active, 0)}
            />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {apps.length === 0 ? (
                <span style={{ fontSize: 12, color: '#CBD5E1' }}>No data</span>
              ) : apps.map((a, i) => (
                <div key={a.id}
                  onClick={() => navigate('tickets')}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderRadius: 7, padding: '3px 6px', transition: 'background 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: a.color || APP_PALETTE[i % APP_PALETTE.length], flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#374151', flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}><MatIcon name={a.icon} size={15} />{a.name}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{a.active}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* SLA Health */}
        <Panel title="SLA Health" sub="Resolution targets by priority"
          cardBg={theme.cardBg} cardBorder={theme.cardBorder} cardShadow={theme.cardShadow} panelHeaderBorder={theme.panelHeaderBorder}>
          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(['critical', 'high', 'medium', 'low'] as const).map(p => {
              const stat = slaStats.find(s => s.priority === p)
              const cfg = slaConfigs.find(c => c.priority === p)
              const compliance = stat?.compliance ?? 100
              const total = stat?.total ?? 0
              const pc = PRIORITY_COLORS[p]
              const hours = cfg?.resolve_hrs
              const barColor = compliance < 50 ? '#EF4444' : compliance < 80 ? '#F59E0B' : pc.dot
              return (
                <div key={p}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: pc.dot }} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: pc.text }}>{PRIORITY_LABELS[p]}</span>
                      {hours && <span style={{ fontSize: 11, color: '#94A3B8' }}>· {hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: barColor }}>{compliance}%</span>
                      <span style={{ fontSize: 10, color: '#CBD5E1' }}>{total}t</span>
                    </div>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: '#F1F5F9', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${compliance}%`, background: barColor, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>

        {/* Top Agents */}
        <Panel title="Top Agents" sub="Current workload" action="View all" onAction={() => navigate('reports')}
          cardBg={theme.cardBg} cardBorder={theme.cardBorder} cardShadow={theme.cardShadow} panelHeaderBorder={theme.panelHeaderBorder}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {agents.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: '#CBD5E1', fontSize: 12 }}>No agents</div>
            ) : agents.map((a, i) => (
              <div key={a.user.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
                borderBottom: i < agents.length - 1 ? `1px solid ${theme.cardBorder}` : 'none',
              }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#CBD5E1', width: 16, textAlign: 'right', flexShrink: 0 }}>#{i + 1}</span>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: `linear-gradient(135deg, ${a.user.color}, ${a.user.color}99)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#fff',
                }}>
                  {a.user.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.user.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                    {a.active} active · {a.resolved} resolved
                  </div>
                </div>
                {a.overdue > 0 && (
                  <span style={{ padding: '2px 8px', borderRadius: 20, background: '#FEF2F2', color: '#DC2626', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                    {a.overdue} overdue
                  </span>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Row 3: Volume + Breached ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>

        {/* Volume chart */}
        <Panel title="New Tickets · 7 days" sub="Daily ticket volume"
          cardBg={theme.cardBg} cardBorder={theme.cardBorder} cardShadow={theme.cardShadow} panelHeaderBorder={theme.panelHeaderBorder}>
          <div style={{ padding: '14px 20px 18px' }}>
            <Sparkline data={volumeSeries} color={accent} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i} style={{ fontSize: 10, color: '#CBD5E1' }}>
                  {i === 6 ? 'Today' : `${6 - i}d`}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${theme.cardBorder}` }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.5px' }}>
                  {volumeSeries.reduce((s, v) => s + v, 0)}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>Total this week</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.5px' }}>
                  {volumeSeries[6] ?? 0}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>Today</div>
              </div>
            </div>
          </div>
        </Panel>

        {/* SLA Breached */}
        <Panel title="SLA Breached" sub="Needs immediate attention" action="View queue" onAction={() => navigate('queue')}
          cardBg={theme.cardBg} cardBorder={theme.cardBorder} cardShadow={theme.cardShadow} panelHeaderBorder={theme.panelHeaderBorder}>
          {breachedTickets.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#22C55E' }}>All tickets within SLA</div>
            </div>
          ) : breachedTickets.map((t, i) => (
            <BreachedRow key={t.id} ticket={t} last={i === breachedTickets.length - 1} onClick={() => navigate('ticket-detail', t.id)} theme={theme} />
          ))}
        </Panel>
      </div>
    </div>
  )
}

// ─── Breached row ─────────────────────────────────────────────────────────────
function BreachedRow({ ticket, last, onClick, theme }: { ticket: Ticket; last: boolean; onClick: () => void; theme: any }) {
  const [hov, setHov] = useState(false)
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px',
        borderBottom: last ? 'none' : `1px solid ${theme.cardBorder}`,
        cursor: 'pointer', background: hov ? '#FFFBEB' : 'transparent', transition: 'background 0.1s',
      }}>
      <div style={{
        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        background: `${ticket.app?.color || '#6366F1'}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
      }}>
        <MatIcon name={ticket.app?.icon || 'confirmation_number'} size={18} color={ticket.app?.color || '#6366F1'} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
          {ticket.subject}
        </div>
        <div style={{ fontSize: 11, color: '#94A3B8' }}>
          {ticket.ticket_number}
          {ticket.category && ` · ${ticket.category.name}`}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <PriorityBadge priority={ticket.priority} />
        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', whiteSpace: 'nowrap' }}>
          ⚠ {breachedAgo(ticket.sla_due_at!)}
        </span>
      </div>
    </div>
  )
}
