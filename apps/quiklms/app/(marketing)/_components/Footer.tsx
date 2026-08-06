'use client';

import { useEffect, useRef } from 'react';
import { BrandMark } from './Nav';

const STRIPS = 52;
const CELLS = 30;
const CELL_COLORS = ['#6366f1', '#8b5cf6', '#22d3ee', '#a5b4fc', '#818cf8', '#c4b5fd', '#38bdf8'];

const LINK_GROUPS = [
  {
    title: 'Product',
    links: [
      { href: '#platform', label: 'Platform' },
      { href: '#roles', label: 'Who it’s for' },
      { href: '#assessment', label: 'Assessment' },
      { href: '#journey', label: 'Journey' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '#faq', label: 'FAQ' },
      { href: '/verify-certificate', label: 'Verify a certificate' },
      { href: 'https://quikit.ai', label: 'Quikit' },
    ],
  },
  {
    title: 'Get started',
    links: [
      { href: '/login', label: 'Sign in' },
      { href: '#cta', label: 'Talk to us' },
    ],
  },
];

export default function Footer() {
  const boxesRef = useRef<HTMLDivElement>(null);
  const year = new Date().getFullYear();

  // Background grid lights cells on hover (delegated, pointer devices only).
  useEffect(() => {
    const boxes = boxesRef.current;
    if (!boxes || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    function onOver(e: PointerEvent) {
      const c = e.target as HTMLElement;
      if (!c.classList?.contains('b-cell')) return;
      c.style.transition = 'none';
      c.style.backgroundColor = CELL_COLORS[Math.floor(Math.random() * CELL_COLORS.length)];
    }
    function onOut(e: PointerEvent) {
      const c = e.target as HTMLElement;
      if (!c.classList?.contains('b-cell')) return;
      c.style.transition = 'background-color 1.8s ease';
      c.style.backgroundColor = '';
    }
    boxes.addEventListener('pointerover', onOver);
    boxes.addEventListener('pointerout', onOut);
    return () => {
      boxes.removeEventListener('pointerover', onOver);
      boxes.removeEventListener('pointerout', onOut);
    };
  }, []);

  return (
    <footer className="footer">
      <div className="boxes" ref={boxesRef} aria-hidden="true">
        {Array.from({ length: STRIPS }, (_, i) => (
          <div className="b-strip" key={i}>
            {Array.from({ length: CELLS }, (_, j) => (
              <div key={j} className="b-cell" />
            ))}
          </div>
        ))}
      </div>
      <div className="boxes-mask" aria-hidden="true" />
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <a href="#top" className="brand">
              <BrandMark />
              <span>
                Quik<b>Skill</b>
              </span>
            </a>
            <p className="desc">
              The LMS that runs training, assessment and compliance — for schools and enterprises, on
              one multi-tenant platform.
            </p>
          </div>
          {LINK_GROUPS.map((group) => (
            <div key={group.title}>
              <h5>{group.title}</h5>
              <ul>
                {group.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href}>{l.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <span>© {year} Quikit · QuikSkill. All rights reserved.</span>
          <div className="socials">
            <a href="https://quikit.ai" aria-label="Quikit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 1 0 5.6 18.3l1.7 1.7a1 1 0 0 0 1.4-1.4l-1.7-1.7A10 10 0 0 0 12 2Zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z" />
              </svg>
            </a>
            <a href="https://www.linkedin.com/company/quikit" aria-label="LinkedIn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4.98 3.5A2.5 2.5 0 1 1 0 3.5a2.5 2.5 0 0 1 4.98 0ZM0 8h5v16H0V8Zm7.5 0h4.8v2.2h.07c.67-1.2 2.3-2.5 4.73-2.5 5 0 5.9 3.3 5.9 7.6V24h-5v-7.3c0-1.7 0-4-2.4-4s-2.8 1.9-2.8 3.9V24h-5V8Z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
