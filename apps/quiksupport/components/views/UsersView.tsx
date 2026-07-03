'use client'

/**
 * UsersView — RBAC admin panel
 *
 * Tabs:
 *   Users  — data-grid of UserMappings (who has which role, status, scope)
 *   Roles  — card list of system + tenant-custom roles with their permissions
 *
 * Follows the same ColDef grid pattern as CategoriesView / TicketList.
 * All API calls use the standard fetch (x-user-id injected by HelpdeskProvider).
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useHelpdesk } from '@/components/layout/HelpdeskProvider'
import { Modal, FormField, Input } from '@/components/ui/modal'

// ─── API types ────────────────────────────────────────────────────────────────

interface Mapping {
  id: string
  user_id: string
  tenant_id: string
  app_id: string
  role_id: string
  status: 'active' | 'inactive' | 'suspended'
  mode: 'integrated' | 'standalone'
  metadata: { name?: string; email?: string; avatar_url?: string } | null
  created_at: string
  updated_at: string
  role: { id: string; name: string; is_system: boolean }
}

interface Permission {
  id: string
  key: string           // e.g. "ticket.create"
  name: string
  description: string
  resource: string
  action: string
}

interface RoleWithPerms {
  id: string
  name: string
  description: string | null
  is_system: boolean
  is_active: boolean
  tenant_id: string | null
  role_permissions: Array<{ permission: Permission }>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, { bg: string; text: string; label: string }> = {
  active:    { bg: '#D1FAE5', text: '#065F46', label: 'Active' },
  inactive:  { bg: '#F1F5F9', text: '#475569', label: 'Inactive' },
  suspended: { bg: '#FEE2E2', text: '#991B1B', label: 'Suspended' },
}

const MODE_COLOR: Record<string, { bg: string; text: string }> = {
  integrated: { bg: '#EDE9FE', text: '#6D28D9' },
  standalone: { bg: '#FFF7ED', text: '#C2410C' },
}

// Permission resource → color
const RESOURCE_COLOR: Record<string, string> = {
  ticket: '#3B82F6',
  user:   '#8B5CF6',
  role:   '#F59E0B',
}

// ─── Icons ────────────────────────────────────────────────────────────────────

type IP = { c: string; size?: number }
const mk = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24' as const,
  fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
})

const IcoSearch    = ({ c, size = 15 }: IP) => <svg {...mk(size)} stroke={c} strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const IcoPlus      = ({ c, size = 15 }: IP) => <svg {...mk(size)} stroke={c} strokeWidth={2.2}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IcoLock      = ({ c, size = 13 }: IP) => <svg {...mk(size)} stroke={c} strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
const IcoEdit      = ({ c, size = 14 }: IP) => <svg {...mk(size)} stroke={c} strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IcoTrash     = ({ c, size = 14 }: IP) => <svg {...mk(size)} stroke={c} strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
const IcoChevron   = ({ c, size = 12 }: IP) => <svg {...mk(size)} stroke={c} strokeWidth={2.5}><polyline points="6 9 12 15 18 9"/></svg>
const IcoEye       = ({ c, size = 14 }: IP) => <svg {...mk(size)} stroke={c} strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
const IcoEyeOff    = ({ c, size = 14 }: IP) => <svg {...mk(size)} stroke={c} strokeWidth={2}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>

function SortIcon({ active, dir, accent }: { active: boolean; dir: 'asc' | 'desc'; accent: string }) {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
      stroke={active ? accent : 'rgba(0,0,0,0.2)'} strokeWidth={2.5}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, transition: 'transform 0.15s', transform: active && dir === 'desc' ? 'rotate(180deg)' : 'none' }}
    >
      <polyline points="6 9 12 3 18 9"/><line x1="12" y1="3" x2="12" y2="21"/>
    </svg>
  )
}

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
  { id: 'user',    label: 'User',    width: 220, minWidth: 150, visible: true,  sortable: true,  frozen: true  },
  { id: 'role',    label: 'Role',    width: 160, minWidth: 120, visible: true,  sortable: true,  frozen: false },
  { id: 'status',  label: 'Status',  width: 110, minWidth: 90,  visible: true,  sortable: true,  frozen: false },
  { id: 'mode',    label: 'Mode',    width: 120, minWidth: 90,  visible: true,  sortable: false, frozen: false },
  { id: 'app',     label: 'App',     width: 140, minWidth: 100, visible: true,  sortable: false, frozen: false },
  { id: 'created', label: 'Created', width: 120, minWidth: 90,  visible: true,  sortable: true,  frozen: false },
  { id: 'actions', label: '',        width: 170, minWidth: 140, visible: true,  sortable: false, frozen: false },
]

// ─── Assign Role Modal ────────────────────────────────────────────────────────

function AssignRoleModal({
  roles, onClose, onSaved,
}: {
  roles: RoleWithPerms[]
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useHelpdesk()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    user_id:   '',
    role_name: '',
    app_id:    '',
    mode:      'standalone' as 'integrated' | 'standalone',
    name:      '',
    email:     '',
  })

  const set = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }))

  async function handleSave() {
    if (!form.user_id.trim() || !form.role_name) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        user_id:   form.user_id.trim(),
        role_name: form.role_name,
        app_id:    form.app_id.trim(),
        mode:      form.mode,
      }
      if (form.name || form.email) {
        body.metadata = {
          ...(form.name  && { name:  form.name.trim()  }),
          ...(form.email && { email: form.email.trim() }),
        }
      }
      const res = await fetch('/api/user-mappings/assign-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      showToast(`Role '${form.role_name}' assigned to user`)
      onSaved()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Error assigning role', 'error')
    } finally {
      setSaving(false)
    }
  }

  const footer = (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#64748B', fontFamily: 'inherit' }}>
        Cancel
      </button>
      <button onClick={handleSave} disabled={!form.user_id.trim() || !form.role_name || saving}
        style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#6366F1', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', opacity: (!form.user_id.trim() || !form.role_name || saving) ? 0.5 : 1 }}>
        {saving ? 'Assigning…' : 'Assign Role'}
      </button>
    </div>
  )

  return (
    <Modal title="Assign Role to User" onClose={onClose} footer={footer} width={480}>
      <FormField label="Quikit User ID *" compact>
        <Input value={form.user_id} onChange={set('user_id')} placeholder="ext_user_abc123" />
      </FormField>
      <FormField label="Role *" compact>
        <select value={form.role_name} onChange={e => set('role_name')(e.target.value)}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 13, fontFamily: 'inherit', background: '#fff', color: form.role_name ? '#0F172A' : '#94A3B8', outline: 'none' }}>
          <option value="">Select a role…</option>
          {roles.map(r => (
            <option key={r.id} value={r.name}>{r.name}{r.is_system ? ' (system)' : ''}</option>
          ))}
        </select>
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="App Scope" compact>
          <Input value={form.app_id} onChange={set('app_id')} placeholder="(tenant-wide)" />
          <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 3 }}>Leave blank for tenant-wide</div>
        </FormField>
        <FormField label="Mode" compact>
          <select value={form.mode} onChange={e => set('mode')(e.target.value as 'integrated' | 'standalone')}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 13, fontFamily: 'inherit', background: '#fff', outline: 'none', color: '#0F172A' }}>
            <option value="standalone">Standalone</option>
            <option value="integrated">Integrated</option>
          </select>
        </FormField>
      </div>

      <div style={{ height: 1, background: '#F1F5F9', margin: '4px 0 8px' }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Optional metadata</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Display Name" compact>
          <Input value={form.name} onChange={set('name')} placeholder="Jane Doe" />
        </FormField>
        <FormField label="Email" compact>
          <Input value={form.email} onChange={set('email')} placeholder="jane@example.com" />
        </FormField>
      </div>
    </Modal>
  )
}

// ─── Change Role Modal ────────────────────────────────────────────────────────

function ChangeRoleModal({
  mapping, roles, onClose, onSaved,
}: {
  mapping: Mapping
  roles: RoleWithPerms[]
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useHelpdesk()
  const [roleId, setRoleId] = useState(mapping.role_id)
  const [saving, setSaving] = useState(false)

  const displayName = mapping.metadata?.name || mapping.user_id

  async function handleSave() {
    if (roleId === mapping.role_id) { onClose(); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/user-mappings/${mapping.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: roleId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      showToast('Role updated')
      onSaved()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to update role', 'error')
    } finally {
      setSaving(false)
    }
  }

  const footer = (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#64748B', fontFamily: 'inherit' }}>Cancel</button>
      <button onClick={handleSave} disabled={saving}
        style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#6366F1', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', opacity: saving ? 0.5 : 1 }}>
        {saving ? 'Saving…' : 'Update Role'}
      </button>
    </div>
  )

  return (
    <Modal title={`Change role for ${truncate(displayName, 24)}`} onClose={onClose} footer={footer} width={380}>
      <FormField label="New Role">
        <select value={roleId} onChange={e => setRoleId(e.target.value)}
          style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 13, fontFamily: 'inherit', background: '#fff', outline: 'none', color: '#0F172A' }}>
          {roles.map(r => (
            <option key={r.id} value={r.id}>{r.name}{r.is_system ? ' (system)' : ''}</option>
          ))}
        </select>
      </FormField>
    </Modal>
  )
}

// ─── Create / Edit Role Modal ─────────────────────────────────────────────────

function RoleModal({
  existing, allPermissions, onClose, onSaved,
}: {
  existing?: RoleWithPerms
  allPermissions: Permission[]
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useHelpdesk()
  const [activeTab, setActiveTab] = useState<'info' | 'perms'>('info')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name:        existing?.name        ?? '',
    description: existing?.description ?? '',
  })
  const [grantedKeys, setGrantedKeys] = useState<Set<string>>(
    () => new Set(existing?.role_permissions.map(rp => rp.permission.key) ?? [])
  )

  const set = (k: 'name' | 'description') => (v: string) => setForm(p => ({ ...p, [k]: v }))

  function togglePerm(key: string) {
    setGrantedKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      let roleId = existing?.id
      if (existing) {
        // Update basic info
        const res = await fetch(`/api/roles/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name.trim(), description: form.description.trim() || null }),
        })
        if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      } else {
        // Create role
        const res = await fetch('/api/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name.trim(), description: form.description.trim() || null }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed')
        roleId = data.data.id
      }

      // Sync permissions: grant new ones, revoke removed ones
      if (roleId) {
        const existingKeys = new Set(existing?.role_permissions.map(rp => rp.permission.key) ?? [])
        const toGrant = allPermissions.filter(p => grantedKeys.has(p.key) && !existingKeys.has(p.key))
        const toRevoke = allPermissions.filter(p => !grantedKeys.has(p.key) && existingKeys.has(p.key))

        await Promise.all([
          toGrant.length > 0 && fetch(`/api/roles/${roleId}/permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permission_ids: toGrant.map(p => p.id) }),
          }),
          ...toRevoke.map(p => fetch(`/api/roles/${roleId}/permissions`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permission_id: p.id }),
          })),
        ])
      }

      showToast(existing ? 'Role updated' : 'Role created')
      onSaved()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Error saving role', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Group permissions by resource
  const grouped = useMemo(() => {
    const g: Record<string, Permission[]> = {}
    for (const p of allPermissions) {
      ;(g[p.resource] ??= []).push(p)
    }
    return g
  }, [allPermissions])

  const footer = (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['info', 'perms'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
              background: activeTab === tab ? '#6366F1' : '#F1F5F9',
              color: activeTab === tab ? '#fff' : '#64748B',
            }}>
            {tab === 'info' ? 'Basic Info' : 'Permissions'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#64748B', fontFamily: 'inherit' }}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={!form.name.trim() || saving}
          style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#6366F1', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', opacity: (!form.name.trim() || saving) ? 0.5 : 1 }}>
          {saving ? 'Saving…' : existing ? 'Save Changes' : 'Create Role'}
        </button>
      </div>
    </div>
  )

  return (
    <Modal title={existing ? `Edit Role: ${existing.name}` : 'Create Custom Role'} onClose={onClose} footer={footer} width={480}>
      {activeTab === 'info' ? (
        <>
          <FormField label="Role Name *" compact>
            <Input value={form.name} onChange={set('name')} placeholder="e.g. Tier 2 Agent" />
          </FormField>
          <FormField label="Description" compact>
            <Input value={form.description} onChange={set('description')} placeholder="Optional description of this role's purpose" />
          </FormField>
          <div style={{ padding: '10px 14px', borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 12.5, color: '#64748B', lineHeight: 1.6 }}>
            <strong style={{ color: '#0F172A' }}>Note:</strong> Permissions are configured in the Permissions tab. Custom roles are tenant-specific and can be modified at any time.
          </div>
        </>
      ) : (
        <div>
          {Object.entries(grouped).map(([resource, perms]) => (
            <div key={resource} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: RESOURCE_COLOR[resource] || '#64748B', marginBottom: 8 }}>
                {resource}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {perms.map(p => (
                  <label key={p.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '6px 10px', borderRadius: 8, background: grantedKeys.has(p.key) ? `${RESOURCE_COLOR[resource] || '#6366F1'}0D` : 'transparent', border: `1px solid ${grantedKeys.has(p.key) ? `${RESOURCE_COLOR[resource] || '#6366F1'}30` : '#F1F5F9'}`, transition: 'all 0.12s' }}>
                    <input type="checkbox" checked={grantedKeys.has(p.key)} onChange={() => togglePerm(p.key)}
                      style={{ marginTop: 2, flexShrink: 0, accentColor: RESOURCE_COLOR[resource] || '#6366F1' }} />
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{p.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

// ─── Mapping cell renderer ────────────────────────────────────────────────────

function MappingCell({ colId, mapping, accent, onChangeRole, onToggleStatus, toggling }: {
  colId: string
  mapping: Mapping
  accent: string
  onChangeRole: () => void
  onToggleStatus: (next: 'active' | 'suspended') => void
  toggling: boolean
}) {
  const meta = mapping.metadata
  const displayName = meta?.name || mapping.user_id
  const email = meta?.email

  switch (colId) {
    case 'user':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: `${accent}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: accent }}>
            {initials(displayName)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {meta?.name ? meta.name : truncate(mapping.user_id, 18)}
            </div>
            {email && <div style={{ fontSize: 11, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>}
            {!email && meta?.name && <div style={{ fontSize: 10.5, color: '#CBD5E1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{truncate(mapping.user_id, 20)}</div>}
          </div>
        </div>
      )

    case 'role': {
      const col = RESOURCE_COLOR['ticket'] // use blue for roles
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${accent}15`, color: accent, maxWidth: '100%' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mapping.role.name}</span>
          {mapping.role.is_system && <IcoLock c={accent} size={10} />}
        </span>
      )
    }

    case 'status': {
      const s = STATUS_COLOR[mapping.status] || STATUS_COLOR.active
      return (
        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: s.bg, color: s.text, whiteSpace: 'nowrap' }}>
          {s.label}
        </span>
      )
    }

    case 'mode': {
      const m = MODE_COLOR[mapping.mode]
      return (
        <span style={{ padding: '2px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, background: m.bg, color: m.text, whiteSpace: 'nowrap' }}>
          {mapping.mode}
        </span>
      )
    }

    case 'app':
      return mapping.app_id
        ? <span style={{ fontSize: 12.5, color: '#0F172A', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{mapping.app_id}</span>
        : <span style={{ fontSize: 12, color: '#CBD5E1' }}>tenant-wide</span>

    case 'created':
      return <span style={{ fontSize: 12.5, color: '#64748B', whiteSpace: 'nowrap' }}>{fmtDate(mapping.created_at)}</span>

    case 'actions': {
      const isActive = mapping.status === 'active'
      const isSuspended = mapping.status === 'suspended'
      return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={e => { e.stopPropagation(); onChangeRole() }}
            style={{ padding: '4px 10px', borderRadius: 7, border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: '#475569', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
            <IcoEdit c="#475569" size={12} /> Role
          </button>
          <button onClick={e => { e.stopPropagation(); onToggleStatus(isActive ? 'suspended' : 'active') }}
            disabled={toggling}
            style={{ padding: '4px 10px', borderRadius: 7, border: `1.5px solid ${isActive ? '#FECACA' : '#D1FAE5'}`, background: isActive ? '#FEF2F2' : '#F0FDF4', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: isActive ? '#991B1B' : '#065F46', fontFamily: 'inherit', opacity: toggling ? 0.5 : 1 }}>
            {isActive ? 'Suspend' : 'Activate'}
          </button>
        </div>
      )
    }

    default:
      return null
  }
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ roles }: { roles: RoleWithPerms[] }) {
  const { theme, showToast } = useHelpdesk()
  const accent = theme.accent

  const [cols, setCols]       = useState<ColDef[]>(INIT_COLS)
  const [sortCol, setSortCol] = useState<string>('created')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterRole, setFilterRole]     = useState('')
  const [showColMenu, setShowColMenu]   = useState(false)
  const [showAssign, setShowAssign]     = useState(false)
  const [changeRoleFor, setChangeRoleFor] = useState<Mapping | null>(null)
  const [togglingId, setTogglingId]     = useState<string | null>(null)

  const [mappings, setMappings] = useState<Mapping[]>([])
  const [loading, setLoading]   = useState(true)

  const fetchMappings = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus) params.set('status', filterStatus)
      if (filterRole)   params.set('role_id', filterRole)
      const res  = await fetch(`/api/user-mappings${params.size ? '?' + params : ''}`)
      const data = await res.json()
      if (data.success) setMappings(data.data)
    } catch {
      showToast('Failed to load user mappings', 'error')
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterRole, showToast])

  useEffect(() => { fetchMappings() }, [fetchMappings])

  // Sort + filter
  const visible = useMemo(() => {
    const q = search.toLowerCase()
    let rows = mappings.filter(m => {
      if (!q) return true
      const name  = m.metadata?.name  || ''
      const email = m.metadata?.email || ''
      return m.user_id.toLowerCase().includes(q) || name.toLowerCase().includes(q) || email.toLowerCase().includes(q)
    })
    rows = [...rows].sort((a, b) => {
      let av = '', bv = ''
      if (sortCol === 'user')    { av = a.metadata?.name || a.user_id; bv = b.metadata?.name || b.user_id }
      if (sortCol === 'role')    { av = a.role.name;     bv = b.role.name }
      if (sortCol === 'status')  { av = a.status;        bv = b.status }
      if (sortCol === 'created') { av = a.created_at;    bv = b.created_at }
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
    return rows
  }, [mappings, search, sortCol, sortDir])

  const visibleCols = cols.filter(c => c.visible)

  // Resize
  const resizeRef = useRef<{ colId: string; startX: number; startW: number } | null>(null)
  function onResizeStart(colId: string, e: React.MouseEvent) {
    e.stopPropagation()
    const col = cols.find(c => c.id === colId)!
    resizeRef.current = { colId, startX: e.clientX, startW: col.width }
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      const dx = ev.clientX - resizeRef.current.startX
      setCols(prev => prev.map(c => c.id === resizeRef.current!.colId ? { ...c, width: Math.max(c.minWidth, resizeRef.current!.startW + dx) } : c))
    }
    const onUp = () => { resizeRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Sort click
  function onSort(colId: string) {
    if (sortCol === colId) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(colId); setSortDir('asc') }
  }

  async function toggleStatus(mapping: Mapping, next: 'active' | 'suspended') {
    setTogglingId(mapping.id)
    try {
      const res = await fetch(`/api/user-mappings/${mapping.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      showToast(`User ${next === 'active' ? 'activated' : 'suspended'}`)
      fetchMappings()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to update status', 'error')
    } finally {
      setTogglingId(null)
    }
  }

  // Drag-reorder
  const dragSrc = useRef<string | null>(null)
  function onDragStart(colId: string) { dragSrc.current = colId }
  function onDrop(targetId: string) {
    if (!dragSrc.current || dragSrc.current === targetId) return
    setCols(prev => {
      const arr = [...prev]
      const si  = arr.findIndex(c => c.id === dragSrc.current)
      const ti  = arr.findIndex(c => c.id === targetId)
      const [item] = arr.splice(si, 1)
      arr.splice(ti, 0, item)
      return arr
    })
    dragSrc.current = null
  }

  // Frozen left offset
  const frozenOffset = (colId: string): number | undefined => {
    const fc = visibleCols.filter(c => c.frozen)
    const i  = fc.findIndex(c => c.id === colId)
    if (i < 0) return undefined
    return fc.slice(0, i).reduce((s, c) => s + c.width, 0)
  }

  const thBase: React.CSSProperties = {
    padding: '0 12px', fontWeight: 700, fontSize: 11, color: '#94A3B8',
    textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
    background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
    userSelect: 'none', position: 'relative', height: 42,
  }
  const tdBase: React.CSSProperties = {
    padding: '0 12px', borderBottom: '1px solid #F1F5F9',
    height: 56, verticalAlign: 'middle', background: '#fff',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
        <div style={{ position: 'relative', flex: '0 0 220px' }}>
          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><IcoSearch c="#94A3B8" /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…"
            style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 13, fontFamily: 'inherit', background: '#fff', color: filterStatus ? '#0F172A' : '#94A3B8', outline: 'none' }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>

        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 13, fontFamily: 'inherit', background: '#fff', color: filterRole ? '#0F172A' : '#94A3B8', outline: 'none' }}>
          <option value="">All roles</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {/* Column visibility toggle */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowColMenu(v => !v)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#64748B', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
              Columns <IcoChevron c="#94A3B8" size={11} />
            </button>
            {showColMenu && (
              <>
                <div onClick={() => setShowColMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 99, background: '#fff', borderRadius: 10, border: '1.5px solid #E2E8F0', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', padding: '8px 4px', minWidth: 170 }}>
                  {cols.filter(c => c.id !== 'actions').map(c => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', borderRadius: 7 }}>
                      <input type="checkbox" checked={c.visible} onChange={() => setCols(prev => prev.map(col => col.id === c.id ? { ...col, visible: !col.visible } : col))} style={{ accentColor: accent }} />
                      <span style={{ fontSize: 12.5, color: '#0F172A' }}>{c.label}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <button onClick={() => setShowAssign(true)}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: accent, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
            <IcoPlus c="#fff" size={14} /> Assign Role
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#94A3B8', fontWeight: 600 }}>No users found</div>
            <div style={{ fontSize: 12.5, color: '#CBD5E1', marginTop: 4 }}>Assign a role to get started</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>{visibleCols.map(c => <col key={c.id} style={{ width: c.width }} />)}</colgroup>
            <thead>
              <tr>
                {visibleCols.map(col => {
                  const off = frozenOffset(col.id)
                  return (
                    <th key={col.id}
                      draggable onDragStart={() => onDragStart(col.id)} onDragOver={e => e.preventDefault()} onDrop={() => onDrop(col.id)}
                      onClick={() => col.sortable && onSort(col.id)}
                      style={{ ...thBase, width: col.width, cursor: col.sortable ? 'pointer' : 'default', ...(off !== undefined && { position: 'sticky', left: off, zIndex: 3 }) }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 2px' }}>
                        <span>{col.label}</span>
                        {col.sortable && <SortIcon active={sortCol === col.id} dir={sortDir} accent={accent} />}
                      </div>
                      {/* Resize handle */}
                      <span
                        onMouseDown={e => onResizeStart(col.id, e)}
                        onClick={e => e.stopPropagation()}
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 4 }}
                      />
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map(mapping => (
                <tr key={mapping.id} style={{ transition: 'background 0.12s' }}
                  onMouseEnter={e => { ;(e.currentTarget as HTMLElement).style.background = '#F8FAFC' }}
                  onMouseLeave={e => { ;(e.currentTarget as HTMLElement).style.background = '' }}
                >
                  {visibleCols.map(col => {
                    const off = frozenOffset(col.id)
                    return (
                      <td key={col.id} style={{ ...tdBase, width: col.width, overflow: 'hidden', ...(off !== undefined && { position: 'sticky', left: off, zIndex: 2, background: 'inherit', boxShadow: off !== undefined ? '1px 0 0 #E2E8F0' : undefined }) }}>
                        <MappingCell
                          colId={col.id}
                          mapping={mapping}
                          accent={accent}
                          onChangeRole={() => setChangeRoleFor(mapping)}
                          onToggleStatus={next => toggleStatus(mapping, next)}
                          toggling={togglingId === mapping.id}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Row count */}
      <div style={{ padding: '8px 20px', borderTop: '1px solid #F1F5F9', fontSize: 12, color: '#94A3B8', flexShrink: 0 }}>
        {visible.length} user{visible.length !== 1 ? 's' : ''}
      </div>

      {showAssign    && <AssignRoleModal roles={roles} onClose={() => setShowAssign(false)} onSaved={() => { setShowAssign(false); fetchMappings() }} />}
      {changeRoleFor && <ChangeRoleModal mapping={changeRoleFor} roles={roles} onClose={() => setChangeRoleFor(null)} onSaved={() => { setChangeRoleFor(null); fetchMappings() }} />}
    </div>
  )
}

// ─── Role Card ────────────────────────────────────────────────────────────────

function RoleCard({
  role, allPermissions, accent,
  onEdit, onDelete, deleting,
}: {
  role: RoleWithPerms
  allPermissions: Permission[]
  accent: string
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const perms = role.role_permissions.map(rp => rp.permission)
  const byResource: Record<string, Permission[]> = {}
  for (const p of perms) { (byResource[p.resource] ??= []).push(p) }

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #E2E8F0', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: '#0F172A' }}>{role.name}</span>
            {role.is_system && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 5, fontSize: 10.5, fontWeight: 700, background: '#F1F5F9', color: '#64748B' }}>
                <IcoLock c="#64748B" size={9} /> System
              </span>
            )}
            {!role.is_active && (
              <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 10.5, fontWeight: 700, background: '#FEE2E2', color: '#991B1B' }}>Inactive</span>
            )}
          </div>
          {role.description && (
            <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 4, lineHeight: 1.5 }}>{role.description}</div>
          )}
        </div>

        {/* Actions (custom roles only) */}
        {!role.is_system && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={onEdit}
              style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#475569', fontFamily: 'inherit' }}>
              <IcoEdit c="#475569" /> Edit
            </button>
            <button onClick={onDelete} disabled={deleting}
              style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid #FECACA', background: '#FEF2F2', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#991B1B', fontFamily: 'inherit', opacity: deleting ? 0.5 : 1 }}>
              <IcoTrash c="#991B1B" /> {deleting ? '…' : 'Delete'}
            </button>
          </div>
        )}
      </div>

      {/* Permission chips */}
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          Permissions ({perms.length})
        </div>
        {perms.length === 0 ? (
          <span style={{ fontSize: 12.5, color: '#CBD5E1', fontStyle: 'italic' }}>No permissions granted</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {perms.map(p => {
              const color = RESOURCE_COLOR[p.resource] || '#64748B'
              return (
                <span key={p.key} style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, background: `${color}14`, color, border: `1px solid ${color}25` }}>
                  {p.key}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Roles Tab ────────────────────────────────────────────────────────────────

function RolesTab({ allPermissions }: { allPermissions: Permission[] }) {
  const { showToast } = useHelpdesk()
  const [roles, setRoles]       = useState<RoleWithPerms[]>([])
  const [loading, setLoading]   = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleWithPerms | null>(null)
  const [deletingId, setDeletingId]   = useState<string | null>(null)

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/roles')
      const data = await res.json()
      if (data.success) setRoles(data.data)
    } catch {
      showToast('Failed to load roles', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { fetchRoles() }, [fetchRoles])

  async function handleDelete(role: RoleWithPerms) {
    if (!confirm(`Delete role "${role.name}"? Users with this role will lose access.`)) return
    setDeletingId(role.id)
    try {
      const res = await fetch(`/api/roles/${role.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      showToast(`Role "${role.name}" deleted`)
      fetchRoles()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to delete role', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const systemRoles = roles.filter(r => r.is_system)
  const customRoles = roles.filter(r => !r.is_system)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Roles</div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>System roles are read-only. Create custom roles with specific permission sets.</div>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ marginLeft: 'auto', padding: '7px 16px', borderRadius: 8, border: 'none', background: '#6366F1', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
          <IcoPlus c="#fff" size={14} /> Create Role
        </button>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: 13, padding: 40 }}>Loading…</div>
        ) : (
          <>
            {systemRoles.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>System Roles</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                  {systemRoles.map(r => (
                    <RoleCard key={r.id} role={r} allPermissions={allPermissions} accent="#6366F1"
                      onEdit={() => setEditingRole(r)} onDelete={() => handleDelete(r)} deleting={deletingId === r.id} />
                  ))}
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Custom Roles</div>
              {customRoles.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center', borderRadius: 12, border: '2px dashed #E2E8F0', color: '#94A3B8', fontSize: 13 }}>
                  No custom roles yet — create one to define fine-grained access
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                  {customRoles.map(r => (
                    <RoleCard key={r.id} role={r} allPermissions={allPermissions} accent="#6366F1"
                      onEdit={() => setEditingRole(r)} onDelete={() => handleDelete(r)} deleting={deletingId === r.id} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <RoleModal allPermissions={allPermissions} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchRoles() }} />
      )}
      {editingRole && (
        <RoleModal existing={editingRole} allPermissions={allPermissions} onClose={() => setEditingRole(null)} onSaved={() => { setEditingRole(null); fetchRoles() }} />
      )}
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function UsersView() {
  const { theme, currentUser } = useHelpdesk()
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users')
  const [roles, setRoles]         = useState<RoleWithPerms[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])

  // Preload roles + permissions (shared between tabs)
  useEffect(() => {
    fetch('/api/roles').then(r => r.json()).then(d => { if (d.success) setRoles(d.data) }).catch(() => {})
    fetch('/api/permissions').then(r => r.json()).then(d => { if (d.success) setPermissions(d.data) }).catch(() => {})
  }, [])

  const isAdmin = currentUser?.role === 'HELPDESK_ADMIN'
  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8', fontSize: 14 }}>
        Admin access required
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: theme.mainBg }}>
      {/* Page header */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0, background: theme.mainBg }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', marginBottom: 2 }}>
          Users &amp; Roles
        </div>
        <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 16 }}>
          Manage user role assignments and configure custom roles with fine-grained permissions
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E2E8F0' }}>
          {([
            { id: 'users', label: 'User Mappings' },
            { id: 'roles', label: 'Roles & Permissions' },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '9px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13, fontWeight: 600,
                color: activeTab === tab.id ? theme.accent : '#94A3B8',
                borderBottom: activeTab === tab.id ? `2px solid ${theme.accent}` : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.14s',
              }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'users'
          ? <UsersTab roles={roles} />
          : <RolesTab allPermissions={permissions} />
        }
      </div>
    </div>
  )
}
