import { describe, it, expect } from "vitest";
import {
  normalizeExpenseInput,
  computeExpenseTotals,
  buildExpenseFirestoreDocument,
  stripUndefinedFields,
  requireOperationsStaff,
  normalizeRoleName,
  resolveProfileRoleForRequest,
} from "../route-helpers.js";

function hasUndefinedField(value, path = "") {
  if (value === undefined) {
    return [path || "(root)"];
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      hasUndefinedField(item, `${path}[${index}]`),
    );
  }
  return Object.entries(value).flatMap(([key, nested]) =>
    hasUndefinedField(nested, path ? `${path}.${key}` : key),
  );
}

function buildDocFromClientBody(body) {
  const normalized = normalizeExpenseInput(body);
  const totals = computeExpenseTotals(normalized);
  return buildExpenseFirestoreDocument(normalized, totals, {
    createdAt: body.createdAt || "2026-01-01T00:00:00.000Z",
    updatedAt: body.updatedAt,
  });
}

describe("expense Firestore payload", () => {
  it("A: Utilities + General/Unassigned saves without units or recurringDay", () => {
    const doc = buildDocFromClientBody({
      title: "Meralco Bill",
      category: "Utilities",
      amount: 5000,
      amountMode: "total",
      frequency: "one_time",
      date: "2026-01-15",
      unitName: "General/Unassigned",
      paymentMethod: "CASH",
      status: "Paid",
    });

    expect(hasUndefinedField(doc)).toEqual([]);
    expect(doc.recurringDay).toBeUndefined();
    expect("recurringDay" in doc).toBe(false);
    expect(doc.unitIds).toEqual([]);
    expect(doc.calculatedTotal).toBe(5000);
    expect(doc.amountMode).toBe("total");
  });

  it("B: Repairs + Single Unit saves with one unit", () => {
    const doc = buildDocFromClientBody({
      title: "Fixing of CR Door",
      category: "Repairs",
      amount: 1200,
      amountMode: "total",
      frequency: "one_time",
      date: "2026-01-15",
      unitIds: ["unit-1533"],
      unitId: "unit-1533",
      unitSelectionMode: "single",
      unitName: "1533 C2",
      status: "Paid",
    });

    expect(hasUndefinedField(doc)).toEqual([]);
    expect(doc.unitIds).toEqual(["unit-1533"]);
    expect(doc.unitId).toBe("unit-1533");
    expect(doc.calculatedTotal).toBe(1200);
  });

  it("C: Supplies + Multiple Units saves with multiple units", () => {
    const doc = buildDocFromClientBody({
      title: "Cleaning Supplies",
      category: "Supplies",
      amount: 900,
      amountMode: "total",
      frequency: "one_time",
      date: "2026-01-15",
      unitIds: ["u1", "u2", "u3"],
      unitSelectionMode: "multiple",
      distributionMode: "equal",
      unitName: "1533 C2, 1535 D, 1537 C2",
      status: "Paid",
    });

    expect(hasUndefinedField(doc)).toEqual([]);
    expect(doc.unitIds).toHaveLength(3);
    expect(doc.calculatedTotal).toBe(900);
  });

  it("D-H: category-only general expenses save for all categories", () => {
    const categories = [
      "Rent",
      "Agent Commission",
      "Shared Expense",
      "Staff Salaries / Wages",
      "Other Expenses",
    ];

    for (const category of categories) {
      const doc = buildDocFromClientBody({
        title: `${category} expense`,
        category,
        amount: 100,
        amountMode: "total",
        frequency: "one_time",
        date: "2026-01-15",
        unitName: "General/Unassigned",
        status: "Paid",
      });

      expect(hasUndefinedField(doc)).toEqual([]);
      expect(doc.unitIds).toEqual([]);
      expect(doc.calculatedTotal).toBe(100);
    }
  });

  it("I: one-time expense never includes recurringDay even when body has undefined", () => {
    const normalized = normalizeExpenseInput({
      title: "One-time",
      amount: 50,
      date: "2026-01-01",
      frequency: "one_time",
      recurringDay: undefined,
    });
    const doc = buildExpenseFirestoreDocument(
      normalized,
      computeExpenseTotals(normalized),
      {
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    );

    expect(hasUndefinedField(doc)).toEqual([]);
    expect("recurringDay" in doc).toBe(false);
  });

  it("J: recurring expense includes valid recurringDay", () => {
    const doc = buildDocFromClientBody({
      title: "Monthly Rent",
      category: "Rent",
      amount: 25000,
      amountMode: "total",
      frequency: "recurring",
      recurringDay: 15,
      date: "2026-01-15",
      unitName: "General/Unassigned",
      status: "Paid",
    });

    expect(hasUndefinedField(doc)).toEqual([]);
    expect(doc.recurringDay).toBe(15);
    expect(doc.frequency).toBe("recurring");
  });

  it("stripUndefinedFields removes nested undefined values", () => {
    const cleaned = stripUndefinedFields({
      title: "Test",
      recurringDay: undefined,
      distributionValues: { a: 1, b: undefined },
    });

    expect(hasUndefinedField(cleaned)).toEqual([]);
    expect("recurringDay" in cleaned).toBe(false);
    expect(cleaned.distributionValues).toEqual({ a: 1 });
  });

  it("K: normalizeRoleName accepts only admin/staff/viewer and trims case", () => {
    expect(normalizeRoleName("  ADMIN  ")).toBe("admin");
    expect(normalizeRoleName(" Staff ")).toBe("staff");
    expect(normalizeRoleName("viewer")).toBe("viewer");
    expect(normalizeRoleName("superuser")).toBe("");
  });

  it("L: Firestore profile role controls authorization for admin/staff/viewer", async () => {
    const next = () => "next";
    const res = {
      status(code) {
        return {
          json(payload) {
            return { code, payload };
          },
        };
      },
    };

    const adminProfile = { exists: true, data: () => ({ role: "  ADMIN  " }) };
    const staffProfile = { exists: true, data: () => ({ role: " Staff " }) };
    const viewerProfile = { exists: true, data: () => ({ role: "viewer" }) };
    const missingProfile = { exists: false, data: () => ({}) };

    await expect(
      resolveProfileRoleForRequest({ user: { uid: "admin-1" } }, adminProfile),
    ).resolves.toMatchObject({ allowed: true, normalizedRole: "admin" });

    await expect(
      resolveProfileRoleForRequest({ user: { uid: "staff-1" } }, staffProfile),
    ).resolves.toMatchObject({ allowed: true, normalizedRole: "staff" });

    await expect(
      resolveProfileRoleForRequest(
        { user: { uid: "viewer-1" } },
        viewerProfile,
      ),
    ).resolves.toMatchObject({ allowed: false, normalizedRole: "viewer" });

    await expect(
      resolveProfileRoleForRequest(
        { user: { uid: "missing-role-1" } },
        missingProfile,
      ),
    ).resolves.toMatchObject({ allowed: false, profileExists: false });

    await requireOperationsStaff(
      { user: { uid: "admin-1" } },
      res,
      next,
      adminProfile,
    );
    await requireOperationsStaff(
      { user: { uid: "staff-1" } },
      res,
      next,
      staffProfile,
    );

    const viewerResult = await requireOperationsStaff(
      { user: { uid: "viewer-1" } },
      res,
      next,
      viewerProfile,
    );
    expect(viewerResult).toEqual({
      code: 403,
      payload: { error: "Forbidden. Staff or admin access is required." },
    });
  });
});
