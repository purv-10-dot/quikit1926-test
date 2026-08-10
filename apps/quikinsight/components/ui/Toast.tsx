"use client";
import { useEffect } from "react";
import { useToastStore } from "@/store/useToastStore";

export default function Toast() {
  const { message, clear } = useToastStore();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(clear, 2600);
    return () => clearTimeout(timer);
  }, [message, clear]);

  return (
    <div className={`toast${message ? " show" : ""}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
