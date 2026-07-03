'use client'

import { useState, useEffect } from 'react'
import { useHelpdesk } from './HelpdeskProvider'
import type { User, UserRole } from '@/types'

// ─── Role meta ────────────────────────────────────────────────────────────────
const ROLE_COLORS: Record<UserRole, string> = {
  HELPDESK_ADMIN: '#A78BFA',
  CATEGORY_LEAD:  '#60A5FA',
  AGENT:          '#34D399',
  CUSTOMER:       'rgba(255,255,255,0.35)',
}
const ROLE_LABELS: Record<UserRole, string> = {
  HELPDESK_ADMIN: 'Helpdesk Admin',
  CATEGORY_LEAD:  'Category Lead',
  AGENT:          'Agent',
  CUSTOMER:       'Customer',
}
function initials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
type IP = { c: string; size?: number }
const mk = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24' as const,
  fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
})
const IcoDashboard = ({ c, size = 18 }: IP) => (
  <svg {...mk(size)} stroke={c} strokeWidth={1.8}>
    <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
  </svg>
)
const IcoTicket = ({ c, size = 18 }: IP) => (
  <svg {...mk(size)} stroke={c} strokeWidth={1.8}>
    <path d="M2 9a1 1 0 011-1h18a1 1 0 011 1v2a2 2 0 000 4v2a1 1 0 01-1 1H3a1 1 0 01-1-1v-2a2 2 0 000-4V9z"/>
    <line x1="9" y1="8" x2="9" y2="16" strokeDasharray="2 2"/>
  </svg>
)
const IcoQueue = ({ c, size = 18 }: IP) => (
  <svg {...mk(size)} stroke={c} strokeWidth={1.8}>
    <path d="M4 6h16M4 10h16M4 14h10M4 18h7"/>
  </svg>
)
const IcoCategories = ({ c, size = 18 }: IP) => (
  <svg {...mk(size)} stroke={c} strokeWidth={1.8}>
    <path d="M3 7a2 2 0 012-2h3.586a1 1 0 01.707.293L10.414 6.5A1 1 0 0011.121 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
  </svg>
)
const IcoSla = ({ c, size = 18 }: IP) => (
  <svg {...mk(size)} stroke={c} strokeWidth={1.8}>
    <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>
  </svg>
)
const IcoReports = ({ c, size = 18 }: IP) => (
  <svg {...mk(size)} stroke={c} strokeWidth={1.8}>
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
)
const IcoPlus = ({ c, size = 16 }: IP) => (
  <svg {...mk(size)} stroke={c} strokeWidth={2.2}>
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)

const IcoSettings = ({ c, size = 18 }: IP) => (
  <svg {...mk(size)} stroke={c} strokeWidth={1.8}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)

const IcoUsers = ({ c, size = 18 }: IP) => (
  <svg {...mk(size)} stroke={c} strokeWidth={1.8}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)

const NAV_ICONS: Record<string, React.ComponentType<IP>> = {
  dashboard: IcoDashboard, tickets: IcoTicket, queue: IcoQueue,
  categories: IcoCategories, sla: IcoSla, reports: IcoReports,
  users: IcoUsers, settings: IcoSettings,
}

// ─── NavButton ─────────────────────────────────────────────────────────────────
function NavBtn({ label, iconKey, active, badge, badgeDanger, collapsed, theme, onClick }: {
  label: string; iconKey: string; active: boolean
  badge?: number; badgeDanger?: boolean; collapsed: boolean
  theme: ReturnType<typeof useHelpdesk>['theme']
  onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  const Icon = NAV_ICONS[iconKey]

  const iconColor = active
    ? theme.activeIcon
    : hov ? 'rgba(255,255,255,0.92)' : theme.inactiveIcon

  const textColor = active
    ? theme.activeText
    : hov ? 'rgba(255,255,255,0.95)' : theme.inactiveText

  const bg = active
    ? theme.activeBg
    : hov ? theme.hoverBg : 'transparent'

  const badgeColor = badgeDanger ? '#EF4444' : (
    active && theme.pillActive ? theme.activeText + '22' : 'rgba(255,255,255,0.18)'
  )
  const badgeTextColor = badgeDanger ? '#fff' : (
    active && theme.pillActive ? theme.activeText : '#fff'
  )

  return (
    <button
      title={collapsed ? label : undefined}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center',
        gap: collapsed ? 0 : 10,
        padding: collapsed ? '9px 0' : '8px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        background: bg, transition: 'background 0.13s',
        position: 'relative',
      }}
    >
      {/* Left bar — only for non-pill themes */}
      {active && !theme.pillActive && (
        <span style={{
          position: 'absolute', left: 0, top: '18%', bottom: '18%',
          width: 3, borderRadius: '0 3px 3px 0', background: theme.activeBar,
        }} />
      )}

      {Icon && <Icon c={iconColor} size={17} />}

      {!collapsed && (
        <span style={{
          flex: 1, fontSize: 13, fontWeight: active ? 600 : 450,
          color: textColor, transition: 'color 0.13s',
          whiteSpace: 'nowrap', overflow: 'hidden', textAlign: 'left',
          letterSpacing: active ? '-0.01em' : '0',
        }}>
          {label}
        </span>
      )}

      {/* Badge */}
      {!collapsed && (badge || 0) > 0 && (
        <span style={{
          minWidth: 18, padding: '1px 5px', borderRadius: 20,
          fontSize: 10.5, fontWeight: 700, textAlign: 'center',
          background: badgeDanger ? '#EF4444' : badgeColor,
          color: badgeTextColor, flexShrink: 0,
        }}>
          {badge}
        </span>
      )}

      {/* Collapsed dot */}
      {collapsed && (badge || 0) > 0 && (
        <span style={{
          position: 'absolute', top: 6, right: 8,
          width: 6, height: 6, borderRadius: '50%',
          background: badgeDanger ? '#EF4444' : theme.activeBar,
          border: '1.5px solid rgba(0,0,0,0.3)',
        }} />
      )}
    </button>
  )
}

// ─── Main Sidebar ──────────────────────────────────────────────────────────────
export function Sidebar() {
  const { view, navigate, currentUser, setCurrentUser, tenant, tickets, theme, themeId, setThemeId } = useHelpdesk()
  const [collapsed, setCollapsed] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [allUsers, setAllUsers] = useState<User[]>([])

  const isAdmin    = currentUser?.role === 'HELPDESK_ADMIN'
  const isAgent    = ['HELPDESK_ADMIN', 'CATEGORY_LEAD', 'AGENT'].includes(currentUser?.role || '')
  const isCustomer = currentUser?.role === 'CUSTOMER'

  const openCount    = tickets.filter(t => t.status === 'open').length
  const overdueCount = tickets.filter(t => {
    if (!t.sla_due_at || ['resolved', 'closed'].includes(t.status)) return false
    return new Date(t.sla_due_at) < new Date()
  }).length

  const navItems = [
    { id: 'dashboard',  label: 'Dashboard',                               icon: 'dashboard',  show: !isCustomer },
    { id: 'tickets',    label: isCustomer ? 'My Tickets' : 'All Tickets', icon: 'tickets',    show: true, badge: openCount },
    { id: 'queue',      label: 'Queue',                                   icon: 'queue',      show: isAgent, badge: overdueCount, badgeDanger: true },
    { id: 'categories', label: 'Categories',                              icon: 'categories', show: isAdmin },
    { id: 'sla-config', label: 'SLA Rules',                               icon: 'sla',        show: isAdmin },
    { id: 'users',      label: 'Users & Roles',                           icon: 'users',      show: isAdmin },
    { id: 'reports',    label: 'Reports',                                 icon: 'reports',    show: isAgent },
  ]
  const bottomItems = [
    { id: 'settings', label: 'Settings', icon: 'settings', show: true },
  ]

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(d => { if (d.success) setAllUsers(d.data) })
      .catch(() => {})
  }, [])

  const W = collapsed ? 64 : 230

  return (
    <div style={{
      width: W, minWidth: W,
      background: theme.sidebar,
      display: 'flex', flexDirection: 'column',
      height: '100vh',
      transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1)',
      flexShrink: 0, position: 'relative',
      borderRight: `1px solid ${theme.sidebarBorder}`,
    }}>

      {/* ── Collapse indicator — floating pill on right edge ── */}
      <button
        title={collapsed ? 'Expand' : 'Collapse'}
        onClick={() => setCollapsed(v => !v)}
        style={{
          position: 'absolute', top: 22, right: -13, zIndex: 50,
          width: 26, height: 26, borderRadius: '50%',
          background: '#1E293B',
          border: '1.5px solid rgba(255,255,255,0.2)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#334155'}
        onMouseLeave={e => e.currentTarget.style.background = '#1E293B'}
      >
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.7)" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.22s' }}
        >
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>

      {/* ── Brand ── */}
      <div style={{
        padding: collapsed ? '14px 0 12px' : '14px 14px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderBottom: `1px solid ${theme.sidebarBorder}`,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: theme.logoBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: theme.logoLetterColor,
          letterSpacing: '-0.02em',
        }}>
          Q
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '-0.025em', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
              {tenant?.name || 'Quikit'}
            </div>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.04em', marginTop: 1, whiteSpace: 'nowrap' }}>
              HELPDESK
            </div>
          </div>
        )}
      </div>

      {/* ── Nav ── */}
      <nav style={{
        flex: 1, overflow: 'hidden',
        padding: '10px 8px 8px',
        display: 'flex', flexDirection: 'column',
      }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {navItems.filter(n => n.show).map(item => {
            const active = view === item.id || (view === 'ticket-detail' && item.id === 'tickets')
            return (
              <NavBtn
                key={item.id}
                label={item.label}
                iconKey={item.icon}
                active={active}
                badge={item.badge}
                badgeDanger={item.badgeDanger}
                collapsed={collapsed}
                theme={theme}
                onClick={() => navigate(item.id)}
              />
            )
          })}
        </div>

        {/* New Ticket */}
        <div style={{ marginTop: 'auto' }}>
          <div style={{ height: 1, background: theme.sidebarBorder, margin: '12px 4px 10px' }} />
          <button
            title={collapsed ? 'New Ticket' : undefined}
            onClick={() => navigate('create-ticket')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              gap: collapsed ? 0 : 8,
              padding: collapsed ? '9px 0' : '8px 12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: theme.accent, transition: 'filter 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
          >
            <IcoPlus c={theme.accentText} size={15} />
            {!collapsed && (
              <span style={{ fontSize: 12.5, fontWeight: 600, color: theme.accentText, whiteSpace: 'nowrap' }}>
                New Ticket
              </span>
            )}
          </button>

          {/* Settings */}
          <div style={{ height: 1, background: theme.sidebarBorder, margin: '10px 4px 6px' }} />
          {bottomItems.filter(n => n.show).map(item => {
            const active = view === item.id
            return (
              <NavBtn
                key={item.id}
                label={item.label}
                iconKey={item.icon}
                active={active}
                collapsed={collapsed}
                theme={theme}
                onClick={() => navigate(item.id)}
              />
            )
          })}
        </div>
      </nav>

      {/* ── User profile (bottom) ── */}
      <div style={{
        borderTop: `1px solid ${theme.sidebarBorder}`,
        padding: collapsed ? '10px 0' : '10px 8px',
        position: 'relative',
      }}>
        <button
          onClick={() => setSwitcherOpen(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            gap: collapsed ? 0 : 10,
            padding: collapsed ? '6px 0' : '8px 10px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background: switcherOpen ? 'rgba(255,255,255,0.1)' : 'transparent',
            border: 'none', cursor: 'pointer', borderRadius: 9, fontFamily: 'inherit',
            transition: 'background 0.14s',
          }}
          onMouseEnter={e => { if (!switcherOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
          onMouseLeave={e => { if (!switcherOpen) e.currentTarget.style.background = 'transparent' }}
        >
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(135deg, ${currentUser?.color || theme.accent}, ${currentUser?.color || theme.accent}BB)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff',
            boxShadow: '0 0 0 2px rgba(255,255,255,0.15)',
          }}>
            {currentUser ? initials(currentUser.name) : '?'}
          </div>
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                {currentUser?.name}
              </div>
              <div style={{ fontSize: 10.5, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: currentUser ? ROLE_COLORS[currentUser.role] : 'rgba(255,255,255,0.4)' }}>
                {currentUser ? ROLE_LABELS[currentUser.role] : '—'}
              </div>
            </div>
          )}
          {!collapsed && (
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
              stroke="rgba(255,255,255,0.4)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0, transform: switcherOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          )}
        </button>

        {/* Role switcher — opens upward */}
        {switcherOpen && (
          <>
            <div onClick={() => setSwitcherOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
            <div style={{
              position: 'absolute', zIndex: 99,
              background: '#1E293B', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 -12px 40px rgba(0,0,0,0.5)',
              maxHeight: 280, overflowY: 'auto',
              ...(collapsed
                ? { left: W + 8, bottom: 8, width: 220 }
                : { left: 10, right: 10, bottom: 'calc(100% + 6px)' }
              ),
            }}>
              <div style={{ padding: '10px 14px 6px', fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Switch User
              </div>
              {allUsers.length === 0 && (
                <div style={{ padding: '10px 14px', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading…</div>
              )}
              {allUsers.map(u => {
                const isCur = u.id === currentUser?.id
                return (
                  <button key={u.id}
                    onClick={() => { setCurrentUser(u); setSwitcherOpen(false) }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: isCur ? 'rgba(255,255,255,0.08)' : 'transparent', fontFamily: 'inherit',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { if (!isCur) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                    onMouseLeave={e => { if (!isCur) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: `linear-gradient(135deg, ${u.color}, ${u.color}AA)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: '#fff',
                    }}>
                      {initials(u.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                      <div style={{ fontSize: 10, color: ROLE_COLORS[u.role], fontWeight: 600 }}>{ROLE_LABELS[u.role]}</div>
                    </div>
                    {isCur && <span style={{ fontSize: 14, color: '#22C55E', flexShrink: 0 }}>✓</span>}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
