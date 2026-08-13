import type { ReactNode } from "react";

interface Props {
  tone?: "green" | "red" | "neutral";
  children: ReactNode;
}

export default function Pill({ tone = "neutral", children }: Props) {
  const cls = tone === "green" ? "pill pill-green" : tone === "red" ? "pill pill-red" : "pill pill-neutral";
  return <span className={cls}>{children}</span>;
}
