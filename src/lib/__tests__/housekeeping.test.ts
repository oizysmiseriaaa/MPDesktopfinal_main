import { describe, it, expect } from "vitest";
import {
  getHousekeepingTaskId,
  isCheckoutReminder,
  isHousekeepingEligibleBooking,
  shouldCreateHousekeeping,
  buildHousekeepingTask,
  nextHousekeepingStatus,
  isCheckoutAtOrAfter,
  HOUSEKEEPING_STATUS_PENDING,
  HOUSEKEEPING_STATUS_IN_PROGRESS,
  HOUSEKEEPING_STATUS_COMPLETED,
} from "../housekeeping";
import { canAccessResource } from "@/auth/roles";

// Fixed "now" so date math is deterministic: checkout date 2026-06-03 12:00.
const NOW = new Date("2026-06-03T12:30:00");

function checkoutReminder(overrides = {}) {
  return {
    id: "checkout-due-b1-2026-06-03",
    title: "Checkout Due - 1532 B",
    description: "Juan Dela Cruz\nCheckout at 12:00 PM.",
    priority: "high",
    completed: true,
    bookingId: "b1",
    unitId: "u1",
    unitName: "1532 B",
    reminderType: "checkout-due",
    createdAt: "2026-06-03T12:05:00.000Z",
    ...overrides,
  };
}

function booking(overrides = {}) {
  return {
    id: "b1",
    guestFirstName: "Juan",
    guestLastName: "Dela Cruz",
    unitId: "u1",
    unitName: "1532 B",
    checkinDate: "2026-06-01",
    checkoutDate: "2026-06-03",
    checkoutTime: "12:00",
    ...overrides,
  };
}

describe("getHousekeepingTaskId", () => {
  it("is deterministic and embeds booking + checkout date", () => {
    const a = getHousekeepingTaskId("b1", "2026-06-03");
    const b = getHousekeepingTaskId("b1", "2026-06-03");
    expect(a).toBe("housekeeping-b1-2026-06-03");
    expect(a).toBe(b);
  });

  it("handles missing booking id defensively", () => {
    expect(getHousekeepingTaskId(undefined, "2026-06-03")).toBe(
      "housekeeping-unknown-2026-06-03",
    );
  });

  it("a changed checkout date produces a distinct task id", () => {
    expect(getHousekeepingTaskId("b1", "2026-06-04")).not.toBe(
      getHousekeepingTaskId("b1", "2026-06-03"),
    );
  });
});

describe("isCheckoutReminder", () => {
  it("recognizes checkout-due reminders by type and by title", () => {
    expect(isCheckoutReminder(checkoutReminder())).toBe(true);
    expect(isCheckoutReminder({ title: "Prepare the unit (checkout)" })).toBe(
      true,
    );
  });

  it("rejects general reminders", () => {
    expect(
      isCheckoutReminder({ title: "Pay utility bill", description: "..." }),
    ).toBe(false);
  });
});

describe("isHousekeepingEligibleBooking", () => {
  it("only accepts bookings genuinely past checkout time", () => {
    expect(isHousekeepingEligibleBooking(booking(), NOW)).toBe(true);
    expect(
      isHousekeepingEligibleBooking(
        booking({ checkoutDate: "2026-06-05" }),
        NOW,
      ),
    ).toBe(false);
  });

  it("rejects cancelled/void bookings and missing bookings", () => {
    expect(
      isHousekeepingEligibleBooking(booking({ cancelled: true }), NOW),
    ).toBe(false);
    expect(
      isHousekeepingEligibleBooking(booking({ status: "Cancelled" }), NOW),
    ).toBe(false);
    expect(isHousekeepingEligibleBooking(null, NOW)).toBe(false);
    expect(isHousekeepingEligibleBooking({}, NOW)).toBe(false);
  });

  it("ignores a stale 'Checked Out' stored status and decides via the real dates", () => {
    const now = new Date("2026-08-20T14:00:00");
    // Future booking wrongly stamped checked out in storage — not eligible.
    expect(
      isHousekeepingEligibleBooking(
        booking({ bookingStatus: "Checked Out", checkoutDate: "2026-08-25" }),
        now,
      ),
    ).toBe(false);
    // Genuinely past checkout — eligible even with the same stale stamp.
    expect(
      isHousekeepingEligibleBooking(
        booking({ bookingStatus: "Checked Out" }),
        NOW,
      ),
    ).toBe(true);
  });
});

describe("isCheckoutAtOrAfter", () => {
  it("accepts a checkout at the session boundary", () => {
    const cutoff = new Date("2026-06-03T12:00:00");
    expect(isCheckoutAtOrAfter(cutoff, booking())).toBe(true);
  });

  it("accepts a checkout after the session boundary", () => {
    const cutoff = new Date("2026-06-02T12:00:00");
    expect(isCheckoutAtOrAfter(cutoff, booking())).toBe(true);
  });

  it("skips a checkout that finished before the session boundary", () => {
    const cutoff = new Date("2026-06-04T12:00:00");
    expect(isCheckoutAtOrAfter(cutoff, booking())).toBe(false);
  });

  it("is false when there is no usable checkout time", () => {
    expect(isCheckoutAtOrAfter(new Date(), {})).toBe(false);
    expect(isCheckoutAtOrAfter(new Date(), null)).toBe(false);
  });
});

describe("shouldCreateHousekeeping", () => {
  it("requires a completed transition, a checkout reminder and a checked-out booking", () => {
    expect(
      shouldCreateHousekeeping({
        reminder: checkoutReminder(),
        booking: booking(),
        now: NOW,
        nowCompleted: true,
      }),
    ).toBe(true);
    // Not completed by staff -> never create from a clock tick alone.
    expect(
      shouldCreateHousekeeping({
        reminder: checkoutReminder({ completed: false }),
        booking: booking(),
        now: NOW,
        nowCompleted: false,
      }),
    ).toBe(false);
    // Checkout time not reached -> no task yet.
    expect(
      shouldCreateHousekeeping({
        reminder: checkoutReminder(),
        booking: booking({ checkoutDate: "2026-06-05" }),
        now: NOW,
        nowCompleted: true,
      }),
    ).toBe(false);
    // Non-checkout reminder -> skip.
    expect(
      shouldCreateHousekeeping({
        reminder: { id: "r1", title: "Pay utility bill" },
        booking: booking(),
        now: NOW,
        nowCompleted: true,
      }),
    ).toBe(false);
  });

  it("is idempotent when a task already exists", () => {
    expect(
      shouldCreateHousekeeping({
        reminder: checkoutReminder(),
        booking: booking(),
        now: NOW,
        nowCompleted: true,
        existing: true,
      }),
    ).toBe(false);
  });
});

describe("buildHousekeepingTask", () => {
  it("builds a Pending task referencing the booking and guest", () => {
    const task = buildHousekeepingTask({
      reminder: checkoutReminder(),
      booking: booking(),
      now: NOW,
      userId: "u45",
    });
    expect(task.id).toBe("housekeeping-b1-2026-06-03");
    expect(task.bookingId).toBe("b1");
    expect(task.unitName).toBe("1532 B");
    expect(task.guestName).toBe("Juan Dela Cruz");
    expect(task.status).toBe(HOUSEKEEPING_STATUS_PENDING);
    expect(task.priority).toBe("high");
    expect(task.checkoutDateLocal).toBe("2026-06-03");
    expect(task.sourceReminderId).toBe("checkout-due-b1-2026-06-03");
    expect(task.uid).toBe("u45");
  });

  it("falls back to reminder fields when booking lacks unit/guest info", () => {
    const task = buildHousekeepingTask({
      reminder: checkoutReminder({ unitName: "1567 C2" }),
      booking: booking({ unitName: "", guestFirstName: "", guestLastName: "" }),
      now: NOW,
      userId: undefined,
    });
    expect(task.unitName).toBe("1567 C2");
    expect(task.guestName).not.toBe("");
    expect(task.uid).toBeNull();
  });
});

describe("nextHousekeepingStatus", () => {
  it("moves Pending -> In Progress -> Completed and clamps weird values", () => {
    expect(nextHousekeepingStatus(HOUSEKEEPING_STATUS_PENDING)).toBe(
      HOUSEKEEPING_STATUS_IN_PROGRESS,
    );
    expect(nextHousekeepingStatus(HOUSEKEEPING_STATUS_IN_PROGRESS)).toBe(
      HOUSEKEEPING_STATUS_COMPLETED,
    );
    expect(nextHousekeepingStatus(HOUSEKEEPING_STATUS_COMPLETED)).toBe(
      HOUSEKEEPING_STATUS_COMPLETED,
    );
    expect(nextHousekeepingStatus("")).toBe(HOUSEKEEPING_STATUS_PENDING);
    expect(nextHousekeepingStatus(undefined)).toBe(
      HOUSEKEEPING_STATUS_PENDING,
    );
  });
});

describe("canAccessResource", () => {
  it("denies viewers but allows staff and admin", () => {
    expect(canAccessResource("viewer", "housekeeping")).toBe(false);
    expect(canAccessResource("viewer", "reminders")).toBe(false);
    expect(canAccessResource("staff", "housekeeping")).toBe(true);
    expect(canAccessResource("admin", "housekeeping")).toBe(true);
    expect(canAccessResource(undefined, "housekeeping")).toBe(false);
  });
});
