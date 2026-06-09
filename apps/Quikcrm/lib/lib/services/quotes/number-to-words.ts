/**
 * Indian-numbering number-to-words converter.
 *
 * Returns the spoken form used on Indian invoices: groups go
 * ones / hundreds / thousands / lakhs / crores rather than the
 * Western thousands / millions / billions. Paise (two-decimal
 * fractional rupees) are rendered after "and".
 *
 * Hand-written to avoid pulling a runtime dependency for ~80
 * lines of logic. Covered by unit tests in
 * __tests__/unit/quotes/number-to-words.test.ts.
 */

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
] as const;

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
] as const;

function twoDigit(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t]! : `${TENS[t]} ${ONES[o]}`;
}

function threeDigit(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h === 0) return twoDigit(rest);
  if (rest === 0) return `${ONES[h]} Hundred`;
  return `${ONES[h]} Hundred ${twoDigit(rest)}`;
}

/**
 * Convert a positive integer to the Indian spoken form.
 * Caps at 99,99,99,99,999 (just below ten thousand crore) which is
 * comfortably more than any quote total this app should ever see.
 */
function integerToWords(n: number): string {
  if (n === 0) return "Zero";

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n / 100000) % 100);
  const thousand = Math.floor((n / 1000) % 100);
  const remainder = n % 1000;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${twoDigit(crore)} Crore`);
  if (lakh > 0) parts.push(`${twoDigit(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${twoDigit(thousand)} Thousand`);
  if (remainder > 0) parts.push(threeDigit(remainder));

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Convert a positive number (rupees + paise) to the Indian spoken form
 * used on quote/invoice PDFs. Two decimal places maximum; anything
 * beyond is silently rounded.
 *
 *   amountToWordsINR(57_73_150)     → "Fifty Seven Lakh Seventy Three Thousand One Hundred Fifty Rupees Only"
 *   amountToWordsINR(1234.56)       → "One Thousand Two Hundred Thirty Four Rupees and Fifty Six Paise Only"
 *   amountToWordsINR(0)             → "Zero Rupees Only"
 */
export function amountToWordsINR(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return "";
  const rounded = Math.round(amount * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  const rupeeWords = integerToWords(rupees);
  const head =
    rupees === 0
      ? "Zero Rupees"
      : `${rupeeWords} ${rupees === 1 ? "Rupee" : "Rupees"}`;

  if (paise === 0) return `${head} Only`;
  const paiseWords = twoDigit(paise);
  return `${head} and ${paiseWords} ${paise === 1 ? "Paisa" : "Paise"} Only`;
}
