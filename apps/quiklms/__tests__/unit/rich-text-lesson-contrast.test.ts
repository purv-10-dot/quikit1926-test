/**
 * Regression: a rich-text lesson's title was invisible to learners.
 *
 * The report was "the rich text title is not visible at all". The data was
 * fine at every layer — the resource stores `title`, `transformMasterCourseForPlayer`
 * maps it onto the lesson, and both learner players render
 * `{currentLesson.title}`. Nothing was dropped.
 *
 * The cause was contrast. `UniversalLMSPlayer` hard-codes `isCorporate = true`,
 * so the shell renders `bg-gray-50` and the player area `bg-gray-100`. The
 * rich-text card had never been converted from the player's original dark
 * theme: a `text-white` heading inside a `bg-white/5` card with a
 * `prose-invert` body. White on near-white reads as absent, not as
 * low-contrast — hence "not visible at all" rather than "hard to read".
 *
 * This is asserted as source-level invariants rather than by rendering, because
 * mounting UniversalLMSPlayer means booting a 4,000-line component with SCORM
 * bridges, media players and camera proctoring. The invariants are narrow and
 * describe the defect precisely: no unconditional light-on-light text in the
 * rich-text path, and one shared definition of each palette.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(process.cwd(), 'components/learner/UniversalLMSPlayer.tsx'),
  'utf8',
);

describe('rich-text lesson rendering', () => {
  it('never hard-codes a white lesson title', () => {
    // The exact string that made the title invisible.
    expect(SRC).not.toContain('text-2xl font-bold text-white mb-4">{currentLesson.title}');
  });

  it('themes every lesson-title heading against the surface', () => {
    // Each `{currentLesson.title}` heading must pick its colour from
    // isCorporate rather than assuming a dark background.
    const headings = SRC.match(/<h2[^>]*>\{currentLesson\.title\}<\/h2>/g) ?? [];
    expect(headings.length).toBeGreaterThan(0);
    for (const h of headings) {
      expect(h).toContain('isCorporate');
    }
  });

  it('leaves no inline prose-invert body in the rich-text path', () => {
    // prose-invert is light-on-dark. On the corporate surface it rendered the
    // body invisible too, alongside the title.
    expect(SRC).not.toContain('className="prose prose-invert prose-lg');
  });

  it('defines each prose palette exactly once, so the two call sites cannot drift', () => {
    expect((SRC.match(/const RICH_TEXT_PROSE_LIGHT =/g) ?? []).length).toBe(1);
    expect((SRC.match(/const RICH_TEXT_PROSE_DARK =/g) ?? []).length).toBe(1);
  });

  it('uses the shared palettes at both rich-text call sites', () => {
    // The `Text` branch and the any-lesson-with-HTML fallback.
    const uses = SRC.match(/isCorporate \? RICH_TEXT_PROSE_LIGHT : RICH_TEXT_PROSE_DARK/g) ?? [];
    expect(uses.length).toBe(2);
  });

  it('keeps the dark palette available rather than deleting it', () => {
    // isCorporate is hard-coded true today, but flipping it back must not
    // silently re-break the light path — or leave the dark one unstyled.
    expect(SRC).toContain('prose-invert');
    expect(SRC).toContain("isCorporate ? 'text-gray-900' : 'text-white'");
  });

  it('gives the rich-text card an opaque surface on the light theme', () => {
    // bg-white/5 is 5% white — effectively invisible on bg-gray-100.
    expect(SRC).toContain("'bg-white border border-gray-200 rounded-2xl p-8 shadow-sm'");
  });
});
