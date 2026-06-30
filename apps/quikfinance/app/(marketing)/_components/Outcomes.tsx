export default function Outcomes() {
  return (
    <section id="outcomes" className="surface-card section-card">
      <header className="section-header">
        <span className="section-eyebrow">The advantage</span>
        <h2 className="section-title">
          <span className="serif">The command centre for every invoice,</span>{" "}
          <span className="serif-bold">bill, and return.</span>
        </h2>
        <p className="section-lede">
          From the first quotation to a filed GST return — QuikFinance gives your finance
          team the visibility, speed, and control to close with confidence, every single
          month.
        </p>
      </header>

      <div className="outcomes-grid">
        <article className="outcome-card">
          <div className="outcome-stat">
            <span className="outcome-number">3×</span>
            <span className="outcome-unit">faster monthly close</span>
          </div>
          <h3 className="outcome-title serif-bold">Books that reconcile themselves</h3>
          <p className="outcome-body">
            Bank feeds, auto-matched payments, and live ledgers on one screen. No
            month-end spreadsheet scramble. No chasing receipts.
          </p>
        </article>

        <article className="outcome-card">
          <div className="outcome-stat">
            <span className="outcome-number">100%</span>
            <span className="outcome-unit">GST-ready</span>
          </div>
          <h3 className="outcome-title serif-bold">Nothing missed, nothing penalised</h3>
          <p className="outcome-body">
            Every invoice, bill, and credit note flows into GSTR-1 and 3B automatically.
            Full e-invoice and ITC tracking, reconciled to the portal.
          </p>
        </article>

        <article className="outcome-card">
          <div className="outcome-stat">
            <span className="outcome-number">&lt; 5</span>
            <span className="outcome-unit">days to first invoice</span>
          </div>
          <h3 className="outcome-title serif-bold">Up and running immediately</h3>
          <p className="outcome-body">
            Guided setup — chart of accounts, tax rates, and templates — means you raise
            your first compliant invoice within days, not weeks.
          </p>
        </article>
      </div>
    </section>
  );
}
