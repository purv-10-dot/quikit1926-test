'use client'

import { useState, useMemo, useEffect } from 'react'
import { useHelpdesk } from '@/components/layout/HelpdeskProvider'
import { Modal, FormField, Input } from '@/components/ui/modal'
import { Avatar } from '@/components/ui/avatar'
import { MatIcon } from '@/lib/icons'
import type { Category, User, App } from '@/types'

// ─── Column system ─────────────────────────────────────────────────────────────
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
  { id: 'name',          label: 'Name',          width: 260, minWidth: 150, visible: true,  sortable: true,  frozen: true  },
  { id: 'description',   label: 'Description',   width: 240, minWidth: 120, visible: true,  sortable: false, frozen: false },
  { id: 'subcategories', label: 'Subcategories', width: 134, minWidth: 100, visible: true,  sortable: true,  frozen: false },
  { id: 'leads',         label: 'Leads',         width: 110, minWidth: 80,  visible: true,  sortable: true,  frozen: false },
  { id: 'agents',        label: 'Agents',        width: 100, minWidth: 80,  visible: true,  sortable: true,  frozen: false },
  { id: 'tickets',       label: 'Tickets',       width: 100, minWidth: 80,  visible: true,  sortable: true,  frozen: false },
  { id: 'actions',       label: '',              width: 160, minWidth: 130, visible: true,  sortable: false, frozen: false },
]

// ─── Sort icon ─────────────────────────────────────────────────────────────────
function SortIcon({ active, dir, accent }: { active: boolean; dir: 'asc' | 'desc'; accent: string }) {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
      stroke={active ? accent : 'rgba(0,0,0,0.2)'} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, transition: 'transform 0.15s', transform: active && dir === 'desc' ? 'rotate(180deg)' : 'none' }}
    >
      <polyline points="6 9 12 3 18 9"/><line x1="12" y1="3" x2="12" y2="21"/>
    </svg>
  )
}

// ─── Cell renderer ─────────────────────────────────────────────────────────────
function CatCell({ colId, category, accent, onEdit, onDelete, deleting }: {
  colId: string; category: Category; accent: string
  onEdit: () => void; onDelete: () => void; deleting: boolean
}) {
  const totalLeads  = category.agents.filter(a => a.is_lead).length
  const totalAgents = category.agents.filter(a => !a.is_lead).length

  switch (colId) {
    case 'name':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, background: `${accent}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <MatIcon name={category.icon} size={18} color={accent} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {category.name}
            </div>
          </div>
        </div>
      )

    case 'description':
      return category.description
        ? <span style={{ fontSize: 12.5, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{category.description}</span>
        : <span style={{ color: '#CBD5E1', fontSize: 13 }}>—</span>

    case 'subcategories':
      return category.subcategories.length > 0
        ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: `${accent}12`, color: accent,
          }}>
            {category.subcategories.length}
          </span>
        )
        : <span style={{ color: '#CBD5E1', fontSize: 13 }}>—</span>

    case 'leads':
      return totalLeads > 0
        ? <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{totalLeads}</span>
        : <span style={{ color: '#CBD5E1', fontSize: 13 }}>—</span>

    case 'agents':
      return totalAgents > 0
        ? <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{totalAgents}</span>
        : <span style={{ color: '#CBD5E1', fontSize: 13 }}>—</span>

    case 'tickets':
      return (category._count?.tickets ?? 0) > 0
        ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: '#F1F5F9', color: '#475569',
          }}>
            {category._count!.tickets}
          </span>
        )
        : <span style={{ color: '#CBD5E1', fontSize: 13 }}>0</span>

    case 'actions':
      return (
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <ActionBtn onClick={onEdit}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </ActionBtn>
          <ActionBtn onClick={onDelete} danger disabled={deleting}>
            {deleting
              ? '…'
              : (
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              )
            }
            {deleting ? 'Deleting' : 'Delete'}
          </ActionBtn>
        </div>
      )

    default: return null
  }
}

// ─── Inline expansion row ──────────────────────────────────────────────────────
function ExpansionRow({ category, colCount, cardBorder, accent, cardBg }: {
  category: Category; colCount: number; cardBorder: string; accent: string; cardBg: string
}) {
  const appIds = [...new Set(category.agents.map(a => a.app_id).filter(Boolean))] as string[]
  const appGroups = appIds.map(appId => {
    const group = category.agents.filter(a => a.app_id === appId)
    return {
      appId, app: group[0]?.app,
      lead: group.find(a => a.is_lead) || null,
      agents: group.filter(a => !a.is_lead),
    }
  })

  return (
    <tr>
      <td colSpan={colCount} style={{ padding: 0, borderBottom: `1px solid ${cardBorder}` }}>
        <div style={{ padding: '20px 24px 20px 32px', background: '#FAFBFF', display: 'grid', gridTemplateColumns: '200px 1fr', gap: 28 }}>

          {/* Subcategories */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              Subcategories
            </div>
            {category.subcategories.length === 0
              ? <span style={{ fontSize: 12, color: '#CBD5E1' }}>None configured</span>
              : category.subcategories.map(sub => (
                <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', padding: '5px 0', borderBottom: `1px solid ${cardBorder}` }}>
                  <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth={2} strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                  {sub.name}
                </div>
              ))
            }
          </div>

          {/* App assignments */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              App Assignments
            </div>
            {appGroups.length === 0
              ? <span style={{ fontSize: 12, color: '#CBD5E1' }}>No assignments configured</span>
              : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {appGroups.map(g => (
                    <div key={g.appId} style={{
                      background: cardBg, border: `1px solid ${cardBorder}`,
                      borderRadius: 10, padding: '12px 14px', minWidth: 180,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MatIcon name={g.app?.icon || 'apps'} size={16} />
                        {g.app?.name || 'Unknown App'}
                      </div>
                      {g.lead ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                          <span style={{ fontSize: 9, fontWeight: 800, color: accent, background: `${accent}18`, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Lead</span>
                          <Avatar user={g.lead.user} size={22} />
                          <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>{g.lead.user.name}</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: '#CBD5E1', marginBottom: 8, fontStyle: 'italic' }}>No lead assigned</div>
                      )}
                      {g.agents.map(a => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, paddingLeft: 2 }}>
                          <Avatar user={a.user} size={20} />
                          <span style={{ fontSize: 11, color: '#64748B' }}>{a.user.name}</span>
                        </div>
                      ))}
                      {g.agents.length === 0 && (
                        <div style={{ fontSize: 11, color: '#CBD5E1', paddingLeft: 2, fontStyle: 'italic' }}>No agents</div>
                      )}
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        </div>
      </td>
    </tr>
  )
}

// ─── Table row ─────────────────────────────────────────────────────────────────
function CatRow({ category, cols, expanded, onToggle, cardBg, cardBorder, accent, isLast, onEdit, onDelete, deleting }: {
  category: Category
  cols: (ColDef & { stickyLeft?: number })[]
  expanded: boolean; onToggle: () => void
  cardBg: string; cardBorder: string; accent: string; isLast: boolean
  onEdit: () => void; onDelete: () => void; deleting: boolean
}) {
  const [hov, setHov] = useState(false)

  return (
    <>
      <tr
        onClick={onToggle}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{ cursor: 'pointer', background: expanded ? `${accent}06` : hov ? `${cardBg}F0` : cardBg, transition: 'background 0.1s' }}
      >
        {cols.map((col, ci) => (
          <td
            key={col.id}
            style={{
              padding: '0 12px',
              height: 56,
              borderBottom: (isLast && !expanded) ? 'none' : `1px solid ${cardBorder}`,
              borderRight: col.frozen && col.stickyLeft !== undefined ? `1px solid ${cardBorder}` : undefined,
              borderLeft: ci === 0 ? `3px solid ${expanded ? accent : 'transparent'}` : undefined,
              position: col.frozen ? 'sticky' : undefined,
              left: col.frozen ? col.stickyLeft : undefined,
              zIndex: col.frozen ? 10 : undefined,
              background: expanded
                ? `${accent}06`
                : hov
                  ? `color-mix(in srgb, ${cardBg} 96%, ${accent} 4%)`
                  : cardBg,
              maxWidth: col.width,
              overflow: 'hidden',
              transition: 'background 0.1s, border-left-color 0.15s',
            }}
          >
            {col.id === 'name'
              ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CatCell colId={col.id} category={category} accent={accent} onEdit={onEdit} onDelete={onDelete} deleting={deleting} />
                  <svg
                    width={14} height={14} viewBox="0 0 24 24" fill="none"
                    stroke={expanded ? accent : '#CBD5E1'} strokeWidth={2} strokeLinecap="round"
                    style={{ flexShrink: 0, transition: 'transform 0.18s, stroke 0.18s', transform: expanded ? 'rotate(180deg)' : 'none', marginLeft: 4 }}
                  >
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </div>
              )
              : <CatCell colId={col.id} category={category} accent={accent} onEdit={onEdit} onDelete={onDelete} deleting={deleting} />
            }
          </td>
        ))}
      </tr>

      {expanded && (
        <ExpansionRow
          category={category}
          colCount={cols.length}
          cardBorder={cardBorder}
          accent={accent}
          cardBg={cardBg}
        />
      )}
    </>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────────
export function CategoriesView() {
  const { categories, refreshCategories, showToast, tenant, theme } = useHelpdesk()
  const accent = theme.accent || tenant?.accent || '#6366F1'

  const [search,      setSearch]      = useState('')
  const [cols,        setCols]        = useState<ColDef[]>(INIT_COLS)
  const [sortCol,     setSortCol]     = useState('name')
  const [sortDir,     setSortDir]     = useState<'asc' | 'desc'>('asc')
  const [colsOpen,    setColsOpen]    = useState(false)
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [editTarget,  setEditTarget]  = useState<Category | null>(null)
  const [deleting,    setDeleting]    = useState<string | null>(null)
  const [resizing,    setResizing]    = useState<{ id: string; startX: number; startW: number } | null>(null)
  const [dragCol,     setDragCol]     = useState<string | null>(null)
  const [dragOver,    setDragOver]    = useState<string | null>(null)

  // Column resize
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

  // Sticky left offsets for frozen columns
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

  // Drag-to-reorder columns
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

  // Filtered + sorted categories
  const filtered = useMemo(() => {
    let list = [...categories]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q))
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return list.sort((a, b) => {
      switch (sortCol) {
        case 'name':
          return dir * a.name.localeCompare(b.name)
        case 'subcategories':
          return dir * (a.subcategories.length - b.subcategories.length)
        case 'leads':
          return dir * (a.agents.filter(x => x.is_lead).length - b.agents.filter(x => x.is_lead).length)
        case 'agents':
          return dir * (a.agents.filter(x => !x.is_lead).length - b.agents.filter(x => !x.is_lead).length)
        case 'tickets':
          return dir * ((a._count?.tickets ?? 0) - (b._count?.tickets ?? 0))
        default:
          return dir * a.name.localeCompare(b.name)
      }
    })
  }, [categories, search, sortCol, sortDir])

  async function handleDelete(id: string) {
    if (!confirm('Delete this category?')) return
    setDeleting(id)
    try {
      const res  = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) { refreshCategories(); showToast('Category deleted') }
      else showToast(data.error || 'Failed', 'error')
    } catch { showToast('Failed', 'error') }
    setDeleting(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'inherit' }}>

      {/* ── Page header ── */}
      <div style={{
        padding: '20px 28px 0',
        background: theme.cardBg,
        borderBottom: `1px solid ${theme.cardBorder}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.3px' }}>Categories</h1>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0', fontWeight: 500 }}>
              {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} configured
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: accent, color: '#fff', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: `0 2px 10px ${accent}40`,
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Category
          </button>
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
        <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search categories…"
            style={{
              width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
              border: `1px solid ${theme.cardBorder}`, fontSize: 13, fontFamily: 'inherit',
              outline: 'none', color: '#0F172A', background: theme.mainBg,
            }}
          />
        </div>

        {search && (
          <button
            onClick={() => setSearch('')}
            style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: 'transparent', color: '#64748B', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Clear
          </button>
        )}

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
                {cols.filter(c => c.id !== 'actions').map(col => (
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
            <div style={{ fontSize: 48, lineHeight: 1 }}>📁</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#64748B' }}>
              {search ? 'No categories match your search' : 'No categories yet'}
            </div>
            <div style={{ fontSize: 13 }}>
              {search ? 'Try a different search term' : 'Create your first category to start routing tickets'}
            </div>
            {!search && (
              <button
                onClick={() => setShowCreate(true)}
                style={{ marginTop: 8, padding: '9px 20px', borderRadius: 9, border: 'none', background: accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                New Category
              </button>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
            <colgroup>
              {visibleCols.map(c => <col key={c.id} style={{ width: c.width }} />)}
            </colgroup>

            {/* Sticky header */}
            <thead>
              <tr>
                {visibleCols.map(col => {
                  const isSorted = sortCol === col.id
                  const isOver   = dragOver === col.id
                  return (
                    <th
                      key={col.id}
                      draggable={col.id !== 'actions'}
                      onDragStart={() => col.id !== 'actions' && onDragStart(col.id)}
                      onDragOver={e => onDragOver(e, col.id)}
                      onDrop={() => onDrop(col.id)}
                      onDragEnd={() => { setDragCol(null); setDragOver(null) }}
                      style={{
                        position: 'sticky',
                        top: 0,
                        left: col.frozen ? col.stickyLeft : undefined,
                        zIndex: col.frozen ? 30 : 20,
                        background: isOver ? `${accent}08` : theme.cardBg,
                        borderBottom: `2px solid ${theme.cardBorder}`,
                        borderRight: col.frozen && col.stickyLeft !== undefined ? `1px solid ${theme.cardBorder}` : undefined,
                        padding: 0,
                        userSelect: 'none',
                        transition: 'background 0.1s',
                        cursor: col.id !== 'actions' ? 'grab' : 'default',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', position: 'relative', height: 40 }}>
                        {col.sortable ? (
                          <button
                            onClick={() => toggleSort(col.id)}
                            style={{
                              flex: 1, display: 'flex', alignItems: 'center', gap: 5,
                              padding: '0 8px 0 12px', height: '100%',
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                              color: isSorted ? accent : '#94A3B8',
                              transition: 'color 0.12s',
                            }}
                          >
                            {col.label}
                            <SortIcon active={isSorted} dir={sortDir} accent={accent} />
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
                        {col.id !== 'actions' && (
                          <div
                            onMouseDown={e => {
                              e.stopPropagation(); e.preventDefault()
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
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {filtered.map((cat, i) => (
                <CatRow
                  key={cat.id}
                  category={cat}
                  cols={visibleCols}
                  expanded={expanded === cat.id}
                  onToggle={() => setExpanded(expanded === cat.id ? null : cat.id)}
                  cardBg={theme.cardBg}
                  cardBorder={theme.cardBorder}
                  accent={accent}
                  isLast={i === filtered.length - 1}
                  onEdit={() => setEditTarget(cat)}
                  onDelete={() => handleDelete(cat.id)}
                  deleting={deleting === cat.id}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: '8px 28px',
        background: theme.cardBg,
        borderTop: `1px solid ${theme.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>
          {filtered.length} categor{filtered.length !== 1 ? 'ies' : 'y'}
        </span>
        <span style={{ fontSize: 12, color: '#94A3B8' }}>
          Click a row to expand details · Drag headers to reorder · Drag edges to resize
        </span>
      </div>

      {/* ── Modals ── */}
      {(showCreate || editTarget) && (
        <CategoryModal
          category={editTarget}
          onClose={() => { setShowCreate(false); setEditTarget(null) }}
          onSaved={() => { setShowCreate(false); setEditTarget(null); refreshCategories() }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// ─── ActionBtn ─────────────────────────────────────────────────────────────────
function ActionBtn({ onClick, danger, disabled, children }: {
  onClick: () => void; danger?: boolean; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '5px 10px', borderRadius: 7,
      border: `1px solid ${danger ? '#FCA5A5' : '#E2E8F0'}`,
      background: danger ? '#FEF2F2' : '#F8FAFC',
      color: danger ? '#DC2626' : '#64748B',
      fontSize: 12, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 4,
      transition: 'all 0.1s', opacity: disabled ? 0.6 : 1,
    }}>
      {children}
    </button>
  )
}

// ─── CategoryModal ─────────────────────────────────────────────────────────────
interface AgentUser extends User { title?: string | null }
interface AppAssignment { app_id: string; lead_user_id: string; agent_ids: string[] }
interface CatForm {
  name: string; icon: string; description: string
  subcategories: { name: string; description: string }[]
  app_assignments: AppAssignment[]
}

const REMOVE_BTN: React.CSSProperties = {
  padding: '0 8px', height: 32, borderRadius: 7, border: '1px solid #FCA5A5',
  background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontSize: 14, flexShrink: 0,
}
const USER_SELECT: React.CSSProperties = {
  flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #E2E8F0',
  fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#1F2937', outline: 'none',
}

function CategoryModal({ category, onClose, onSaved, showToast }: {
  category: Category | null; onClose: () => void; onSaved: () => void
  showToast: (msg: string, type?: 'success' | 'error') => void
}) {
  const { apps, theme } = useHelpdesk()
  const [tab, setTab]           = useState<'details' | 'assignments'>('details')
  const [agentList, setAgentList] = useState<AgentUser[]>([])
  const [saving, setSaving]     = useState(false)
  const [nameError, setNameError] = useState('')
  const [form, setForm] = useState<CatForm>({
    name: category?.name || '', icon: category?.icon || 'folder',
    description: category?.description || '',
    subcategories: category?.subcategories.map(s => ({ name: s.name, description: s.description || '' })) || [],
    app_assignments: [],
  })

  useEffect(() => {
    if (!apps.length) return
    setForm(f => ({
      ...f,
      app_assignments: apps.map(app => ({
        app_id: app.id,
        lead_user_id: category?.agents.find(a => a.is_lead && a.app_id === app.id)?.user_id || '',
        agent_ids: category?.agents.filter(a => !a.is_lead && a.app_id === app.id).map(a => a.user_id) || [],
      })),
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps])

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(data => {
      if (data.success) setAgentList(data.data.filter((u: AgentUser) => ['HELPDESK_ADMIN', 'CATEGORY_LEAD', 'AGENT'].includes(u.role)))
    }).catch(() => {})
  }, [])

  function updateLead(appIndex: number, userId: string) {
    setForm(f => ({ ...f, app_assignments: f.app_assignments.map((a, i) => i === appIndex ? { ...a, lead_user_id: userId } : a) }))
  }
  function addAgent(appIndex: number) {
    setForm(f => ({ ...f, app_assignments: f.app_assignments.map((a, i) => i === appIndex ? { ...a, agent_ids: [...a.agent_ids, ''] } : a) }))
  }
  function updateAgent(appIndex: number, agentIndex: number, userId: string) {
    setForm(f => ({ ...f, app_assignments: f.app_assignments.map((a, i) => i === appIndex ? { ...a, agent_ids: a.agent_ids.map((id, j) => j === agentIndex ? userId : id) } : a) }))
  }
  function removeAgent(appIndex: number, agentIndex: number) {
    setForm(f => ({ ...f, app_assignments: f.app_assignments.map((a, i) => i === appIndex ? { ...a, agent_ids: a.agent_ids.filter((_, j) => j !== agentIndex) } : a) }))
  }
  function availableLeads(appIndex: number) {
    const a = form.app_assignments[appIndex]
    const usedAsAgent = new Set(a.agent_ids.filter(Boolean))
    return agentList.filter(u => u.id === a.lead_user_id || !usedAsAgent.has(u.id))
  }
  function availableAgents(appIndex: number, currentId: string) {
    const a = form.app_assignments[appIndex]
    const reserved = new Set([a.lead_user_id, ...a.agent_ids.filter(Boolean)])
    return agentList.filter(u => u.id === currentId || !reserved.has(u.id))
  }

  async function save() {
    if (!form.name.trim()) { setNameError('Name is required'); setTab('details'); return }
    setNameError('')
    setSaving(true)
    try {
      const url    = category ? `/api/categories/${category.id}` : '/api/categories'
      const method = category ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, icon: form.icon, description: form.description,
          subcategories: form.subcategories.filter(s => s.name.trim()),
          app_assignments: form.app_assignments.map(a => ({
            app_id: a.app_id, lead_user_id: a.lead_user_id || undefined,
            agent_ids: a.agent_ids.filter(Boolean),
          })),
        }),
      })
      const data = await res.json()
      if (data.success) { showToast(category ? 'Category updated' : 'Category created'); onSaved() }
      else showToast(data.error || 'Failed', 'error')
    } catch { showToast('Failed', 'error') }
    setSaving(false)
  }

  const accent = theme.accent || '#6366F1'

  const tabBtn = (key: 'details' | 'assignments', label: string, badge?: number) => {
    const active = tab === key
    return (
      <button
        onClick={() => setTab(key)}
        style={{
          padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: active ? 700 : 500,
          color: active ? accent : '#64748B',
          borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
          marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
          transition: 'color 0.12s',
        }}
      >
        {label}
        {badge !== undefined && badge > 0 && (
          <span style={{
            minWidth: 18, padding: '1px 5px', borderRadius: 20, fontSize: 10, fontWeight: 700, textAlign: 'center',
            background: active ? `${accent}18` : '#F1F5F9',
            color: active ? accent : '#94A3B8',
          }}>
            {badge}
          </span>
        )}
      </button>
    )
  }

  const footer = (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
      {tab === 'details' && (
        <button
          onClick={() => setTab('assignments')}
          style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          Assignments
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      )}
      {tab === 'assignments' && (
        <button
          onClick={() => setTab('details')}
          style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          Basic Info
        </button>
      )}
      <div style={{ flex: 1 }} />
      <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        Cancel
      </button>
      <button onClick={save} disabled={saving} style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1, boxShadow: `0 2px 8px ${accent}40` }}>
        {saving ? 'Saving…' : category ? 'Save Changes' : 'Create Category'}
      </button>
    </div>
  )

  return (
    <Modal title={category ? 'Edit Category' : 'New Category'} onClose={onClose} width={680} footer={footer}>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${theme.cardBorder}`, marginBottom: 20, marginTop: -4 }}>
        {tabBtn('details', 'Basic Info')}
        {tabBtn('assignments', 'App Assignments', form.app_assignments.length)}
      </div>

      {/* ── Tab: Basic Info ── */}
      {tab === 'details' && (
        <div>
          {/* Icon + Name + Description in one compact row */}
          <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Icon</label>
              <div style={{ position: 'relative' }}>
                <Input value={form.icon} onChange={v => setForm(f => ({ ...f, icon: v }))} placeholder="e.g. computer" style={{ paddingRight: 32, fontSize: 12 }} />
                <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                  <MatIcon name={form.icon || 'folder'} size={16} color="#94A3B8" />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <Input value={form.name} onChange={v => { setForm(f => ({ ...f, name: v })); setNameError('') }} placeholder="e.g. IT Support" error={!!nameError} />
                {nameError && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 3 }}>{nameError}</div>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Description</label>
                <Input value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Brief description of this category" />
              </div>
            </div>
          </div>

          {/* Subcategories */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Subcategories</label>
              <button
                onClick={() => setForm(f => ({ ...f, subcategories: [...f.subcategories, { name: '', description: '' }] }))}
                style={{ fontSize: 12, color: accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
              >+ Add</button>
            </div>

            {form.subcategories.length === 0 && (
              <div style={{ fontSize: 12, color: '#CBD5E1', padding: '10px 0', textAlign: 'center', border: '1px dashed #E2E8F0', borderRadius: 8 }}>
                No subcategories — click + Add to create one
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 220, overflowY: 'auto' }}>
              {form.subcategories.map((sub, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Input
                    value={sub.name}
                    onChange={v => setForm(f => ({ ...f, subcategories: f.subcategories.map((s, idx) => idx === i ? { ...s, name: v } : s) }))}
                    placeholder="Subcategory name"
                    style={{ flex: 1 }}
                  />
                  <Input
                    value={sub.description}
                    onChange={v => setForm(f => ({ ...f, subcategories: f.subcategories.map((s, idx) => idx === i ? { ...s, description: v } : s) }))}
                    placeholder="Description (optional)"
                    style={{ flex: 1.4 }}
                  />
                  <button onClick={() => setForm(f => ({ ...f, subcategories: f.subcategories.filter((_, idx) => idx !== i) }))} style={REMOVE_BTN}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: App Assignments ── */}
      {tab === 'assignments' && (
        <div>
          <p style={{ fontSize: 12, color: '#94A3B8', margin: '0 0 14px' }}>Set a category lead and agents for each app independently.</p>

          {form.app_assignments.length === 0 && (
            <div style={{ fontSize: 12, color: '#CBD5E1', textAlign: 'center', padding: 24 }}>Loading apps…</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {form.app_assignments.map((assignment, appIndex) => {
              const app      = apps.find(a => a.id === assignment.app_id)
              const leadUser = agentList.find(u => u.id === assignment.lead_user_id)
              return (
                <div key={assignment.app_id} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 10, overflow: 'hidden' }}>
                  {/* App header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#F8FAFC', borderBottom: `1px solid ${theme.cardBorder}` }}>
                    <MatIcon name={app?.icon || 'apps'} size={18} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{app?.name}</span>
                  </div>

                  <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Lead row */}
                    <div>
                      <label style={{ fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>Category Lead</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select value={assignment.lead_user_id} onChange={e => updateLead(appIndex, e.target.value)} style={USER_SELECT}>
                          <option value="">— No lead —</option>
                          {availableLeads(appIndex).map(u => (
                            <option key={u.id} value={u.id}>{u.name}{u.title ? ` · ${u.title}` : ''}</option>
                          ))}
                        </select>
                        {leadUser && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <Avatar user={leadUser} size={26} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{leadUser.name.split(' ')[0]}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Agents */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <label style={{ fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Agents</label>
                        <button onClick={() => addAgent(appIndex)} style={{ fontSize: 12, color: accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>+ Add</button>
                      </div>
                      {assignment.agent_ids.length === 0 && (
                        <div style={{ fontSize: 11, color: '#CBD5E1' }}>No agents assigned</div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {assignment.agent_ids.map((userId, agentIndex) => {
                          const u = agentList.find(x => x.id === userId)
                          return (
                            <div key={agentIndex} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <select value={userId} onChange={e => updateAgent(appIndex, agentIndex, e.target.value)} style={USER_SELECT}>
                                <option value="">— Select agent —</option>
                                {availableAgents(appIndex, userId).map(a => (
                                  <option key={a.id} value={a.id}>{a.name}{a.title ? ` · ${a.title}` : ''}</option>
                                ))}
                              </select>
                              {u && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 110, flexShrink: 0 }}>
                                  <Avatar user={u} size={24} />
                                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name.split(' ')[0]}</span>
                                </div>
                              )}
                              <button onClick={() => removeAgent(appIndex, agentIndex)} style={REMOVE_BTN}>✕</button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}
