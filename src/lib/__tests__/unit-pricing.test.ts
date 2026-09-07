import { describe, expect, it } from "vitest";
import {
  getUnitBasePrice,
  getUnitFinalPrice,
  getUnitMarkup,
} from "../unit-pricing";

describe("unit fixed markup pricing", () => {
  it.each([
    [1800, 500, 2300],
    [1800, 1000, 2800],
    [1800, 0, 1800],
  ])(
    "adds %s base price and %s markup to %s",
    (basePrice, markup, expected) => {
      expect(getUnitFinalPrice({ basePrice, markup })).toBe(expected);
    },
  );

  it("keeps legacy rate-only units compatible", () => {
    expect(getUnitBasePrice({ rate: 1800 })).toBe(1800);
    expect(getUnitMarkup({ rate: 1800 })).toBe(0);
    expect(getUnitFinalPrice({ rate: 1800 })).toBe(1800);
  });

  it("treats empty or invalid markup as zero", () => {
    expect(getUnitMarkup({ basePrice: 1800, markup: "" })).toBe(0);
    expect(getUnitMarkup({ basePrice: 1800, markup: "not-a-number" })).toBe(0);
    expect(getUnitFinalPrice({ basePrice: 1800, markup: undefined })).toBe(
      1800,
    );
  });
});
