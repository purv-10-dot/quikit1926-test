/**
 * Infinite marquee — the track is doubled so the CSS loop is seamless.
 *
 * The QuikHRMS original scrolls invented customer names. This scrolls what
 * QuikSkill actually ships instead: naming imaginary schools and employers as
 * customers on a live marketing page is a claim, not a decoration. Swap this
 * list for real logos once there are real ones to show.
 */
const CAPABILITIES = [
  'SCORM 1.2',
  'SCORM 2004',
  'Proctoring',
  'Question banks',
  'QR verification',
  'Batches',
  'Attendance',
  'Certificates',
  'Compliance windows',
  'Parent access',
];

export default function TrustMarquee() {
  return (
    <section className="trust">
      <div className="wrap">
        <p>One platform, everything between enrolment and evidence</p>
        <div className="marquee">
          <div className="marquee-track">
            {[...CAPABILITIES, ...CAPABILITIES].map((name, i) => (
              <span key={`${name}-${i}`}>{name}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
