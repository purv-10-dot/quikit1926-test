"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "success" | "warning" | "danger" | "info" | "neutral";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  (
    {
      className,
      variant = "info",
      size = "md",
      icon,
      children,
      ...props
    },
    ref
  ) => {
    const variantStyles = {
      success: "bg-success bg-opacity-10 text-success dark:bg-opacity-20",
      warning: "bg-warning bg-opacity-10 text-warning dark:bg-opacity-20",
      danger: "bg-danger bg-opacity-10 text-danger dark:bg-opacity-20",
      info: "bg-secondary bg-opacity-10 text-secondary dark:bg-opacity-20",
      neutral: "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300",
    };

    const sizeStyles = {
      sm: "px-2 py-1 text-xs font-medium",
      md: "px-3 py-1.5 text-sm font-medium",
      lg: "px-4 py-2 text-base font-semibold",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        {children}
      </div>
    );
  }
);

Badge.displayName = "Badge";

export { Badge };
