import { describe, expect, it } from "vitest";
import {
  calculateAgentCommission,
  getEffectiveExtraGuestRate,
} from "../agent-commission";

describe("agent commission calculation", () => {
  it("calculates base commission from the base unit rate and nights", () => {
    expect(
      calculateAgentCommission({
        unit: { rate: 2000 },
        nights: 3,
        extraGuestCount: 0,
      }),
    ).toBe(1500);
  });

  it("calculates extra guest commission independently", () => {
    expect(
      calculateAgentCommission({
        unit: { rate: 1500, extraGuestFee: 500 },
        nights: 3,
        extraGuestCount: 2,
      }),
    ).toBe(1200);
  });

  it.each([undefined, null, "", "invalid", 299, 300])(
    "uses 300 as the minimum effective extra guest rate for %s",
    (rate) => {
      expect(getEffectiveExtraGuestRate({ extraGuestFee: rate })).toBe(300);
    },
  );

  it("never creates a negative extra guest commission", () => {
    expect(
      calculateAgentCommission({
        unit: { rate: 1500, extraGuestFee: 100 },
        nights: 3,
        extraGuestCount: 2,
      }),
    ).toBe(0);
  });

  it("uses the configured base rate when it is higher than the legacy rate", () => {
    expect(
      calculateAgentCommission({
        unit: { basePrice: 2000, rate: 1500 },
        nights: 2,
        extraGuestCount: 0,
      }),
    ).toBe(1000);
  });
});
