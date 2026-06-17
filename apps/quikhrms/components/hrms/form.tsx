"use client";

import { forwardRef, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { clsx } from "clsx";

const baseField = "w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#16243A] focus:border-[#16243A] disabled:bg-gray-50 disabled:text-gray-500";
const errorField = "border-red-400 focus:ring-red-400 focus:border-red-400";

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}

export function FormField({ label, required, error, hint, className, children }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-gray-800 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p>
        : hint ? <p className="mt-1 text-[11px] text-gray-500">{hint}</p>
        : null}
    </div>
  );
}

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(function FormInput(
  { invalid, className, ...rest }, ref,
) {
  return <input ref={ref} {...rest} className={clsx(baseField, invalid && errorField, className)} />;
});

interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(function FormTextarea(
  { invalid, className, rows = 3, ...rest }, ref,
) {
  return <textarea ref={ref} rows={rows} {...rest} className={clsx(baseField, invalid && errorField, "resize-y", className)} />;
});

interface FormCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
}

export function FormCheckbox({ label, className, ...rest }: FormCheckboxProps) {
  return (
    <label className={clsx("inline-flex items-center gap-2 text-sm text-gray-800 select-none cursor-pointer", className)}>
      <input type="checkbox" {...rest}
        className="w-4 h-4 rounded border-gray-300 text-[#16243A] focus:ring-1 focus:ring-[#16243A]" />
      {label}
    </label>
  );
}

export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-center justify-end gap-2 pt-3", className)}>
      {children}
    </div>
  );
}

export const formInputClass = baseField;
export const formInputErrorClass = errorField;
