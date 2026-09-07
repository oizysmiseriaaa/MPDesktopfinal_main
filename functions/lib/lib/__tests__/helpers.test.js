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
  it("computes percentage commission correctly", () => {
    const mockAgent = {
      id: "agent1",
      name: "Agent One",
      email: "",
      phone: "",
      commissionType: "percentage",
      commissionRate: 10,
      totalBookings: 0,
      totalCommissions: 0,
      joinDate: "",
      status: "active",
    };
    const baseRate = 5000;
    const totalPaid = 5500;
    const commission = (0, route_helpers_1.computeAgentCommission)(
      mockAgent,
      baseRate,
      totalPaid,
    );
    expect(commission).toBe(500); // 10% of 5000
  });
  it("computes fixed commission markup correctly", () => {
    const mockAgent = {
      id: "agent2",
      name: "Agent Two",
      email: "",
      phone: "",
      commissionType: "fixed_commission",
      commissionRate: 0,
      totalBookings: 0,
      totalCommissions: 0,
      joinDate: "",
      status: "active",
    };
    const baseRate = 4500;
    const totalPaid = 5200;
    const commission = (0, route_helpers_1.computeAgentCommission)(
      mockAgent,
      baseRate,
      totalPaid,
    );
    expect(commission).toBe(700); // totalPaid - baseRate
  });
});
//# sourceMappingURL=helpers.test.js.map
