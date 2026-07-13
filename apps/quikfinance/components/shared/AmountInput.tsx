"use client";

import { Input, type InputProps } from "@/components/ui/input";

export function AmountInput(props: InputProps) {
  return <Input inputMode="decimal" className="text-right tabular-nums" placeholder="0.00" {...props} />;
}
