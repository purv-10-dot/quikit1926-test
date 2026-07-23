import { Eye, FileCheck, QrCode, Shuffle } from './icons';

const POINTS = [
  {
    Icon: Shuffle,
    title: 'Randomised per attempt',
    body: 'The served subset and its order are decided when the attempt starts and pinned server-side, so a refresh shows the same paper — and the person beside you does not.',
  },
  {
    Icon: Eye,
    title: 'Proctoring that reports',
    body: 'Fullscreen enforcement, tab-switch and copy-paste detection, and webcam face checks. Every incident is logged against the session for an administrator to review.',
  },
  {
    Icon: FileCheck,
    title: 'Scored on the server',
    body: 'Answers are graded against the exact question set the learner was shown, never a re-derived one. Attempt limits are enforced where they are defined.',
  },
  {
    Icon: QrCode,
    title: 'Verifiable on the outside',
    body: 'Certificates carry a QR code to a public verification page, and only become downloadable once the learner has genuinely met the passing criteria.',
  },
];

/**
 * Inset panel with its own mesh — the visual slot the QuikHRMS landing gives
 * to its Security section. Assessment integrity is the equivalent "why you can
 * trust the output" argument for an LMS, so it takes the same treatment.
 */
export default function Assessment() {
  return (
    <section className="section" id="assessment">
      <div className="wrap">
        <div className="panel-inset">
          <div className="mesh" aria-hidden="true">
            <span className="blob b1" />
            <span className="blob b2" />
          </div>
          <div
            className="section-head reveal"
            style={{ textAlign: 'left', margin: 0, maxWidth: '640px' }}
          >
            <span className="eyebrow">Assessment</span>
            <h2>
              A result that <span className="serif-italic gradient-text">means</span> something
            </h2>
            <p>
              A completion tick is easy to produce and easy to doubt. These are the parts that make a
              score defensible when someone asks.
            </p>
          </div>
          <div className="sec-grid">
            {POINTS.map((p, i) => (
              <div className="sec-item reveal" key={p.title} {...(i ? { 'data-d': String(i) } : {})}>
                <div className="s-ico">
                  <p.Icon />
                </div>
                <h4>{p.title}</h4>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
