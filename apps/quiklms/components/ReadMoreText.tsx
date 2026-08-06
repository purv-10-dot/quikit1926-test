'use client';
import { useState } from 'react';

interface ReadMoreTextProps {
  text: string;
  maxLength?: number;
  maxLines?: number;
  className?: string;
}

export function ReadMoreText({ text, maxLength = 150, maxLines: _maxLines, className }: ReadMoreTextProps) {
  void _maxLines;
  const [expanded, setExpanded] = useState(false);
  if (text.length <= maxLength) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {expanded ? text : `${text.slice(0, maxLength)}…`}
      <button
        onClick={() => setExpanded(!expanded)}
        className="ml-1 text-[var(--brand-primary)] text-xs font-medium hover:underline"
      >
        {expanded ? 'Read less' : 'Read more'}
      </button>
    </span>
  );
}
export default ReadMoreText;
