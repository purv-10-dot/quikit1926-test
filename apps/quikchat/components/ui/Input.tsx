import * as React from "react";
import { Search } from "lucide-react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = "", ...rest },
  ref,
) {
  return <input ref={ref} className={`qc-input ${className}`.trim()} {...rest} />;
});

export type SearchInputProps = Omit<InputProps, "type">;

export function SearchInput({
  className = "",
  "aria-label": ariaLabel,
  ...rest
}: SearchInputProps) {
  return (
    <div className="qc-search">
      <Search size={14} aria-hidden />
      <Input type="search" aria-label={ariaLabel ?? "Search"} className={className} {...rest} />
    </div>
  );
}
