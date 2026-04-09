"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  initials?: string;
  size?: "sm" | "md" | "lg" | "xl";
  online?: boolean;
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      className,
      src,
      alt = "Avatar",
      initials,
      size = "md",
      online,
      ...props
    },
    ref
  ) => {
    const sizeStyles = {
      sm: "h-8 w-8 text-xs",
      md: "h-10 w-10 text-sm",
      lg: "h-12 w-12 text-base",
      xl: "h-16 w-16 text-lg",
    };

    const onlineIndicatorSize = {
      sm: "h-2 w-2",
      md: "h-2.5 w-2.5",
      lg: "h-3 w-3",
      xl: "h-4 w-4",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative inline-flex flex-shrink-0",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-gradient-to-br from-secondary to-secondary-dark text-white font-semibold",
            sizeStyles[size]
          )}
        >
          {src ? (
            <img
              src={src}
              alt={alt}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            initials || "?"
          )}
        </div>

        {online !== undefined && (
          <div
            className={cn(
              "absolute bottom-0 right-0 rounded-full border-2 border-white dark:border-neutral-800",
              onlineIndicatorSize[size],
              online ? "bg-success" : "bg-neutral-400"
            )}
          />
        )}
      </div>
    );
  }
);

Avatar.displayName = "Avatar";

export { Avatar };
