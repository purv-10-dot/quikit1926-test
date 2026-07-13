export interface ImportedTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  transaction_type: "credit" | "debit";
  reference?: string | null;
}

export interface BookTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  transaction_type: "credit" | "debit";
  reference?: string | null;
  entity_type?: string;
  entity_id?: string;
}

export interface MatchCandidate {
  bookTxId: string;
  score: number;
  reasons: string[];
}

const AMOUNT_TOLERANCE = 0.01;
const DATE_WINDOW_DAYS = 3;

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
}

function normalizeRef(ref: string | null | undefined): string {
  return (ref ?? "").replace(/\s/g, "").toLowerCase();
}

/**
 * Scores how well a book transaction matches an imported transaction.
 * Higher score = better match.
 */
function scoreMatch(imported: ImportedTransaction, book: BookTransaction): MatchCandidate | null {
  if (imported.transaction_type !== book.transaction_type) return null;

  const amountDiff = Math.abs(Math.abs(imported.amount) - Math.abs(book.amount));
  if (amountDiff > AMOUNT_TOLERANCE) return null;

  const daysDiff = daysBetween(imported.date, book.date);
  if (daysDiff > DATE_WINDOW_DAYS) return null;

  let score = 0;
  const reasons: string[] = [];

  // Exact amount match
  if (amountDiff === 0) { score += 40; reasons.push("amount_exact"); }

  // Date proximity
  if (daysDiff === 0) { score += 30; reasons.push("date_exact"); }
  else if (daysDiff === 1) { score += 20; reasons.push("date_±1d"); }
  else { score += 10; reasons.push(`date_±${Math.round(daysDiff)}d`); }

  // Reference match
  const impRef = normalizeRef(imported.reference);
  const bookRef = normalizeRef(book.reference);
  if (impRef && bookRef && impRef === bookRef) {
    score += 25;
    reasons.push("ref_exact");
  } else if (impRef && bookRef && (impRef.includes(bookRef) || bookRef.includes(impRef))) {
    score += 10;
    reasons.push("ref_partial");
  }

  // Description overlap (simple word overlap heuristic)
  const impWords = new Set(imported.description.toLowerCase().split(/\W+/).filter(Boolean));
  const bookWords = new Set(book.description.toLowerCase().split(/\W+/).filter(Boolean));
  let overlap = 0;
  for (const w of impWords) { if (bookWords.has(w) && w.length > 3) overlap++; }
  if (overlap > 0) { score += Math.min(overlap * 3, 15); reasons.push(`desc_overlap:${overlap}`); }

  return { bookTxId: book.id, score, reasons };
}

export interface AutoMatchResult {
  importedTxId: string;
  bestMatch: MatchCandidate | null;
  allCandidates: MatchCandidate[];
}

/**
 * For each imported transaction, returns the best matching book transaction
 * and all candidates above the minimum score threshold.
 */
export function autoMatch(
  importedTransactions: ImportedTransaction[],
  bookTransactions: BookTransaction[],
  minScore = 50
): AutoMatchResult[] {
  return importedTransactions.map((imported) => {
    const candidates: MatchCandidate[] = [];

    for (const book of bookTransactions) {
      const match = scoreMatch(imported, book);
      if (match && match.score >= minScore) {
        candidates.push(match);
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    return {
      importedTxId: imported.id,
      bestMatch: candidates[0] ?? null,
      allCandidates: candidates
    };
  });
}
