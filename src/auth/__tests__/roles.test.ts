import { describe, expect, it } from "vitest";
import {
  canAccessPath,
  canAccessResource,
  canManageBookings,
  canManageOperations,
} from "../roles";

describe("role access", () => {
  it("keeps System Settings admin-only, including direct route access", () => {
    expect(canAccessPath("admin", "/settings/")).toBe(true);
    expect(canAccessPath("staff", "/settings/")).toBe(false);
    expect(canAccessPath("viewer", "/settings/")).toBe(false);
    expect(canAccessPath("staff", "/settings")).toBe(false);
    expect(canAccessPath("viewer", "/settings")).toBe(false);
  });

  it("allows staff to access Analytics while preserving viewer restrictions", () => {
    expect(canAccessPath("admin", "/analytics/")).toBe(true);
    expect(canAccessPath("staff", "/analytics/")).toBe(true);
    expect(canAccessPath("viewer", "/analytics/")).toBe(false);
  });

  it("keeps admin and staff equal for operational resources and CRUD guards", () => {
    for (const role of ["admin", "staff"]) {
      expect(canAccessResource(role, "bookings")).toBe(true);
      expect(canAccessResource(role, "payments")).toBe(true);
      expect(canManageBookings(role)).toBe(true);
      expect(canManageOperations(role)).toBe(true);
      expect(canAccessPath(role, "/bookings/")).toBe(true);
      expect(canAccessPath(role, "/calendar/")).toBe(true);
      expect(canAccessPath(role, "/payments/")).toBe(true);
      expect(canAccessPath(role, "/reminders/")).toBe(true);
      expect(canAccessPath(role, "/units/")).toBe(true);
      expect(canAccessPath(role, "/agents/")).toBe(true);
    }
  });

  it("does not expand viewer operational permissions", () => {
    expect(canAccessResource("viewer", "bookings")).toBe(false);
    expect(canManageBookings("viewer")).toBe(false);
    expect(canManageOperations("viewer")).toBe(false);
    expect(canAccessPath("viewer", "/bookings/")).toBe(true);
    expect(canAccessPath("viewer", "/analytics/")).toBe(false);
  });
});
