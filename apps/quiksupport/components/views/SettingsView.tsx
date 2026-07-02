'use client'

import { useState } from 'react'
import { useHelpdesk } from '@/components/layout/HelpdeskProvider'
import { THEMES } from '@/lib/themes'

// ── Theme preview card ────────────────────────────────────────────────────────
function ThemeCard({ t, active, onSelect }: {
  t: typeof THEMES[string]; active: boolean; onSelect: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        border: active ? `2px solid ${t.dot}` : `2px solid ${hov ? '#CBD5E1' : '#E2E8F0'}`,
        borderRadius: 14, overflow: 'hidden', cursor: 'pointer', padding: 0,
        background: 'transparent',
        boxShadow: active ? `0 0 0 4px ${t.dot}25` : hov ? '0 4px 16px rgba(0,0,0,0.10)' : '0 1px 4px rgba(0,0,0,0.05)',
        transition: 'all 0.2s',
        transform: hov && !active ? 'translateY(-3px)' : 'none',
      }}
    >
      {/* Preview area */}
      <div style={{ display: 'flex', height: 100, width: 188 }}>
        {/* Sidebar strip */}
        <div style={{ width: 46, background: t.sidebar, display: 'flex', flexDirection: 'column', padding: '10px 7px', gap: 5 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: t.logoBg, marginBottom: 4 }} />
          <div style={{ width: '100%', height: 9, borderRadius: 5, background: t.activeBg, opacity: 0.95 }} />
          {[0.5, 0.4, 0.3].map((o, i) => (
            <div key={i} style={{ width: '100%', height: 6, borderRadius: 3, background: `rgba(255,255,255,${o})` }} />
          ))}
          <div style={{ width: '100%', height: 8, borderRadius: 4, background: t.accent, marginTop: 'auto' }} />
        </div>
        {/* Content area */}
        <div style={{ flex: 1, background: t.mainBg, padding: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ background: t.cardBg, borderRadius: 5, height: 26, boxShadow: t.cardShadow, border: `1px solid ${t.cardBorder}` }} />
            ))}
          </div>
          <div style={{ background: t.cardBg, borderRadius: 5, flex: 1, boxShadow: t.cardShadow, border: `1px solid ${t.cardBorder}` }} />
        </div>
      </div>

      {/* Label row */}
      <div style={{
        padding: '9px 12px',
        background: active ? t.dot : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: `1px solid ${active ? t.dot : '#E2E8F0'}`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: active ? '#fff' : '#1E293B' }}>{t.name}</span>
        {active ? (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth={2} strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
          </svg>
        )}
      </div>
    </button>
  )
}

// ── SettingsView ──────────────────────────────────────────────────────────────
export function SettingsView() {
  const { theme, themeId, setThemeId, currentUser } = useHelpdesk()

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, overflowY: 'auto', height: '100%' }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', margin: 0, letterSpacing: '-0.3px' }}>Settings</h1>
        <p style={{ fontSize: 13, color: '#94A3B8', margin: '5px 0 0' }}>Manage your workspace preferences and account</p>
      </div>

      {/* Appearance section */}
      <SettingCard
        icon={<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
        </svg>}
        title="Appearance"
        subtitle="Theme & visual style"
        accent={theme.accent}
        theme={theme}
      >
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
            {Object.values(THEMES).map(t => (
              <ThemeCard key={t.id} t={t} active={themeId === t.id} onSelect={() => setThemeId(t.id)} />
            ))}
          </div>
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: `${theme.accent}08`, border: `1px solid ${theme.cardBorder}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: theme.dot || theme.accent, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#475569' }}>
              Active: <strong style={{ color: '#0F172A' }}>{THEMES[themeId]?.name}</strong>
              {' '}— changes apply instantly and are saved automatically
            </span>
          </div>
        </div>
      </SettingCard>

      {/* Profile section */}
      <SettingCard
        icon={<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>}
        title="Profile"
        subtitle="Your account information"
        accent={theme.accent}
        theme={theme}
      >
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Avatar */}
          <div style={{
            width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(135deg, ${currentUser?.color || theme.accent}, ${currentUser?.color || theme.accent}BB)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#fff',
            boxShadow: `0 0 0 3px ${currentUser?.color || theme.accent}30`,
          }}>
            {currentUser?.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
          </div>

          {/* Info */}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{currentUser?.name}</div>
            <div style={{ fontSize: 13, color: '#64748B', marginTop: 3 }}>{currentUser?.email}</div>
            <div style={{ marginTop: 6 }}>
              <span style={{
                display: 'inline-flex', padding: '3px 10px', borderRadius: 20,
                background: `${theme.accent}18`, color: theme.accent,
                fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                {currentUser?.role?.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          {/* Spacer + read-only note */}
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#CBD5E1', textAlign: 'right' }}>
            Profile info is managed<br />by your administrator
          </div>
        </div>
      </SettingCard>

      {/* Info rows */}
      <SettingCard
        icon={<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>}
        title="About"
        subtitle="Application info"
        accent={theme.accent}
        theme={theme}
      >
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['Product', 'Quikit Helpdesk'],
            ['Version', '1.0.0'],
            ['Platform', 'Multi-tenant SaaS'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#94A3B8' }}>{label}</span>
              <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{value}</span>
            </div>
          ))}
        </div>
      </SettingCard>
    </div>
  )
}

// ── SettingCard ───────────────────────────────────────────────────────────────
function SettingCard({ icon, title, subtitle, accent, theme, children }: {
  icon: React.ReactNode; title: string; subtitle: string
  accent: string; theme: any; children: React.ReactNode
}) {
  return (
    <div style={{
      background: theme.cardBg, borderRadius: 16, border: `1px solid ${theme.cardBorder}`,
      boxShadow: theme.cardShadow, marginBottom: 16, overflow: 'hidden',
    }}>
      {/* Section header */}
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${theme.panelHeaderBorder || theme.cardBorder}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{title}</div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  )
}
