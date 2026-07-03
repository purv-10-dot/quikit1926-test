'use client'

import { getInitials } from '@/lib/utils'

interface AvatarProps {
  user: { name: string; avatar_url?: string | null; color?: string | null }
  size?: number
}

export function Avatar({ user, size = 32 }: AvatarProps) {
  const color = user.color || '#6366F1'

  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, ${color}, ${color}CC)`,
      color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
      letterSpacing: '-0.5px',
      boxShadow: `0 2px 6px ${color}33`,
    }}>
      {getInitials(user.name)}
    </div>
  )
}
