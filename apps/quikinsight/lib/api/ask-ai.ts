import type { ChatMessage } from "@/types";

/**
 * POST /api/ask-ai { question } → { text, chart?, suggestions? }
 *
 * Real implementation: the server route grounds the answer in the user's live
 * aggregated metrics and calls Gemini. See app/api/ask-ai/route.ts. When
 * GEMINI_API_KEY isn't set the route returns a friendly in-chat message.
 */
export async function askAi(question: string): Promise<Omit<ChatMessage, "id" | "role">> {
  const res = await fetch("/api/ask-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    return { text: "Ask AI is unavailable right now. Please try again shortly." };
  }
  const data = (await res.json()) as Omit<ChatMessage, "id" | "role">;
  // Signal topbar to refresh the token chip.
  window.dispatchEvent(new Event("tokens-updated"));
  return data;
}

export const askAiBackendConfigured = true;
