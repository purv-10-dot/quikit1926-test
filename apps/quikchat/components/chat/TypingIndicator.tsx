"use client";

import { Avatar } from "@/components/ui";

export interface TypingUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface TypingIndicatorProps {
  users: TypingUser[];
}

/**
 * "X is typing…" strip with stacked avatars + animated dots. Tokenised port of
 * the original QuikChat indicator (no gif/Tailwind): height is reserved at 0 and
 * the strip slides in when someone starts typing so the stream doesn't bounce.
 */
export function TypingIndicator({ users }: TypingIndicatorProps) {
  const active = users.length > 0;
  return (
    <div className="qc-typing" data-active={active} aria-live="polite">
      <div className="qc-typing__row">
        {active ? (
          <>
            <span className="qc-typing__avatars" aria-hidden>
              {users.slice(0, 3).map((u) => (
                <Avatar
                  key={u.id}
                  name={u.displayName}
                  id={u.id}
                  avatarUrl={u.avatarUrl}
                  size={22}
                />
              ))}
            </span>
            <span className="qc-typing__text">
              <span className="qc-typing__dots" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              {formatTypingSentence(users.map((u) => u.displayName))}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function formatTypingSentence(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]} are typing…`;
  const remaining = names.length - 2;
  return `${names[0]}, ${names[1]}, and ${remaining} others are typing…`;
}
