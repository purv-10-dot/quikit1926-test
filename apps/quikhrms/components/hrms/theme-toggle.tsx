"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { clsx } from "clsx";

const STORAGE_KEY = "hrms.theme";
type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "light";
    setTheme(stored);
    applyTheme(stored);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  };

  if (!mounted) {
    return <div className="w-9 h-9 rounded-lg bg-white/40 dark:bg-white/5 border border-gray-200 dark:border-white/10" />;
  }

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={clsx(
        "w-9 h-9 inline-flex items-center justify-center rounded-lg border shadow-sm transition",
        theme === "dark"
          ? "bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700"
          : "bg-white border-gray-300 text-slate-700 hover:bg-gray-50",
      )}
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
