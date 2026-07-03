'use client'

import { cn } from '@/lib/utils'
import type { HTMLAttributes } from 'react'

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-white rounded-2xl border border-slate-100 shadow-sm', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function StatCard({
  label,
  value,
  sub,
  color,
  icon,
  trend,
}: {
  label: string
  value: string | number
  sub?: string
  color: string
  icon: string
  trend?: { up: boolean; value: string }
}) {
  return (
    <div style={{
      flex: 1, minWidth: 160,
      background: '#fff', borderRadius: 16, border: '1px solid #F1F5F9',
      padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: `${color}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>{icon}</div>
        {trend && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            background: trend.up ? '#F0FDF4' : '#FEF2F2',
            color: trend.up ? '#15803D' : '#DC2626',
          }}>
            {trend.up ? '↑' : '↓'} {trend.value}
          </span>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', letterSpacing: '-1px', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
