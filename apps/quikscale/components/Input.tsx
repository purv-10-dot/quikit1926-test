"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  helperText?: string;
  fullWidth?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      icon,
      iconPosition = "left",
      helperText,
      fullWidth = true,
      type = "text",
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <div className={cn(fullWidth && "w-full")}>
        {label && (
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            {label}
            {props.required && <span className="text-danger ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          {icon && iconPosition === "left" && (
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-secondary">
              {icon}
            </div>
          )}

          <input
            type={type}
            className={cn(
              "w-full px-4 py-2 rounded-lg border-2 border-border transition-colors duration-fast",
              "text-base text-text-primary placeholder-text-tertiary",
              "focus:outline-none focus:ring-2 focus:ring-offset-0",
              "disabled:bg-neutral-100 disabled:text-text-secondary disabled:cursor-not-allowed",
              "dark:disabled:bg-neutral-800",
              error
                ? "border-danger focus:ring-danger focus:border-danger"
                : "focus:border-primary focus:ring-primary",
              icon && iconPosition === "left" && "pl-10",
              icon && iconPosition === "right" && "pr-10",
              className
            )}
            disabled={disabled}
            ref={ref}
            {...props}
          />

          {icon && iconPosition === "right" && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-secondary">
              {icon}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-danger mt-1.5 font-medium">{error}</p>}
        {helperText && !error && (
          <p className="text-xs text-text-secondary mt-1.5">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
