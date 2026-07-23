'use client';

import { useEffect, useRef, useState } from 'react';

export interface FaqEntry {
  q: string;
  a: string;
  /** Filter bucket. Optional so the JSON-LD in layout.tsx stays q/a-only. */
  cat?: string;
}

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'product', label: 'Product' },
  { key: 'assessment', label: 'Assessment' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'content', label: 'Content' },
];

function FaqItem({
  q,
  a,
  open,
  onToggle,
  hidden,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
  hidden: boolean;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // The max-height animation needs the rendered scrollHeight, so it's imperative.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.style.maxHeight = open ? body.scrollHeight + 'px' : '';
  }, [open]);

  return (
    <div className={`faq-item${open ? ' open' : ''}`} style={hidden ? { display: 'none' } : undefined}>
      <button className="faq-q" onClick={onToggle} aria-expanded={open}>
        <span className="faq-t">{q}</span>
        <span className="faq-toggle" aria-hidden="true">
          <i />
          <i />
        </span>
      </button>
      <div className="faq-a" ref={bodyRef}>
        <p>{a}</p>
      </div>
    </div>
  );
}

export default function Faq({ items }: { items: FaqEntry[] }) {
  const [cat, setCat] = useState('all');
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  // Only offer a filter chip when something is actually tagged with it —
  // an empty category reads as a broken filter.
  const present = new Set(items.map((i) => i.cat).filter(Boolean));
  const cats = CATEGORIES.filter((c) => c.key === 'all' || present.has(c.key));
  const anyVisible = items.some((item) => cat === 'all' || item.cat === cat);

  return (
    <section className="section" id="faq">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">FAQ</span>
          <h2>
            Questions people actually <span className="serif-italic gradient-text">ask</span>
          </h2>
          <p>The things worth knowing before bringing QuikSkill to your organisation.</p>
        </div>

        <div className="faq2 reveal" data-d="1">
          {cats.length > 1 && (
            <div className="faq2-cats">
              {cats.map((c) => (
                <button
                  key={c.key}
                  className={`faq2-cat${cat === c.key ? ' active' : ''}`}
                  onClick={() => setCat(c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <div className="faq2-list">
            {items.map((item, i) => (
              <FaqItem
                key={item.q}
                q={item.q}
                a={item.a}
                open={openIdx === i}
                onToggle={() => setOpenIdx(openIdx === i ? null : i)}
                hidden={cat !== 'all' && item.cat !== cat}
              />
            ))}
          </div>
          {!anyVisible && <p className="faq2-foot">No questions match — try a different topic.</p>}
          <p className="faq2-foot">
            Ready to start? <a href="/login">Sign in to QuikSkill →</a>
          </p>
        </div>
      </div>
    </section>
  );
}
