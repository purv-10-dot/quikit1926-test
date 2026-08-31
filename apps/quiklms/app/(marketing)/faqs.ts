/**
 * Landing-page FAQ data.
 *
 * Lives in its own module (not `layout.tsx`) because Next.js App Router only
 * permits a fixed set of named exports from `layout`/`page` files — `metadata`,
 * `viewport`, `default`, etc. Exporting arbitrary data (`export { FAQS }`) from
 * the layout tripped Next's route-type check ("… does not satisfy the
 * constraint '{ [x: string]: never; }'"), which surfaces in the dev error
 * overlay. Both the layout (JSON-LD) and the page (`<Faq />`) import it here.
 *
 * `cat` drives the FAQ filter chips on the landing (see _components/Faq.tsx).
 * The JSON-LD in layout.tsx maps q/a only, so `cat` is inert for SEO.
 */
export const FAQS: { q: string; a: string; cat?: string }[] = [
  {
    cat: 'product',
    q: 'What is QuikLMS?',
    a: 'QuikLMS is a multi-tenant learning management system covering the full training lifecycle — authoring courses, delivering them through a SCORM-capable player, assessing with proctored quizzes and exams, issuing verifiable certificates, and reporting on progress and compliance.',
  },
  {
    cat: 'product',
    q: 'Does it work for schools as well as companies?',
    a: 'Yes. Each tenant is configured as either school or corporate, which changes the vocabulary and the modules on offer — batches, timetables, attendance and parent access for schools; course assignments, compliance windows and manager reporting for enterprises.',
  },
  {
    cat: 'assessment',
    q: 'How are assessments kept honest?',
    a: 'Quizzes can run under proctoring with fullscreen enforcement, tab-switch and copy-paste detection, and webcam face checks. Question order and the served subset are randomised per attempt and pinned server-side, so two learners sitting together do not see the same paper.',
  },
  {
    cat: 'certificates',
    q: 'Can certificates be verified by someone outside the organisation?',
    a: 'Every issued certificate carries a public verification URL and a QR code that resolves to it. An employer can confirm authenticity without an account, and the certificate is only downloadable when the learner actually met the passing criteria.',
  },
  {
    cat: 'content',
    q: 'What content formats are supported?',
    a: 'Video (uploaded, YouTube or Vimeo), audio, PDF, Word, Excel and PowerPoint documents, rich text, external links, embeds, and SCORM 1.2 / 2004 packages with progress tracked back into the learner record.',
  },
];
