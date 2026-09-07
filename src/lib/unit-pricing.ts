export function toSafeUnitNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getUnitBasePrice(unit: any) {
  return toSafeUnitNumber(unit?.basePrice, toSafeUnitNumber(unit?.rate, 0));
}

export function getUnitMarkup(unit: any) {
  return toSafeUnitNumber(unit?.markup, 0);
}

export function getUnitFinalPrice(unit: any) {
  const basePrice = getUnitBasePrice(unit);
  const markup = getUnitMarkup(unit);
  return Math.max(0, basePrice + markup);
}
