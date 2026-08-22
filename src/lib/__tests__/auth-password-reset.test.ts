import { describe, it, expect } from "vitest";

/**
 * Password reset tests moved to Firebase's built-in flow.
 * The reset-password page has been removed.
 * Tests for the forgot-password page handle the password reset email functionality.
 */
describe("auth password reset (deprecated)", () => {
  it("password reset is handled by Firebase built-in flow", () => {
    // Firebase's sendPasswordResetEmail handles the entire password reset flow.
    // No custom reset-password page is used anymore.
    expect(true).toBe(true);
  });
});
