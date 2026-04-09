"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}

const Dropdown = React.forwardRef<
  HTMLDivElement,
  DropdownProps
>(({ trigger, children, align = "right", className }, ref) => {
  const [open, setOpen] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <div
        onClick={() => setOpen(!open)}
        className="cursor-pointer"
      >
        {trigger}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={contentRef}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute top-full mt-2 z-dropdown bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-border dark:border-neutral-700 min-w-max",
              align === "right" ? "right-0" : "left-0"
            )}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

Dropdown.displayName = "Dropdown";

interface DropdownItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  dangerous?: boolean;
}

const DropdownItem = React.forwardRef<HTMLButtonElement, DropdownItemProps>(
  ({ className, icon, dangerous = false, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "w-full px-4 py-2 text-left text-sm font-medium transition-colors duration-fast",
        "flex items-center gap-2 hover:bg-neutral-50 dark:hover:bg-neutral-700",
        "focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary",
        dangerous
          ? "text-danger hover:bg-danger hover:bg-opacity-10"
          : "text-text-primary",
        className
      )}
      {...props}
    >
      {icon && <span className="text-base">{icon}</span>}
      {children}
    </button>
  )
);

DropdownItem.displayName = "DropdownItem";

interface DropdownSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {}

const DropdownSeparator = React.forwardRef<HTMLDivElement, DropdownSeparatorProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("my-1 h-px bg-border dark:bg-neutral-700", className)}
      {...props}
    />
  )
);

DropdownSeparator.displayName = "DropdownSeparator";

interface DropdownGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
}

const DropdownGroup = React.forwardRef<HTMLDivElement, DropdownGroupProps>(
  ({ className, label, children, ...props }, ref) => (
    <div ref={ref} className={cn("overflow-hidden", className)} {...props}>
      {label && (
        <div className="px-4 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {label}
        </div>
      )}
      {children}
    </div>
  )
);

DropdownGroup.displayName = "DropdownGroup";

export {
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  DropdownGroup,
};
