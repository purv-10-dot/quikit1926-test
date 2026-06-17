/** Pick a pipeline stage label for won/lost intents (tenant-configured names). */
export function resolvePipelineStage(
  stages: string[],
  intent: "won" | "lost",
): string | null {
  if (stages.length === 0) return null;

  const preferred =
    intent === "won"
      ? ["won", "closed won", "converted", "closed-won", "sale"]
      : ["lost", "closed lost", "disqualified", "closed-lost", "dead"];

  const lowerMap = new Map(stages.map((s) => [s.toLowerCase(), s]));
  for (const p of preferred) {
    const exact = lowerMap.get(p);
    if (exact) return exact;
  }

  const pattern = intent === "won" ? /won|convert/i : /lost|disqual|dead/i;
  return stages.find((s) => pattern.test(s)) ?? null;
}
