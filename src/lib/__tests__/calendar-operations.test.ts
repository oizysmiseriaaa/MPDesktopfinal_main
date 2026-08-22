import { describe, it, expect } from "vitest";
import { getOperationsStatus, CHECKOUT_WARNING_MINUTES } from "../calendar-operations";

// Fixed "now" so the date arithmetic is deterministic.
const NOW = new Date("2026-08-20T14:00:00");

function booking(checkinDate: string, checkoutDate: string, overrides = {}) {
  return {
    id: "b1",
    checkinDate,
    checkoutDate,
    checkinTime: "14:00",
    checkoutTime: "12:00",
    ...overrides,
  };
}

describe("getOperationsStatus (strict current/future booking state)", () => {
  it("treats a booking that starts today as an active (checked-in) booking", () => {
    const status = getOperationsStatus(
      booking("2026-08-20", "2026-08-21"),
      NOW,
    );
    expect(status.key).toBe("checked-in");
  });

  it("keeps a booking that starts tomorrow as a future (upcoming) booking", () => {
    const status = getOperationsStatus(
      booking("2026-08-21", "2026-08-22"),
      NOW,
    );
    expect(status.key).toBe("upcoming");
  });

  it("keeps a booking several days out as upcoming — nothing becomes active early", () => {
    const status = getOperationsStatus(
      booking("2026-08-25", "2026-08-27"),
      NOW,
    );
    expect(status.key).toBe("upcoming");
  });

  it("reads as checked-out once the checkout date/time has been reached", () => {
    const status = getOperationsStatus(
      booking("2026-08-18", "2026-08-20"),
      NOW,
    );
    expect(status.key).toBe("checked-out");
  });

  it("reads as due-for-checkout only inside the existing warning window", () => {
    // Checkout 12:00 today is already past, so use a later checkout the same day.
    const onTime = booking("2026-08-18", "2026-08-20", {
      checkoutTime: "15:00",
    });
    const status = getOperationsStatus(onTime, NOW); // 14:00, 60 min before 15:00
    expect(status.key).toBe("due-for-checkout");
    expect(CHECKOUT_WARNING_MINUTES).toBeGreaterThan(0);
  });

  it("reflects an edited stay immediately", () => {
    // Originally 08-18 → 08-20, but the whole stay was moved to future dates.
    const edited = getOperationsStatus(
      booking("2026-08-18", "2026-08-20", {
        checkinDate: "2026-08-25",
        checkoutDate: "2026-08-27",
      }),
      NOW,
    );
    expect(edited.key).toBe("upcoming");
    // Reverting the edit back to those dates returns it to checked-out again.
    const reverted = getOperationsStatus(
      booking("2026-08-18", "2026-08-20"),
      NOW,
    );
    expect(reverted.key).toBe("checked-out");
  });

  it("never lets a stale stored status override the actual dates", () => {
    // A future booking that was wrongly stamped "Checked Out" in storage must
    // still read as upcoming, so it cannot generate a reminder early.
    const status = getOperationsStatus(
      booking("2026-08-25", "2026-08-27", {
        status: "Checked Out",
        bookingStatus: "Checked Out",
      }),
      NOW,
    );
    expect(status.key).toBe("upcoming");

    // But a genuinely past-dated booking with the same stale stamp is still
    // checked out (the stored stamp does not downgrade real dates either).
    const past = getOperationsStatus(
      booking("2026-08-18", "2026-08-20", {
        status: "Checked Out",
        bookingStatus: "Checked Out",
      }),
      NOW,
    );
    expect(past.key).toBe("checked-out");
  });
});