"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const route_helpers_1 = require("../route-helpers");
// ponytail: basic clean tests to confirm standard math and formatting functionalities.
describe("toNumber helper", () => {
  it("converts numeric string to number", () => {
    expect((0, route_helpers_1.toNumber)("123.45")).toBe(123.45);
  });
  it("returns 0 for non-numeric/null values", () => {
    expect((0, route_helpers_1.toNumber)("abc")).toBe(0);
    expect((0, route_helpers_1.toNumber)(null)).toBe(0);
    expect((0, route_helpers_1.toNumber)(undefined)).toBe(0);
  });
});
describe("clampInt helper", () => {
  it("clamps number to a minimum and maximum range", () => {
    expect((0, route_helpers_1.clampInt)(5, 1, 10)).toBe(5);
    expect((0, route_helpers_1.clampInt)(0, 1, 10)).toBe(1);
    expect((0, route_helpers_1.clampInt)(15, 1, 10)).toBe(10);
  });
});
describe("booking payment status normalization", () => {
  it("uses the canonical Paid/Partial/Unpaid values case-insensitively", () => {
    expect(
      (0, route_helpers_1.resolveBookingPaymentStatus)({
        paymentStatus: "paid",
      }),
    ).toBe("Paid");
    expect(
      (0, route_helpers_1.resolveBookingPaymentStatus)({
        bookingPaymentStatus: "PARTIAL",
      }),
    ).toBe("Partial");
    expect(
      (0, route_helpers_1.resolveBookingPaymentStatus)({
        paymentStatus: "unpaid",
      }),
    ).toBe("Unpaid");
  });
});
describe("stableStringify helper", () => {
  it("stringifies object deterministically by sorting keys", () => {
    const objA = { b: 2, a: 1 };
    const objB = { a: 1, b: 2 };
    expect((0, route_helpers_1.stableStringify)(objA)).toBe(
      (0, route_helpers_1.stableStringify)(objB),
    );
    expect((0, route_helpers_1.stableStringify)(objA)).toBe('{"a":1,"b":2}');
  });
});
describe("computeAgentCommission logic", () => {
  it("computes base commission from the base unit rate and nights", () => {
    const mockAgent = {
      id: "agent1",
      commissionType: "fixed_commission",
    };
    const commission = (0, route_helpers_1.computeAgentCommission)(
      mockAgent,
      { checkinDate: "2026-10-01", checkoutDate: "2026-10-04" },
      { rate: 2000, capacity: 2 },
    );
    expect(commission).toBe(1500);
  });

  it("uses the minimum extra guest rate and calculates extra guests per night", () => {
    const commission = (0, route_helpers_1.computeAgentCommission)(
      { id: "agent2" },
      {
        checkinDate: "2026-10-01",
        checkoutDate: "2026-10-04",
        adults: 4,
        children: 0,
      },
      { rate: 1500, capacity: 2, extraGuestFee: 500 },
    );
    expect(commission).toBe(1200);
  });
});
//# sourceMappingURL=helpers.test.js.map
