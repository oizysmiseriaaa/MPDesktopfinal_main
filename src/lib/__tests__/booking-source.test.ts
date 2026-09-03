import { describe, expect, it } from "vitest";
import {
  BOOKING_SOURCE_LEGEND,
  getBookingSourceColor,
  getBookingSourceDisplayName,
  getBookingSourceLabel,
} from "../booking-source";

describe("booking source legend", () => {
  it.each([
    ["Facebook Page", "FACEBOOK PAGE"],
    ["Airbnb", "AIRBNB"],
    ["Booking.com", "BOOKING"],
    ["Staff", "STAFF"],
    ["Agent", "AGENT"],
    ["N/A", "N/A"],
  ] as const)("resolves %s using the calendar legend", (source, label) => {
    expect(getBookingSourceLabel(source)).toBe(label);
    expect(getBookingSourceColor(source)).toBe(BOOKING_SOURCE_LEGEND[label]);
  });

  it("prioritizes the booking source over a payment-status label", () => {
    const booking = {
      bookingSource: "Airbnb",
      bookingLabel: "AWAITING PAYMENT",
    };

    expect(getBookingSourceLabel(booking)).toBe("AIRBNB");
    expect(getBookingSourceDisplayName(booking)).toBe("AIRBNB");
  });
});
