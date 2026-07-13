export type JournalLine = {
  accountId: string;
  debit: number;
  credit: number;
  memo?: string;
};

export function sumDebits(lines: JournalLine[]) {
  return lines.reduce((total, line) => total + line.debit, 0);
}

export function sumCredits(lines: JournalLine[]) {
  return lines.reduce((total, line) => total + line.credit, 0);
}

export function isBalanced(lines: JournalLine[]) {
  return Math.abs(sumDebits(lines) - sumCredits(lines)) < 0.005;
}

export function assertBalanced(lines: JournalLine[]) {
  if (!isBalanced(lines)) {
    throw new Error("Journal entry must balance before posting.");
  }
}

export function depreciationCharge(cost: number, salvageValue: number, usefulLifeMonths: number) {
  if (usefulLifeMonths <= 0) {
    return 0;
  }
  return Number(((cost - salvageValue) / usefulLifeMonths).toFixed(2));
}
