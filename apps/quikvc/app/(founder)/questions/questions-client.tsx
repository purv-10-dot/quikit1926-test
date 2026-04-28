"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Question {
  id: string;
  question: string;
  answer: string | null;
  status: string;
  createdAt: string;
  answeredAt: string | null;
}

export default function QuestionsClient({ questions }: { questions: Question[] }) {
  const router = useRouter();
  const [answering, setAnswering] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitAnswer(questionId: string) {
    const answer = drafts[questionId]?.trim();
    if (!answer) return;
    setSubmitting(questionId);
    setError(null);
    try {
      const res = await fetch("/api/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, answer }),
      });
      const j = await res.json();
      if (!j.success) {
        setError(j.error ?? "Submission failed");
      } else {
        setAnswering(null);
        setDrafts((d) => {
          const { [questionId]: _, ...rest } = d;
          return rest;
        });
        router.refresh();
      }
    } finally {
      setSubmitting(null);
    }
  }

  if (questions.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
        <p className="text-sm text-gray-500">No questions yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      {questions.map((q) => {
        const isOpen = q.status === "open";
        const isAnswering = answering === q.id;
        return (
          <div
            key={q.id}
            className="bg-white border border-gray-200 rounded-xl p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-gray-900 flex-1">{q.question}</p>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${
                  isOpen
                    ? "bg-amber-100 text-amber-700 border-amber-200"
                    : "bg-green-100 text-green-700 border-green-200"
                }`}
              >
                {isOpen ? "Awaiting answer" : "Answered"}
              </span>
            </div>
            <p className="text-[10px] text-gray-400">
              Asked {new Date(q.createdAt).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>

            {q.answer ? (
              <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs uppercase tracking-wider text-blue-700 mb-1">
                  Your answer
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{q.answer}</p>
              </div>
            ) : isAnswering ? (
              <div className="mt-2 space-y-2">
                <textarea
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="Your answer…"
                  value={drafts[q.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAnswering(null)}
                    className="text-xs px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={submitting === q.id}
                    onClick={() => submitAnswer(q.id)}
                    className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting === q.id ? "Submitting…" : "Submit answer"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAnswering(q.id)}
                className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg"
              >
                Answer this question
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
