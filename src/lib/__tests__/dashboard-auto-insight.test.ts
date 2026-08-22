import { describe, expect, it } from "vitest";
import { shouldAttemptAutomaticInsight } from "@/components/pages/dashboard-client";

describe("automatic Dashboard insight requests", () => {
  it("does not retry a failed automatic request for the same user and month", () => {
    const attempted = new Set<string>();
    const key = "user-1:2026-08";

    expect(
      shouldAttemptAutomaticInsight(true, false, false, key, attempted),
    ).toBe(true);

    attempted.add(key);

    expect(
      shouldAttemptAutomaticInsight(true, false, false, key, attempted),
    ).toBe(false);
  });

  it("does not start while loading, without data, or after a success", () => {
    const attempted = new Set<string>();
    const key = "user-1:2026-08";

    expect(
      shouldAttemptAutomaticInsight(false, false, false, key, attempted),
    ).toBe(false);
    expect(
      shouldAttemptAutomaticInsight(true, false, true, key, attempted),
    ).toBe(false);
    expect(
      shouldAttemptAutomaticInsight(true, true, false, key, attempted),
    ).toBe(false);
  });
});
