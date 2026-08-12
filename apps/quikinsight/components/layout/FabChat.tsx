"use client";
import { useRouter } from "next/navigation";

export default function FabChat() {
  const router = useRouter();
  return (
    <button className="fab-chat" onClick={() => router.push("/ask-ai")} aria-label="Open Ask AI" type="button">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
