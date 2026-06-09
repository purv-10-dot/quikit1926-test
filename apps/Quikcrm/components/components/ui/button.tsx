import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** `sm` is for dense action bars (toolbars, table headers); `md` is the default. */
  size?: Size;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "crm-btn-primary",
  secondary: "crm-btn-secondary",
  outline:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-crm-border bg-transparent px-4 py-2 text-sm font-medium text-crm-text shadow-sm transition hover:bg-crm-bg disabled:opacity-60",
  ghost: "crm-btn-ghost",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60",
};

// `sm` overrides the px/py from the variant utilities. `text-sm` and `text-xs`
// stay distinct so dense bars can still read at a glance.
const SIZE_CLASS: Record<Size, string> = {
  sm: "!px-2.5 !py-1.5 text-xs",
  md: "",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", className = "", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...rest}
    />
  );
});
