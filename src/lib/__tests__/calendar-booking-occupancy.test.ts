import { describe, expect, it } from "vitest";
import {
  deduplicateCalendarBookingsByDate,
  getOccupiedCalendarDates,
} from "../calendar-booking-occupancy";

const resolveUnit = (booking: any) => String(booking.unitId).toLowerCase();

const booking = (
  id: string,
  unitId: string,
  checkinDate: string,
  checkoutDate: string,
) => ({
  id,
  unitId,
  checkinDate,
  checkoutDate,
});

describe("calendar booking occupancy", () => {
  it("selects one deterministic booking for the same unit and date", () => {
    const owners = deduplicateCalendarBookingsByDate(
      [
        booking("b-2", "u1", "2026-08-20", "2026-08-22"),
        booking("b-1", "u1", "2026-08-20", "2026-08-21"),
      ],
      resolveUnit,
    );

    expect(owners.get("u1__2026-08-20")?.id).toBe("b-1");
    expect(owners.get("u1__2026-08-21")?.id).toBe("b-2");
  });

  it("keeps different units on the same date independent", () => {
    const owners = deduplicateCalendarBookingsByDate(
      [
        booking("b-1", "u1", "2026-08-20", "2026-08-21"),
        booking("b-2", "u2", "2026-08-20", "2026-08-21"),
      ],
      resolveUnit,
    );

    expect(owners.size).toBe(2);
    expect(owners.get("u1__2026-08-20")?.id).toBe("b-1");
    expect(owners.get("u2__2026-08-20")?.id).toBe("b-2");
  });

  it("normalizes timestamp dates and uses checkout as exclusive", () => {
    expect(
      getOccupiedCalendarDates(
        booking(
          "b-1",
          "u1",
          "2026-08-20T14:00:00.000Z",
          "2026-08-22T12:00:00.000Z",
        ),
      ),
    ).toEqual(["2026-08-20", "2026-08-21"]);
  });
});
