import { describe, expect, it } from "vitest";
import { summarizeBookingBatchResults } from "./booking-batch";

describe("summarizeBookingBatchResults", () => {
  it("keeps successful bookings and reports partial failures", () => {
    const results = [
      {
        status: "fulfilled",
        value: { bookingId: "b1", range: { unitId: "u1" } },
      },
      { status: "rejected", reason: new Error("network failure") },
      {
        status: "fulfilled",
        value: { bookingId: "b2", range: { unitId: "u2" } },
      },
    ] as const;

    const summary = summarizeBookingBatchResults(results);

    expect(summary.successful.length).toBe(2);
    expect(summary.failed.length).toBe(1);
    expect(summary.successful.map((item) => item.bookingId)).toEqual([
      "b1",
      "b2",
    ]);
    expect(summary.failed[0]?.error).toBe("network failure");
  });

  it("drops invalid booking IDs from commission creation targets", () => {
    const results = [
      {
        status: "fulfilled",
        value: { bookingId: "b-valid", range: { unitId: "u1" } },
      },
      {
        status: "fulfilled",
        value: { bookingId: "", range: { unitId: "u2" } },
      },
      { status: "rejected", reason: new Error("bad") },
    ] as const;

    const summary = summarizeBookingBatchResults(results);

    expect(summary.successful.map((item) => item.bookingId)).toEqual([
      "b-valid",
    ]);
    expect(summary.failed.length).toBe(2);
  });
});
