// The Calendar legend owns this palette. All booking-source UI and calendar
// bars resolve through this module so a stored source has one stable color.
export const BOOKING_SOURCE_LEGEND = {
  RESERVE: "#6B7280",
  "FULLY PAID": "#15803D",
  "AWAITING PAYMENT": "#DC2626",
  "FACEBOOK PAGE": "#2563EB",
  STAFF: "#D97706",
  "N/A": "#9CA3AF",
  AGENT: "#7C3AED",
  AIRBNB: "#0F766E",
  PENDING: "#B45309",
  BOOKING: "#1D4ED8",
} as const;

export type BookingSourceLabel = keyof typeof BOOKING_SOURCE_LEGEND;

export const BOOKING_STATUS_OPTIONS = [
  { value: "Reserved", label: "Reserved" },
  { value: "Pending", label: "Pending" },
  { value: "Awaiting Payment", label: "Awaiting Payment" },
  { value: "Fully Paid", label: "Fully Paid" },
] as const;

const aliases: Record<string, BookingSourceLabel> = {
  "BOOKING.COM": "BOOKING",
  BOOKINGCOM: "BOOKING",
  FACEBOOK: "FACEBOOK PAGE",
  FB: "FACEBOOK PAGE",
  "NO AGENT": "N/A",
  NONE: "N/A",
  RESERVED: "RESERVE",
  PAID: "FULLY PAID",
  FULLY_PAID: "FULLY PAID",
  UNPAID: "AWAITING PAYMENT",
  AWAITING_PAYMENT: "AWAITING PAYMENT",
};

export const getBookingSourceLabel = (
  bookingOrSource: any,
): BookingSourceLabel => {
  const candidates =
    bookingOrSource && typeof bookingOrSource === "object"
      ? [
          bookingOrSource.bookingSource,
          bookingOrSource.source,
          bookingOrSource.channel,
          bookingOrSource.bookingLabel,
          bookingOrSource.label,
          bookingOrSource.paymentStatus,
          bookingOrSource.bookingPaymentStatus,
        ]
      : [bookingOrSource];
  const raw = candidates
    .find((value) => String(value || "").trim())
    ?.toString()
    .trim()
    .toUpperCase();
  if (raw && raw in BOOKING_SOURCE_LEGEND) return raw as BookingSourceLabel;
  return aliases[raw || ""] || "N/A";
};

export const getBookingSourceColor = (bookingOrSource: any) =>
  BOOKING_SOURCE_LEGEND[getBookingSourceLabel(bookingOrSource)];

export const getBookingStatusLabel = (booking: any): BookingSourceLabel => {
  const raw = String(booking?.bookingStatus || "")
    .trim()
    .toUpperCase();
  if (raw === "RESERVED") return "RESERVE";
  if (raw === "PENDING") return "PENDING";
  if (raw === "AWAITING PAYMENT" || raw === "AWAITING_PAYMENT")
    return "AWAITING PAYMENT";
  if (raw === "FULLY PAID" || raw === "FULLY_PAID") return "FULLY PAID";
  return getBookingSourceLabel(booking);
};

export const getBookingSourceDisplayName = (bookingOrSource: any) => {
  const label = getBookingSourceLabel(bookingOrSource);
  return label === "BOOKING" ? "Booking.com" : label;
};

export const bookingSourceOptions: Array<{ value: string; label: string }> = [
  { value: "Facebook Page", label: "Facebook Page" },
  { value: "Airbnb", label: "Airbnb" },
  { value: "Booking.com", label: "Booking.com" },
  { value: "Staff", label: "Staff" },
  { value: "Agent", label: "Agent" },
  { value: "N/A", label: "N/A" },
];
