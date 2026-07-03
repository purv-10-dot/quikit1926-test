export interface Theme {
  id: string
  name: string
  dot: string        // color dot in theme picker
  // Sidebar
  sidebar: string    // background gradient/color
  sidebarBorder: string
  pillActive: boolean // white-pill active style (vs. glow highlight)
  activeBg: string
  activeText: string
  activeIcon: string
  activeBar: string   // left bar indicator color
  inactiveText: string
  inactiveIcon: string
  hoverBg: string
  logoLetterColor: string
  logoBg: string
  // Accent
  accent: string
  accentText: string
  // Content area
  mainBg: string
  cardBg: string
  cardBorder: string
  cardShadow: string
  panelHeaderBorder: string
}

export const THEMES: Record<string, Theme> = {
  violet: {
    id: 'violet',
    name: 'Violet',
    dot: '#7C3AED',
    sidebar: 'linear-gradient(160deg, #3730A3 0%, #4F46E5 60%, #6D5AE0 100%)',
    sidebarBorder: 'rgba(255,255,255,0.1)',
    pillActive: true,
    activeBg: 'rgba(255,255,255,0.96)',
    activeText: '#3730A3',
    activeIcon: '#4338CA',
    activeBar: '#A5B4FC',
    inactiveText: 'rgba(255,255,255,0.82)',
    inactiveIcon: 'rgba(255,255,255,0.72)',
    hoverBg: 'rgba(255,255,255,0.13)',
    logoLetterColor: '#fff',
    logoBg: 'rgba(255,255,255,0.2)',
    accent: '#6366F1',
    accentText: '#fff',
    mainBg: '#F5F3FF',       // violet-50 — industry-standard subtle tint
    cardBg: '#FFFFFF',
    cardBorder: 'rgba(99,102,241,0.10)',
    cardShadow: '0 1px 4px rgba(67,56,202,0.08)',
    panelHeaderBorder: '#EEF2FF',
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    dot: '#1E293B',
    sidebar: 'linear-gradient(180deg, #0F172A 0%, #111827 100%)',
    sidebarBorder: 'rgba(255,255,255,0.08)',
    pillActive: false,
    activeBg: 'rgba(99,102,241,0.22)',
    activeText: '#fff',
    activeIcon: '#A5B4FC',
    activeBar: '#818CF8',
    inactiveText: 'rgba(255,255,255,0.78)',
    inactiveIcon: 'rgba(255,255,255,0.65)',
    hoverBg: 'rgba(255,255,255,0.08)',
    logoLetterColor: '#fff',
    logoBg: 'rgba(99,102,241,0.35)',
    accent: '#6366F1',
    accentText: '#fff',
    mainBg: '#F1F5F9',       // slate-100 — industry-standard neutral bg
    cardBg: '#FFFFFF',
    cardBorder: 'rgba(0,0,0,0.06)',
    cardShadow: '0 1px 4px rgba(0,0,0,0.06)',
    panelHeaderBorder: '#F8FAFC',
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    dot: '#0369A1',
    sidebar: 'linear-gradient(160deg, #0C4A6E 0%, #0369A1 100%)',
    sidebarBorder: 'rgba(255,255,255,0.08)',
    pillActive: true,
    activeBg: 'rgba(255,255,255,0.95)',
    activeText: '#0C4A6E',
    activeIcon: '#0369A1',
    activeBar: '#7DD3FC',
    inactiveText: 'rgba(255,255,255,0.80)',
    inactiveIcon: 'rgba(255,255,255,0.68)',
    hoverBg: 'rgba(255,255,255,0.11)',
    logoLetterColor: '#fff',
    logoBg: 'rgba(255,255,255,0.18)',
    accent: '#0EA5E9',
    accentText: '#fff',
    mainBg: '#F0F9FF',       // sky-50 — industry-standard subtle tint
    cardBg: '#FFFFFF',
    cardBorder: 'rgba(14,165,233,0.10)',
    cardShadow: '0 1px 4px rgba(12,74,110,0.06)',
    panelHeaderBorder: '#E0F2FE',
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    dot: '#15803D',
    sidebar: 'linear-gradient(160deg, #14532D 0%, #166534 100%)',
    sidebarBorder: 'rgba(255,255,255,0.08)',
    pillActive: true,
    activeBg: 'rgba(255,255,255,0.95)',
    activeText: '#14532D',
    activeIcon: '#15803D',
    activeBar: '#86EFAC',
    inactiveText: 'rgba(255,255,255,0.80)',
    inactiveIcon: 'rgba(255,255,255,0.68)',
    hoverBg: 'rgba(255,255,255,0.11)',
    logoLetterColor: '#fff',
    logoBg: 'rgba(255,255,255,0.18)',
    accent: '#22C55E',
    accentText: '#fff',
    mainBg: '#F0FDF4',       // green-50 — industry-standard subtle tint
    cardBg: '#FFFFFF',
    cardBorder: 'rgba(34,197,94,0.10)',
    cardShadow: '0 1px 4px rgba(20,83,45,0.06)',
    panelHeaderBorder: '#DCFCE7',
  },
}

export const DEFAULT_THEME_ID = 'midnight'
