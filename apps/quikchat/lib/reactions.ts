/** Fixed quick-reaction palette (ported from the reference) + human labels. */
export const QUICK_REACTIONS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🎉",
  "🔥",
  "👏",
  "🙏",
  "😍",
  "🤔",
  "🤯",
  "💯",
  "✅",
] as const;

export const EMOJI_NAMES: Record<string, string> = {
  "👍": "Thumbs up",
  "❤️": "Heart",
  "😂": "Joy",
  "😮": "Surprised",
  "😢": "Sad",
  "🎉": "Party",
  "🔥": "Fire",
  "👏": "Clap",
  "🙏": "Pray",
  "😍": "Heart eyes",
  "🤔": "Thinking",
  "🤯": "Mind blown",
  "💯": "100",
  "✅": "Check",
};

export function emojiName(emoji: string): string {
  return EMOJI_NAMES[emoji] ?? "Reaction";
}

/**
 * "You" · "You and Bob" · "You, Bob and 3 others" — self first. Mirrors the
 * reference's reactor-card summary, used for the inline label and aria text.
 */
export function reactorSummary(
  userIds: string[],
  nameById: Map<string, string>,
  meId: string | undefined,
): string {
  const names = [...userIds]
    .sort((a, b) => Number(b === meId) - Number(a === meId))
    .map((id) => (id === meId ? "You" : (nameById.get(id) ?? "Unknown")));
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} other${rest === 1 ? "" : "s"}`;
}
