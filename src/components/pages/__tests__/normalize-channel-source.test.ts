import { describe, expect, it } from "vitest";
import { normalizeChannelSource } from "@/components/pages/dashboard-client";

describe("normalizeChannelSource", () => {
  it("maps single booking origins to the six dashboard categories", () => {
    expect(normalizeChannelSource("FACEBOOK PAGE")).toBe("Facebook");
    expect(normalizeChannelSource("AIRBNB")).toBe("Airbnb");
    expect(normalizeChannelSource("Booking")).toBe("Booking.com");
    expect(normalizeChannelSource("STAFF")).toBe("Staff / Referral");
    expect(normalizeChannelSource("REFERRAL")).toBe("Staff / Referral");
  });

  it("classifies payment-status-only and unknown origins as Other", () => {
    expect(normalizeChannelSource("AWAITING PAYMENT")).toBe("Other");
    expect(normalizeChannelSource("FULLY PAID")).toBe("Other");
    expect(normalizeChannelSource("N/A")).toBe("Other");
    expect(normalizeChannelSource("RESERVE")).toBe("Other");
  });

  it("defaults empty or missing sources to Direct", () => {
    expect(normalizeChannelSource("")).toBe("Direct");
    expect(normalizeChannelSource("   ")).toBe("Direct");
    expect(normalizeChannelSource(undefined)).toBe("Direct");
    expect(normalizeChannelSource(null)).toBe("Direct");
    expect(normalizeChannelSource("Direct")).toBe("Direct");
  });

  it("does not create a combined channel record for mixed origins", () => {
    expect(normalizeChannelSource("AIRBNB | FACEBOOK PAGE")).toBe("Airbnb");
  });

  it("ignores payment-status tokens when a real booking source is present", () => {
    expect(normalizeChannelSource("AWAITING PAYMENT | AIRBNB")).toBe("Airbnb");
    expect(normalizeChannelSource("FULLY PAID | FACEBOOK PAGE")).toBe("Facebook");
  });

  it("classifies any value containing Airbnb as Airbnb", () => {
    expect(normalizeChannelSource("airbnb")).toBe("Airbnb");
    expect(normalizeChannelSource("Reservation via Airbnb")).toBe("Airbnb");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeChannelSource("  airbnb  ")).toBe("Airbnb");
    expect(normalizeChannelSource("booking")).toBe("Booking.com");
    expect(normalizeChannelSource("staff")).toBe("Staff / Referral");
  });
});
