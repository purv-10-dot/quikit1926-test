/**
 * Pure-flow spacer that adds scroll length between sections.
 * No content, no z-index — just vertical space.
 */
export default function Spacer({ vh = 1, ariaHidden = true }) {
  return (
    <div
      aria-hidden={ariaHidden}
      style={{ height: `${vh * 100}vh`, width: "100%" }}
    />
  );
}
