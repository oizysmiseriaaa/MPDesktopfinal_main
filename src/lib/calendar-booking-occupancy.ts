export const normalizeCalendarDate = (value: unknown): string => {
  if (value && typeof value === "object") {
    const timestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof timestamp.toDate === "function") {
      return normalizeCalendarDate(timestamp.toDate());
    }
    if (typeof timestamp.seconds === "number") {
      return normalizeCalendarDate(new Date(timestamp.seconds * 1000));
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match?.[1]) return match[1];
  const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (!slashMatch) return "";
  return `${slashMatch[3]}-${slashMatch[1].padStart(2, "0")}-${slashMatch[2].padStart(2, "0")}`;
};

export const getBookingUnitReference = (booking: any) =>
  String(
    booking?.unitId ||
      booking?.unit_id ||
      booking?.unitName ||
      booking?.unitname ||
      "",
  )
    .trim()
    .toLowerCase();

export const getCalendarBookingIdentity = (booking: any) => {
  const explicitId = String(
    booking?.id || booking?.bookingId || booking?.bookingReference || "",
  ).trim();
  if (explicitId) return `id:${explicitId}`;

  return [
    getBookingUnitReference(booking),
    normalizeCalendarDate(booking?.checkinDate || booking?.checkIn),
    normalizeCalendarDate(booking?.checkoutDate || booking?.checkOut),
    booking?.guestName ||
      `${booking?.guestFirstName || ""} ${booking?.guestLastName || ""}`,
  ]
    .map((value) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " "),
    )
    .join("|");
};

export const getOccupiedCalendarDates = (booking: any) => {
  const checkin = normalizeCalendarDate(
    booking?.checkinDate || booking?.checkIn,
  );
  const checkout = normalizeCalendarDate(
    booking?.checkoutDate || booking?.checkOut,
  );
  if (!checkin || !checkout) return [];

  const start = new Date(`${checkin}T00:00:00`);
  const end = new Date(`${checkout}T00:00:00`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    return [];
  }

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor < end) {
    dates.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const compareBookings = (left: any, right: any) =>
  getCalendarBookingIdentity(left).localeCompare(
    getCalendarBookingIdentity(right),
  );

export const deduplicateCalendarBookingsByDate = (
  bookings: any[],
  resolveUnitKey: (booking: any) => string,
) => {
  const owners = new Map<string, any>();

  for (const booking of bookings) {
    const unitKey = resolveUnitKey(booking);
    if (!unitKey) continue;

    for (const date of getOccupiedCalendarDates(booking)) {
      const key = `${unitKey}__${date}`;
      const current = owners.get(key);
      if (!current || compareBookings(booking, current) < 0) {
        owners.set(key, booking);
      }
    }
  }

  return owners;
};
