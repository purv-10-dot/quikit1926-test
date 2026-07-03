export function calcDepreciation(
  price: number,
  salvageValue: number,
  usefulLifeYears: number,
  method: string,
  purchaseDateStr: string,
): { ageYears: number; depreciatedValue: number; netBookValue: number } {
  const purchaseDate = new Date(purchaseDateStr);
  const now = new Date();
  const ageYears = Math.max(
    0,
    (now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
  );
  const sv = Math.max(0, salvageValue);

  let netBookValue: number;
  if (method === "DecliningBalance") {
    const rate = Math.min(2 / usefulLifeYears, 1);
    netBookValue = Math.max(price * Math.pow(1 - rate, ageYears), sv);
  } else {
    const annual = (price - sv) / usefulLifeYears;
    netBookValue = Math.max(price - annual * ageYears, sv);
  }

  const depreciatedValue = price - netBookValue;
  return {
    ageYears: Math.round(ageYears * 10) / 10,
    depreciatedValue: Math.round(depreciatedValue),
    netBookValue: Math.round(netBookValue),
  };
}
