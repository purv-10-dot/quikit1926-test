"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      icon,
      iconPosition = "left",
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    // Base styles
    const baseStyles =
      "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

    // Size variants
    const sizeStyles = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2 text-base",
      lg: "px-6 py-3 text-lg",
    };

    // Color variants
    const variantStyles = {
      primary:
        "bg-primary text-white hover:bg-primary-dark focus:ring-primary disabled:bg-primary",
      secondary:
        "bg-secondary text-white hover:bg-secondary-dark focus:ring-secondary disabled:bg-secondary",
      outline:
        "border-2 border-primary text-primary hover:bg-primary hover:text-white focus:ring-primary disabled:border-gray-300 disabled:text-gray-400",
      ghost:
        "text-primary hover:bg-primary hover:bg-opacity-10 focus:ring-primary",
      danger:
        "bg-danger text-white hover:bg-red-700 focus:ring-danger disabled:bg-danger",
    };

    // Focus ring offset color
    const focusRingOffset = {
      primary: "focus:ring-offset-white dark:focus:ring-offset-neutral-900",
      secondary: "focus:ring-offset-white dark:focus:ring-offset-neutral-900",
      outline: "focus:ring-offset-white dark:focus:ring-offset-neutral-900",
      ghost: "focus:ring-offset-white dark:focus:ring-offset-neutral-900",
      danger: "focus:ring-offset-white dark:focus:ring-offset-neutral-900",
    };

    const combinedClass = cn(
      baseStyles,
      sizeStyles[size],
      variantStyles[variant],
      focusRingOffset[variant],
      fullWidth && "w-full",
      className
    );

    return (
      <button
        className={combinedClass}
        disabled={disabled || isLoading}
        ref={ref}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {children}
          </>
        ) : (
          <>
            {icon && iconPosition === "left" && icon}
            {children}
            {icon && iconPosition === "right" && icon}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
