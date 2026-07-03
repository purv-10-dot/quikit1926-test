/**
 * src/lib/icons.tsx
 * Central icon utility using Google Material Symbols Outlined.
 *
 * The `icon` field in the DB can be either:
 *   - a legacy emoji  (📊, 👥, 💰 …)  ← existing rows from the seed
 *   - a material icon name  (bar_chart, people, payments …)  ← new rows
 *
 * `resolveIcon()` maps emoji → material name so both work transparently.
 */

import type { CSSProperties } from 'react'

// ─── Emoji → Material Symbols name ───────────────────────────────────────────
const EMOJI_TO_MATERIAL: Record<string, string> = {
  // App icons
  '📊': 'bar_chart',
  '👥': 'people',
  '💰': 'payments',
  // Category icons
  '💻': 'computer',
  '💬': 'chat',
  '📁': 'folder',
  // Ticket / misc
  '🎫': 'confirmation_number',
  // SLA state icons
  '✓':  'check_circle',
  '⏱':  'schedule',
  '⚠':  'warning',
  // Priority icons
  '⚡': 'bolt',
  '↑':  'arrow_upward',
  '–':  'remove',
  '↓':  'arrow_downward',
  // Priority dot emojis (CreateTicketModal)
  '🔴': 'circle',
  '🟠': 'circle',
  '🟡': 'circle',
  '🟢': 'circle',
  // Report tab icons
  '📈': 'trending_up',
}

/** Returns a material icon ligature name, resolving legacy emoji if needed. */
export function resolveIcon(icon: string): string {
  return EMOJI_TO_MATERIAL[icon] ?? icon
}

// ─── MatIcon component ────────────────────────────────────────────────────────
interface MatIconProps {
  name: string
  size?: number
  color?: string
  style?: CSSProperties
  className?: string
}

/**
 * Renders a single Google Material Symbol.
 * Accepts either a material icon name ("bar_chart") or a legacy emoji ("📊").
 */
export function MatIcon({ name, size = 18, color, style, className }: MatIconProps) {
  return (
    <span
      className={`material-symbols-outlined${className ? ` ${className}` : ''}`}
      style={{
        fontSize: size,
        color,
        lineHeight: 1,
        verticalAlign: 'middle',
        userSelect: 'none',
        flexShrink: 0,
        ...style,
      }}
    >
      {resolveIcon(name)}
    </span>
  )
}
