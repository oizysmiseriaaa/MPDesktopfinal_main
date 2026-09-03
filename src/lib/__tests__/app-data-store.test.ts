import { describe, expect, it } from "vitest";
import {
  equalResourceRecords,
  removeBookingRelatedRecords,
} from "../app-data-store";

describe("reservation resource synchronization", () => {
  it("detects updates even when the reservation ID is unchanged", () => {
    expect(
      equalResourceRecords(
        [{ id: "bk-1", paymentStatus: "Unpaid" }],
        [{ id: "bk-1", paymentStatus: "Paid" }],
      ),
    ).toBe(false);
  });

  it("removes a deleted reservation and all linked records from shared data", () => {
    expect(
      removeBookingRelatedRecords(
        "bookings",
        [{ id: "bk-1" }, { id: "bk-2" }],
        "bk-1",
      ),
    ).toEqual([{ id: "bk-2" }]);
    expect(
      removeBookingRelatedRecords(
        "booking-payments",
        [
          { id: "pay-1", bookingId: "bk-1" },
          { id: "pay-2", bookingId: "bk-2" },
        ],
        "bk-1",
      ),
    ).toEqual([{ id: "pay-2", bookingId: "bk-2" }]);
    expect(
      removeBookingRelatedRecords(
        "expenses",
        [
          { id: "expense-1", bookingId: "bk-1" },
          { id: "expense-2", bookingId: "bk-2" },
        ],
        "bk-1",
      ),
    ).toEqual([{ id: "expense-2", bookingId: "bk-2" }]);
  });
});
