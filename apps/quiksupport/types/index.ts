export type TicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'
export type TicketSource = 'portal' | 'widget' | 'api' | 'email'
export type MessageType = 'customer_reply' | 'agent_reply' | 'internal_note' | 'status_update' | 'system'
export type UserRole = 'HELPDESK_ADMIN' | 'CATEGORY_LEAD' | 'AGENT' | 'CUSTOMER'

export interface User {
  id: string
  external_id: string
  name: string
  email: string
  role: UserRole
  title?: string | null
  avatar_url?: string | null
  color: string
}

export interface App {
  id: string
  name: string
  code: string
  icon: string
  color: string
  accent: string
}

export interface Subcategory {
  id: string
  name: string
  description?: string | null
}

export interface CategoryAgent {
  id: string
  user_id: string
  app_id?: string | null
  is_lead: boolean
  user: User
  app?: App | null
}

export interface Category {
  id: string
  name: string
  icon: string
  description?: string | null
  is_active: boolean
  sort_order: number
  subcategories: Subcategory[]
  agents: CategoryAgent[]
  _count?: { tickets: number }
}

export interface Ticket {
  id: string
  ticket_number: string
  tenant_id: string
  app_id: string
  category_id?: string | null
  subcategory_id?: string | null
  requester_id: string
  assigned_to_id?: string | null
  subject: string
  description?: string | null
  status: TicketStatus
  priority: TicketPriority
  source: TicketSource
  tags: string[]
  sla_due_at?: string | null
  first_response_at?: string | null
  resolved_at?: string | null
  closed_at?: string | null
  created_at: string
  updated_at: string
  app?: App
  category?: { id: string; name: string; icon: string } | null
  subcategory?: { id: string; name: string } | null
  requester?: User
  assignee?: User | null
  messages?: Message[]
  status_history?: StatusHistoryEntry[]
  attachments?: Attachment[]
  _count?: { messages: number; attachments: number }
}

export interface Message {
  id: string
  ticket_id: string
  sender_id: string
  body: string
  message_type: MessageType
  is_internal: boolean
  created_at: string
  sender?: User
}

export interface StatusHistoryEntry {
  id: string
  from_status?: TicketStatus | null
  to_status: TicketStatus
  note?: string | null
  changed_at: string
  changed_by?: User
}

export interface Attachment {
  id: string
  ticket_id: string
  file_name: string
  file_url: string
  file_size: number
  mime_type: string
  created_at: string
  uploader?: { id: string; name: string }
}

export interface SlaConfig {
  id: string
  category_id?: string | null
  priority: TicketPriority
  first_response_hrs: number
  resolve_hrs: number
  is_active: boolean
  category?: { id: string; name: string; icon: string } | null
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  waiting_customer: 'Waiting',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const STATUS_COLORS: Record<TicketStatus, { bg: string; text: string; dot: string }> = {
  open:             { bg: '#EEF2FF', text: '#4F46E5', dot: '#6366F1' },
  in_progress:      { bg: '#EFF6FF', text: '#2563EB', dot: '#3B82F6' },
  waiting_customer: { bg: '#FFFBEB', text: '#B45309', dot: '#F59E0B' },
  resolved:         { bg: '#F0FDF4', text: '#15803D', dot: '#22C55E' },
  closed:           { bg: '#F1F5F9', text: '#475569', dot: '#94A3B8' },
}

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const PRIORITY_COLORS: Record<TicketPriority, { bg: string; text: string; dot: string }> = {
  critical: { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444' },
  high:     { bg: '#FFF7ED', text: '#C2410C', dot: '#F97316' },
  medium:   { bg: '#FFFBEB', text: '#B45309', dot: '#F59E0B' },
  low:      { bg: '#F0FDF4', text: '#15803D', dot: '#22C55E' },
}

export const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'resolved'],
  in_progress: ['waiting_customer', 'resolved'],
  waiting_customer: ['in_progress', 'resolved'],
  resolved: ['closed', 'open'],
  closed: ['open'],
}
