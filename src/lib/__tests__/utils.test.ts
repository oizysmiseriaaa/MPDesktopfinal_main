import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  getDaysInMonth,
  parseLocalOnly,
  calculateProratedRevenue,
  calculateProratedBaseRevenue,
  normalizeSecurityDepositRecord,
  normalizeBookingSecurityDepositRecords,
  normalizeSecurityDepositsFromBookings,
  summarizeNormalizedSecurityDeposits,
  summarizeSecurityDeposits,
  getSecurityDepositDate,
  filterSecurityDeposits,
  looksLikeFirestoreId,
  stripLedgerHashId,
  getBookingLabel,
  parseLocalDateInput,
  addLocalDays,
  todayLocalDateInput,
  tomorrowLocalDateInput,
} from "../utils-app";

// Covers shared currency, date, and revenue calculations.

describe("formatCurrency helper", () => {
  it("formats amount to Philippine Peso without decimals", () => {
    expect(formatCurrency(1500)).toBe("₱1,500");
    expect(formatCurrency(0)).toBe("₱0");
  });
});

describe("getDaysInMonth helper", () => {
  it("returns correct days in a month", () => {
    expect(getDaysInMonth(1, 2024)).toBe(29); // February leap year
    expect(getDaysInMonth(1, 2023)).toBe(28); // February regular year
    expect(getDaysInMonth(0, 2024)).toBe(31); // January
  });
});

describe("parseLocalOnly helper", () => {
  it("parses YYYY-MM-DD date string ignoring timezone", () => {
    const parsed = parseLocalOnly("2026-06-25T14:30:00Z");
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(5); // 0-indexed (June = 5)
    expect(parsed?.getDate()).toBe(25);
  });

  it("returns null for empty or invalid inputs", () => {
    expect(parseLocalOnly("")).toBeNull();
    expect(parseLocalOnly("invalid-date")).toBeNull();
  });
});

describe("local recording date helpers (Philippine local time)", () => {
  it("formats a Date using its local calendar components, not UTC", () => {
    // A moment shortly after local midnight. In any timezone CONSTRUCTED this
    // way the local date matches the components; the point is the helper reads
    // local fields rather than toISOString() (UTC).
    const date = new Date(2026, 7, 21, 1, 0, 0); // local Aug 21 01:00
    expect(parseLocalDateInput(date)).toBe("2026-08-21");
  });

  it("pads single-digit months and days", () => {
    const date = new Date(2026, 0, 3); // Jan 3
    expect(parseLocalDateInput(date)).toBe("2026-01-03");
  });

  it("rolls addLocalDays across month boundaries using local date math", () => {
    // 2026-01-31 + 1 day must be 2026-02-01 (local), never an off-by-one.
    const jan31 = new Date(2026, 0, 31);
    expect(parseLocalDateInput(addLocalDays(jan31, 1))).toBe("2026-02-01");
    // 2026-12-31 + 1 day -> 2027-01-01
    const dec31 = new Date(2026, 11, 31);
    expect(parseLocalDateInput(addLocalDays(dec31, 1))).toBe("2027-01-01");
  });

  it("today and tomorrow return local calendar date strings", () => {
    expect(todayLocalDateInput()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tomorrowLocalDateInput()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // tomorrow must be the day after today in the local calendar
    const today = new Date();
    const expectedTomorrow = parseLocalDateInput(addLocalDays(today, 1));
    expect(tomorrowLocalDateInput()).toBe(expectedTomorrow);
  });
});

describe("calculateProratedRevenue helper", () => {
  it("calcules correct overlap revenue when booking spans across months", () => {
    const booking = {
      checkinDate: "2026-05-28",
      checkoutDate: "2026-06-03",
      totalAmount: 6000, // 6 nights -> 1000 per night
    };

    // May: May 28, 29, 30, 31 (4 nights)
    const mayRev = calculateProratedRevenue(booking, 4, 2026);
    expect(mayRev).toBe(4000);

    // June: June 1, 2 (2 nights)
    const juneRev = calculateProratedRevenue(booking, 5, 2026);
    expect(juneRev).toBe(2000);
  });
});

describe("normalizeSecurityDepositRecord helper", () => {
  it("converts Firestore-like timestamp objects to ISO strings", () => {
    const unixSeconds = 1717123200;
    const record = normalizeSecurityDepositRecord({
      amount: 2000,
      type: "receive",
      status: "Paid",
      paidAt: { seconds: unixSeconds, nanoseconds: 0 },
    });

    expect(record.paidAt).toBe(new Date(unixSeconds * 1000).toISOString());
    expect(record.amount).toBe(2000);
    expect(record.type).toBe("receive");
  });

  it("falls back to refundPaidAt when paidAt is missing and preserves refundPaidAt", () => {
    const refundPaidAt = "2026-06-25 15:30:00";
    const expectedIso = new Date(refundPaidAt).toISOString();
    const record = normalizeSecurityDepositRecord({
      amount: 1500,
      type: "refund",
      status: "Refunded",
      refundPaidAt,
    });

    expect(record.paidAt).toBe(expectedIso);
    expect(record.refundPaidAt).toBe(expectedIso);
    expect(record.type).toBe("refund");
  });
});

describe("normalizeBookingSecurityDepositRecords helper", () => {
  it("derives security deposit records from booking records", () => {
    const bookings = [
      {
        id: "b1",
        unitId: "u1",
        unitName: "Unit 1",
        guestFirstName: "Jane",
        guestLastName: "Doe",
        securityDepositStatus: "Paid",
        securityDeposit: { amount: 2000 },
        securityDepositReceipt: { paidAt: "2026-06-10" },
        bookingDate: "2026-06-01",
      },
      {
        id: "b2",
        unitId: "u2",
        unitName: "Unit 2",
        guestName: "John Smith",
        securityDepositStatus: "Unpaid",
        securityDeposit: { amount: 1500 },
        bookingDate: "2026-06-05",
      },
    ];

    const deposits = normalizeBookingSecurityDepositRecords(bookings);

    expect(deposits).toHaveLength(2);
    expect(deposits[0].bookingId).toBe("b1");
    expect(deposits[0].type).toBe("receive");
    expect(deposits[0].status).toBe("Paid");
    expect(deposits[1].status).toBe("Unpaid");
  });
});

describe("summarizeSecurityDeposits helper", () => {
  it("summarizes deposit movements without altering stored records", () => {
    const result = summarizeSecurityDeposits([
      { type: "receive", amount: 1000, status: "Paid" },
      { type: "receive", amount: 500, status: "Held" },
      { type: "refund", amount: 300, status: "Pending" },
      { type: "refund", amount: 200, status: "Refunded" },
    ]);

    expect(result).toEqual({
      collected: 1500,
      refunded: 200,
      pendingRefunds: 300,
      activeHeld: 1300,
      currentBalance: 1300,
    });
  });
});

describe("normalizeSecurityDepositsFromBookings helper", () => {
  it("builds one booking-based deposit record per booking", () => {
    const bookings = [
      {
        id: "b1",
        unitId: "u1",
        unitName: "Unit 1",
        guestFirstName: "Jane",
        guestLastName: "Doe",
        agent: "Maria",
        securityDepositStatus: "Paid",
        securityDeposit: { amount: 2000 },
        securityDepositReceipt: {
          paidAt: "2026-06-10",
          refundAmount: 0,
        },
        bookingDate: "2026-06-01",
        checkinDate: "2026-06-05",
      },
      {
        id: "b2",
        unitId: "u2",
        unitName: "Unit 2",
        guestName: "John Smith",
        securityDepositStatus: "Partial",
        securityDeposit: { amount: 1500 },
        bookingDate: "2026-06-05",
      },
      {
        id: "b3",
        unitId: "u2",
        unitName: "Unit 2",
        guestName: "Ana Reyes",
        assignedAgent: "Hannah",
        securityDepositStatus: "Unpaid",
        securityDeposit: { amount: 1000 },
        securityDepositReceipt: { paidAt: "2026-06-20" },
        checkinDate: "2026-06-18",
      },
    ];

    const records = normalizeSecurityDepositsFromBookings(bookings);

    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      bookingId: "b1",
      unitId: "u1",
      unitName: "Unit 1",
      guestName: "Jane Doe",
      agent: "Maria",
      depositAmount: 2000,
      status: "Paid",
    });
    expect(records[1].status).toBe("Partial");
    expect(records[2]).toMatchObject({
      bookingId: "b3",
      guestName: "Ana Reyes",
      agent: "Hannah",
      depositAmount: 1000,
      status: "Unpaid",
      transactionType: "Unpaid Deposit",
    });
  });

  it("maps amounts from alternative fields and normalizes statuses", () => {
    const bookings = [
      {
        id: "b4",
        unitId: "u3",
        unitName: "Unit 3",
        guestName: "Rey Cruz",
        // Amount stored only at the booking level (no securityDeposit object).
        depositAmount: 2500,
        securityDepositStatus: "Fully Paid",
      },
      {
        id: "b5",
        unitId: "u4",
        unitName: "Unit 4",
        guestName: "Nina Tan",
        securityDepositAmount: 1200,
        securityDepositStatus: "Pending",
      },
      {
        id: "b6",
        unitId: "u5",
        unitName: "Unit 5",
        guestName: "Sam Yu",
        securityDeposit: { amount: 1800 },
        securityDepositStatus: "Refunded",
      },
      {
        id: "b7",
        unitName: "Unit 6",
        guestName: "No deposit here",
        // No deposit signal at all — must be skipped.
      },
      {
        id: "b8",
        unitId: "u7",
        unitName: "Unit 7",
        guestName: "Lee Ong",
        // No receipt date — depositDate should fall back to checkinDate.
        securityDeposit: { amount: 900 },
        securityDepositStatus: "Paid",
        checkinDate: "2026-07-02",
      },
    ];

    const records = normalizeSecurityDepositsFromBookings(bookings);

    expect(records).toHaveLength(4); // b7 skipped
    expect(records[0]).toMatchObject({
      bookingId: "b4",
      depositAmount: 2500,
      status: "Paid",
    });
    expect(records[1]).toMatchObject({
      bookingId: "b5",
      depositAmount: 1200,
      status: "Unpaid",
    });
    expect(records[2]).toMatchObject({
      bookingId: "b6",
      depositAmount: 1800,
      status: "Paid", // refunded is treated as collected
    });
    expect(records[3]).toMatchObject({
      bookingId: "b8",
      depositAmount: 900,
      status: "Paid",
      depositDate: new Date("2026-07-02").toISOString(),
    });
    expect(records.some((r: any) => r.bookingId === "b7")).toBe(false);
  });
});

describe("summarizeNormalizedSecurityDeposits helper", () => {
  it("computes collected, refunded, active held, and unpaid from one dataset", () => {
    const records = [
      {
        status: "Paid",
        depositAmount: 2000,
        refundAmount: 500,
      },
      { status: "Paid", depositAmount: 1500, refundAmount: 0 },
      { status: "Partial", depositAmount: 4500, refundAmount: 0 },
      { status: "Unpaid", depositAmount: 1000, refundAmount: 0 },
      { status: "Unpaid", depositAmount: 800, refundAmount: 0 },
    ];

    const result = summarizeNormalizedSecurityDeposits(records);

    expect(result).toEqual({
      totalCollected: 3500,
      totalRefunded: 500,
      activeHeld: 3000,
      unpaidDeposits: 1800,
    });
  });

  it("does not count a pending refund in Total Refunded", () => {
    const records = [
      {
        status: "Paid",
        depositAmount: 2000,
        refundAmount: 2000,
        refundStatus: "pending",
      },
    ];
    // refundStatus "pending" means the refund is excluded from Total Refunded.
    const result = summarizeNormalizedSecurityDeposits(records);
    expect(result.totalRefunded).toBe(0);
    expect(result.totalCollected).toBe(2000);
  });
});

describe("getSecurityDepositDate helper", () => {
  it("returns null for invalid or missing deposit date values", () => {
    expect(getSecurityDepositDate({})).toBeNull();
    expect(getSecurityDepositDate({ paidAt: "invalid-date" })).toBeNull();
  });

  it("returns the first valid normalized date from configured fields", () => {
    expect(
      getSecurityDepositDate({
        refundPaidAt: "2026-06-25T15:30:00Z",
        paidAt: "invalid-date",
      }),
    ).toBe(new Date("2026-06-25T15:30:00Z").toISOString());
  });
});

describe("filterSecurityDeposits helper", () => {
  it("filters deposits by month, year, unit, agent, and guest", () => {
    const deposits = [
      {
        amount: 1000,
        type: "receive",
        status: "Paid",
        paidAt: "2026-06-05T10:00:00Z",
        unitId: "u1",
        bookingId: "b1",
        agent: "Agent A",
        guestName: "Guest A",
      },
      {
        amount: 500,
        type: "refund",
        status: "Refunded",
        paidAt: "2026-06-15T12:00:00Z",
        unitId: "u2",
        bookingId: "b2",
        agent: "Agent B",
        guestName: "Guest B",
      },
    ];

    const result = filterSecurityDeposits(deposits, {
      month: 5,
      year: 2026,
      unit: "u1",
      agent: "Agent A",
      guest: "Guest A",
    });

    expect(result).toHaveLength(1);
    expect(result[0].agent).toBe("Agent A");
  });

  it("supports status filter values paid, partial, and unpaid", () => {
    const deposits = [
      { status: "Paid", paidAt: "2026-06-05T10:00:00Z" },
      { status: "Held", paidAt: "2026-06-05T10:00:00Z" },
      { status: "Partial", paidAt: "2026-06-05T10:00:00Z" },
      { status: "Unpaid", paidAt: "2026-06-05T10:00:00Z" },
    ];

    expect(
      filterSecurityDeposits(deposits, {
        month: 5,
        year: 2026,
        status: "Paid",
      }),
    ).toHaveLength(2);
    expect(
      filterSecurityDeposits(deposits, {
        month: 5,
        year: 2026,
        status: "Partial",
      }),
    ).toHaveLength(1);
    expect(
      filterSecurityDeposits(deposits, {
        month: 5,
        year: 2026,
        status: "Unpaid",
      }),
    ).toHaveLength(1);
  });
});

describe("looksLikeFirestoreId helper", () => {
  it("flags long opaque ids and ignores friendly references", () => {
    expect(looksLikeFirestoreId("ZsUdMcexJ6G1UhmuTBgc")).toBe(true);
    expect(looksLikeFirestoreId("33taLtp2npgwurlNclkeqK5PXIj1")).toBe(true);
    expect(looksLikeFirestoreId("Booking.com")).toBe(false);
    expect(looksLikeFirestoreId("CASH")).toBe(false);
    expect(looksLikeFirestoreId("")).toBe(false);
    expect(looksLikeFirestoreId(undefined)).toBe(false);
  });

  it("preserves purely-numeric reservation numbers", () => {
    expect(looksLikeFirestoreId("12345678901234567890")).toBe(false);
  });
});

describe("stripLedgerHashId helper", () => {
  it("removes a leading id hash but keeps the real note text", () => {
    expect(
      stripLedgerHashId(
        "33taLtp2npgwurlNclkeqK5PXIj1 Auto-created from security deposit status.",
      ),
    ).toBe("Auto-created from security deposit status.");
    expect(
      stripLedgerHashId("ZsUdMcexJ6G1UhmuTBgc Auto-synced from booking."),
    ).toBe("Auto-synced from booking.");
  });

  it("returns an empty string when the note is only an id", () => {
    expect(stripLedgerHashId("33taLtp2npgwurlNclkeqK5PXIj1")).toBe("");
    expect(stripLedgerHashId("")).toBe("");
    expect(stripLedgerHashId(undefined)).toBe("");
  });

  it("leaves human-written notes and numeric refs untouched", () => {
    expect(stripLedgerHashId("Manual entry from ledger.")).toBe(
      "Manual entry from ledger.",
    );
    expect(stripLedgerHashId("Refund processed via Booking.com")).toBe(
      "Refund processed via Booking.com",
    );
    expect(stripLedgerHashId("12345678901234567890 Auto-created note")).toBe(
      "12345678901234567890 Auto-created note",
    );
  });
});

describe("getBookingLabel helper", () => {
  it("shows the check-in date instead of a raw booking id", () => {
    const label = getBookingLabel({ checkinDate: "2026-05-31" });
    expect(label).not.toBe("—");
    expect(label).toContain("2026");
  });

  it("falls back to a dash when no booking or date exists", () => {
    expect(getBookingLabel(undefined)).toBe("—");
    expect(getBookingLabel({})).toBe("—");
    expect(getBookingLabel({ checkinDate: "not-a-date" })).toBe("—");
  });
});
