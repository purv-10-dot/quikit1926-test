'use client'

import { HelpdeskProvider, useHelpdesk } from './HelpdeskProvider'
import { Sidebar } from './Sidebar'
import { Dashboard } from '@/components/views/Dashboard'
import { TicketList } from '@/components/views/TicketList'
import { TicketDetail } from '@/components/views/TicketDetail'
import { QueueView } from '@/components/views/QueueView'
import { CategoriesView } from '@/components/views/CategoriesView'
import { SlaConfigView } from '@/components/views/SlaConfigView'
import { ReportsView } from '@/components/views/ReportsView'
import { CreateTicketModal } from '@/components/views/CreateTicketModal'
import { SettingsView } from '@/components/views/SettingsView'
import { UsersView } from '@/components/views/UsersView'
import { AppBar } from '@/components/shell/app-bar'
import type { User, App, Category, Ticket } from '@/types'

function ViewRouter() {
  const { view, detailTicketId, currentUser, navigate } = useHelpdesk()
  const isCustomer = currentUser?.role === 'CUSTOMER'

  if (view === 'dashboard' && isCustomer) {
    navigate('tickets')
    return null
  }

  if (view === 'dashboard') return <Dashboard />
  if (view === 'tickets') return <TicketList />
  if (view === 'ticket-detail' && detailTicketId) return <TicketDetail ticketId={detailTicketId} />
  if (view === 'queue') return <QueueView />
  if (view === 'categories') return <CategoriesView />
  if (view === 'sla-config') return <SlaConfigView />
  if (view === 'reports') return <ReportsView />
  if (view === 'settings') return <SettingsView />
  if (view === 'users') return <UsersView />
  if (view === 'create-ticket') return <CreateTicketModal />
  return null
}

function ThemedMain() {
  const { theme } = useHelpdesk()
  return (
    <main style={{
      flex: 1, overflow: 'auto',
      display: 'flex', flexDirection: 'column',
      background: theme.mainBg,
      transition: 'background 0.3s',
    }}>
      <AppBar />
      <ViewRouter />
    </main>
  )
}

interface Props {
  initialUser: User
  initialApps: App[]
  initialCategories: Category[]
  initialTickets: Ticket[]
  tenant: { id: string; name: string; code: string; accent: string }
  currentAppId: string
}

export function HelpdeskShell({ initialUser, initialApps, initialCategories, initialTickets, tenant, currentAppId }: Props) {
  return (
    <HelpdeskProvider
      initialUser={initialUser}
      initialApps={initialApps}
      initialCategories={initialCategories}
      initialTickets={initialTickets}
      tenant={tenant}
      currentAppId={currentAppId}
    >
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar />
        <ThemedMain />
      </div>
    </HelpdeskProvider>
  )
}
