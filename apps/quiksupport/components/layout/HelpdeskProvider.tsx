'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { User, App, Category, Ticket } from '@/types'
import { THEMES, DEFAULT_THEME_ID, type Theme } from '@/lib/themes'

interface HelpdeskContextValue {
  // Auth & identity
  currentUser: User | null
  setCurrentUser: (user: User) => void
  currentApp: App | null
  tenant: { id: string; name: string; code: string; accent: string } | null

  // Data
  apps: App[]
  categories: Category[]
  tickets: Ticket[]

  // Navigation
  view: string
  setView: (view: string) => void
  detailTicketId: string | null
  navigate: (view: string, id?: string) => void

  // Actions
  refreshTickets: () => Promise<void>
  refreshCategories: () => Promise<void>

  // Toast
  toast: { msg: string; type: 'success' | 'error' } | null
  showToast: (msg: string, type?: 'success' | 'error') => void

  // Theme
  theme: Theme
  themeId: string
  setThemeId: (id: string) => void
}

const HelpdeskContext = createContext<HelpdeskContextValue | null>(null)

export function useHelpdesk() {
  const ctx = useContext(HelpdeskContext)
  if (!ctx) throw new Error('useHelpdesk must be used inside HelpdeskProvider')
  return ctx
}

interface ProviderProps {
  children: ReactNode
  initialUser: User
  initialApps: App[]
  initialCategories: Category[]
  initialTickets: Ticket[]
  tenant: { id: string; name: string; code: string; accent: string }
  currentAppId: string
}

export function HelpdeskProvider({
  children,
  initialUser,
  initialApps,
  initialCategories,
  initialTickets,
  tenant,
  currentAppId,
}: ProviderProps) {
  const [currentUser, setCurrentUser] = useState<User>(initialUser)

  // Patch window.fetch so every /api/ call carries the current user's external_id.
  useEffect(() => {
    const original = window.fetch
    window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
      if (url.startsWith('/api/')) {
        const headers = new Headers(init.headers as HeadersInit | undefined)
        headers.set('x-user-id', currentUser.external_id)
        return original(input, { ...init, headers })
      }
      return original(input, init)
    }
    return () => { window.fetch = original }
  }, [currentUser.external_id])

  const [view, setView] = useState('dashboard')
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets)
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Theme — always start with the default so SSR and the first client render
  // produce identical HTML (avoids React 19 hydration mismatch). The saved
  // theme is applied in useEffect, after hydration is complete.
  const [themeId, setThemeIdState] = useState<string>(DEFAULT_THEME_ID)
  useEffect(() => {
    const saved = localStorage.getItem('hd-theme')
    if (saved && THEMES[saved]) setThemeIdState(saved)
  }, [])
  const theme = THEMES[themeId] || THEMES[DEFAULT_THEME_ID]

  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id)
    localStorage.setItem('hd-theme', id)
  }, [])

  const currentApp = initialApps.find(a => a.id === currentAppId) || initialApps[0] || null

  const navigate = useCallback((v: string, id?: string) => {
    setView(v)
    if (id) setDetailTicketId(id)
  }, [])

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const refreshTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets?limit=100')
      const data = await res.json()
      if (data.success) setTickets(data.data.tickets)
    } catch {}
  }, [])

  const refreshCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories')
      const data = await res.json()
      if (data.success) setCategories(data.data)
    } catch {}
  }, [])

  return (
    <HelpdeskContext.Provider value={{
      currentUser,
      setCurrentUser,
      currentApp,
      tenant,
      apps: initialApps,
      categories,
      tickets,
      view,
      setView,
      detailTicketId,
      navigate,
      refreshTickets,
      refreshCategories,
      toast,
      showToast,
      theme,
      themeId,
      setThemeId,
    }}>
      {children}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: toast.type === 'success' ? '#0F172A' : '#EF4444',
          color: '#fff', padding: '12px 20px', borderRadius: 12,
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          animation: 'fadeIn 0.2s ease',
        }}>
          {toast.type === 'success' ? '✓' : '⚠'} {toast.msg}
        </div>
      )}
    </HelpdeskContext.Provider>
  )
}
