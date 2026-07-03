'use client'

import { cn } from '@/lib/utils'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  icon?: string
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', icon, children, className, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center gap-2 font-semibold rounded-lg border transition-all cursor-pointer font-[inherit] disabled:opacity-50 disabled:cursor-not-allowed'

    const variants = {
      primary: 'bg-slate-900 text-white border-transparent hover:bg-slate-800',
      secondary: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
      ghost: 'bg-transparent text-slate-500 border-transparent hover:bg-slate-100',
      danger: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100',
      success: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
    }

    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-5 py-2.5 text-base',
    }

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      >
        {icon && <span>{icon}</span>}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
