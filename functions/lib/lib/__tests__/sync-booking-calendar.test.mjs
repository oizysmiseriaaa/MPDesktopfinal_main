import { describe, it, expect } from "vitest";
import {
  normalizeHeaderLabel,
  buildHeaderIndexMap,
  isOtherSectionBoundaryRow,
  buildDeterministicId,
} from "../sync-helpers.js";
import {
  parseCalendarWorksheetBookings,
  resolveCalendarBookingValidation,
} from "../../services/syncBookings.js";

describe("Calendar worksheet booking parsing", () => {
  it("parses calendar rows into booking blocks and validates unit totals", () => {
    const values = [
      ["Date", "447 B", "Source", "Rate", "438 B", "Source", "Rate", "1532 B", "Source", "Rate", "1586 C2", "Source", "Rate", "PARKING 109-A", "Source", "Rate"],
      ["1", "Guest A", "Paid", "4200", "", "", "", "Guest B", "Paid", "3200", "", "", "", "", "", ""],
      ["2", "Guest A", "Paid", "4200", "", "", "", "Guest B", "Paid", "3200", "", "", "", "", "", ""],
      ["3", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["4", "", "", "", "", "", "", "", "", "", "Guest C", "Unpaid", "1800", "", "", ""],
      ["5", "", "", "", "", "", "", "", "", "", "Guest C", "Unpaid", "1800", "", "", ""],
      ["Monthly Bookings", "", "", "8400", "", "", "0", "", "", "6400", "", "", "3600", "", "", "0"],
    ];
    const units = [
      { id: "447", name: "447 B", unitNumber: "447 B", title: "447 B" },
      { id: "438", name: "438 B", unitNumber: "438 B", title: "438 B" },
      { id: "1532", name: "1532 B", unitNumber: "1532 B", title: "1532 B" },
      { id: "1586", name: "1586 C2", unitNumber: "1586 C2", title: "1586 C2" },
      {
        id: "109-A",
        name: "PARKING 109-A",
        unitNumber: "PARKING 109-A",
        title: "PARKING 109-A",
      },
    ];
    const unitLookup = {
      byId: new Map(units.map((unit) => [String(unit.id), unit])),
      byName: new Map(
        units.map((unit) => [String(unit.name).toLowerCase(), unit]),
      ),
    };
    const result = parseCalendarWorksheetBookings(
      values,
      "August Booking 2026",
      unitLookup,
    );
    expect(result.bookings).toHaveLength(3);
    expect(result.bookings[0]).toMatchObject({
      unitId: "447",
      checkinDate: "2026-08-01",
      checkoutDate: "2026-08-03",
      totalAmount: 8400,
      paymentStatus: "Paid",
    });
    expect(result.bookings[1]).toMatchObject({
      unitId: "1532",
      checkinDate: "2026-08-01",
      checkoutDate: "2026-08-03",
      totalAmount: 6400,
      paymentStatus: "Paid",
    });
    expect(result.bookings[2]).toMatchObject({
      unitId: "1586",
      checkinDate: "2026-08-04",
      checkoutDate: "2026-08-06",
      totalAmount: 3600,
      paymentStatus: "Unpaid",
    });
    expect(result.totalsByUnit.get("447")).toBe(8400);
    expect(result.totalsByUnit.get("1532")).toBe(6400);
    expect(result.totalsByUnit.get("1586")).toBe(3600);
    const importedTotals = result.bookings.reduce((totals, booking) => {
      const current = totals.get(booking.unitId) || 0;
      totals.set(booking.unitId, current + booking.totalAmount);
      return totals;
    }, new Map());
    const mismatches = resolveCalendarBookingValidation(
      importedTotals,
      result.totalsByUnit,
      unitLookup,
    );
    expect(mismatches).toHaveLength(0);
  });
});
