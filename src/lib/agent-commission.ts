const INCOME_BASE_UNIT_RATE = 1500;
const INCOME_EXTRA_GUEST_RATE = 300;

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const getBookingNights = (
  checkinDate: unknown,
  checkoutDate: unknown,
) => {
  const checkin = new Date(String(checkinDate || ""));
  const checkout = new Date(String(checkoutDate || ""));
  if (
    Number.isNaN(checkin.getTime()) ||
    Number.isNaN(checkout.getTime()) ||
    checkout <= checkin
  ) {
    return 0;
  }
  return Math.round((checkout.getTime() - checkin.getTime()) / 86400000);
};

export const getEffectiveExtraGuestRate = (unit: any) => {
  const enteredRate = Number(unit?.extraGuestRate ?? unit?.extraGuestFee);
  if (!Number.isFinite(enteredRate) || enteredRate < INCOME_EXTRA_GUEST_RATE) {
    return INCOME_EXTRA_GUEST_RATE;
  }
  return enteredRate;
};

export const calculateAgentCommission = ({
  unit,
  nights,
  extraGuestCount,
}: {
  unit: any;
  nights: number;
  extraGuestCount: number;
}) => {
  const safeNights = Math.max(0, toFiniteNumber(nights));
  const safeExtraGuestCount = Math.max(0, toFiniteNumber(extraGuestCount));
  const baseUnitRate = toFiniteNumber(unit?.basePrice ?? unit?.rate);
  const baseCommission =
    Math.max(0, baseUnitRate - INCOME_BASE_UNIT_RATE) * safeNights;
  const extraGuestCommission =
    Math.max(0, getEffectiveExtraGuestRate(unit) - INCOME_EXTRA_GUEST_RATE) *
    safeExtraGuestCount *
    safeNights;

  return Math.round((baseCommission + extraGuestCommission) * 100) / 100;
};
