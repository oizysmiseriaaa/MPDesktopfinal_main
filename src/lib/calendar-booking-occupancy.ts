export const normalizeCalendarDate = (value: unknown) => {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
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
