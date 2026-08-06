import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function Button({ variant = "secondary", className = "", children, ...rest }: ButtonProps) {
  const variantClass =
    variant === "primary"
      ? "qc-btn--primary"
      : variant === "ghost"
        ? "qc-btn--ghost"
        : variant === "danger"
          ? "qc-btn--danger"
          : "";
  return (
    <button type="button" className={`qc-btn ${variantClass} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}
