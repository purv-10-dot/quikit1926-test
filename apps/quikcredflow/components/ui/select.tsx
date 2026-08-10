import { forwardRef, type SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Apply the error state style (red border + tint). Drive from validation errors. */
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = "", error = false, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={`crm-input pr-8 ${error ? "crm-input-error" : ""} ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
});
