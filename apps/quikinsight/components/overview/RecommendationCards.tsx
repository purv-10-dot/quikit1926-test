"use client";
import { useRouter } from "next/navigation";
import type { Recommendation } from "@/types";

export default function RecommendationCards({ items }: { items: Recommendation[] }) {
  const router = useRouter();
  return (
    <div className="grid-3" style={{ marginBottom: 18 }}>
      {items.map((r) => (
        <div className="reco-card" key={r.id}>
          <div className="reco-icon">✦</div>
          <p className="reco-label">{r.label}</p>
          <p className="reco-body">{r.body}</p>
          <a className="link" onClick={() => router.push("/ask-ai?q=" + encodeURIComponent(r.suggestedQuestion))}>
            Ask AI about this →
          </a>
        </div>
      ))}
    </div>
  );
}
