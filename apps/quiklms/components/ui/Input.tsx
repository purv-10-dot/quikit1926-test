import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visible label (never placeholder-only — per forms accessibility rules). */
  label?: string;
  /** Persistent helper text below the field. */
  hint?: string;
  /** Error message; sets aria-invalid and is announced to screen readers. */
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className, required, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-fg">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-11 w-full rounded-md border bg-surface px-3 text-sm text-fg', // 44px height
          'placeholder:text-fg-subtle',
          'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
          error ? 'border-danger' : 'border-line-strong',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-err`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
