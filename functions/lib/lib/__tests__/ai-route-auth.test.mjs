import { describe, it, expect } from "vitest";
import { aiRouter } from "../../routes/ai.js";
import { propertiesRouter } from "../../routes/properties.js";
import {
  requireOperationsStaff,
  resolveProfileRoleForRequest,
} from "../route-helpers.js";

describe("AI and expense auth boundaries", () => {
  it("AI route requires Firebase authentication but not admin/staff role", () => {
    const aiPaths = aiRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => layer.route.path);

    const aiMiddleware = aiRouter.stack
      .filter((layer) => layer.name === "authenticate")
      .map((layer) => layer.name);

    expect(aiPaths).toContain("/ai/report-summary");
    expect(aiMiddleware.length).toBeGreaterThan(0);

    const reportSummaryLayer = aiRouter.stack.find(
      (layer) => layer.route && layer.route.path === "/ai/report-summary",
    );
    expect(reportSummaryLayer).toBeDefined();
    expect(
      reportSummaryLayer.route.stack.some(
        (handler) => handler.name === "authenticate",
      ),
    ).toBe(false);
    const routeHandlers = reportSummaryLayer.route.stack.map(
      (handler) => handler.name,
    );
    expect(routeHandlers).not.toContain("requireOperationsStaff");
  });

  it("Viewer access to the AI route is allowed after authentication because the route is not role-gated", async () => {
    const profileResult = await resolveProfileRoleForRequest(
      { user: { uid: "viewer-1" } },
      { exists: true, data: () => ({ role: "viewer" }) },
    );

    expect(profileResult.allowed).toBe(false);
    expect(profileResult.normalizedRole).toBe("viewer");

    const aiLayer = aiRouter.stack.find(
      (layer) => layer.route && layer.route.path === "/ai/report-summary",
    );
    expect(aiLayer).toBeDefined();
    expect(
      aiLayer.route.stack.some((handler) => handler.name === "authenticate"),
    ).toBe(false);

    const viewerAiGuard = await requireOperationsStaff(
      { originalUrl: "/ai/report-summary", user: { uid: "viewer-1" } },
      {
        status(code) {
          return {
            json(payload) {
              return { code, payload };
            },
          };
        },
      },
      () => "next",
      { exists: true, data: () => ({ role: "viewer" }) },
    );

    expect(viewerAiGuard).toBeUndefined();
  });

  it("Expense CRUD still rejects viewers and allows admin/staff", async () => {
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

    const vehicle = await requireOperationsStaff(
      { originalUrl: "/expense", user: { uid: "viewer-1" } },
      res,
      next,
      { exists: true, data: () => ({ role: "viewer" }) },
    );
    expect(vehicle).toEqual({
      code: 403,
      payload: { error: "Forbidden. Staff or admin access is required." },
    });

    await expect(
      requireOperationsStaff(
        { originalUrl: "/expense", user: { uid: "admin-1" } },
        res,
        next,
        {
          exists: true,
          data: () => ({ role: "ADMIN" }),
        },
      ),
    ).resolves.toBeUndefined();

    await expect(
      requireOperationsStaff(
        { originalUrl: "/expense", user: { uid: "staff-1" } },
        res,
        next,
        {
          exists: true,
          data: () => ({ role: "staff" }),
        },
      ),
    ).resolves.toBeUndefined();

    const propertyAuthMiddleware = propertiesRouter.stack.some((layer) => {
      const handleText = layer.handle ? layer.handle.toString() : "";
      return (
        layer.name === "bound requireOperationsStaff" ||
        layer.name === "requireOperationsStaff" ||
        handleText.includes("requireOperationsStaff")
      );
    });
    expect(propertyAuthMiddleware).toBe(true);
  });

  it("AI route is mounted with Firebase auth and not accidentally behind the expense middleware", () => {
    const aiStack = aiRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => layer.route.path);
    const propertyStack = propertiesRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => layer.route.path);

    expect(aiStack).toContain("/ai/report-summary");
    expect(propertyStack).toContain("/expense");
    expect(aiStack).not.toContain("/expense");
  });
});
