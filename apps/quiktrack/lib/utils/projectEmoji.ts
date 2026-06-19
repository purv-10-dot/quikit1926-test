export const PROJECT_EMOJIS = [
  // Core
  "🚀","📁","📦","🎯","💡","📊","📈",

  // Development & Work
  "🧩","🛠️","⚙️","🧠","🎨","✏️","📝","📚",
  "🗂️","🗃️","🏗️","🧱","🧪","🧰",

  // Status & Progress
  "✅","✔️","☑️","⏳","⌛","🏁","📍",

  // Communication & Team
  "👥","🤝","💬","🗣️","📣",

  // Planning & Time
  "📅","🗓️","⏰","🕒",

  // Alerts & Priority
  "⚡","⚠️","❗","🚨",

  // Success & Goals
  "🏆","🥇","🎉","👏"
];

export function randomProjectEmoji(): string {
  return PROJECT_EMOJIS[Math.floor(Math.random() * PROJECT_EMOJIS.length)]!;
}
