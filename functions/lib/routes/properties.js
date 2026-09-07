"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== "default") __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.propertiesRouter = void 0;
const express_1 = __importDefault(require("express"));
const ical_generator_1 = __importStar(require("ical-generator"));
const route_helpers_1 = require("../lib/route-helpers");
// ponytail: Group properties, units, expenses, receipt settings, and iCal outputs together.
exports.propertiesRouter = express_1.default.Router();
exports.propertiesRouter.use(route_helpers_1.authenticate);
exports.propertiesRouter.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  return (0, route_helpers_1.requireOperationsStaff)(req, res, next);
});
exports.propertiesRouter.get("/units", async (req, res) => {
  try {
    const units = await (0, route_helpers_1.getCollection)("units");
    return res.status(200).json(units);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch units" });
  }
});
exports.propertiesRouter.get("/unit/:unitId", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const docSnap = await adminDb
      .collection("units")
      .doc(req.params.unitId)
      .get();
    if (!docSnap.exists)
      return res.status(404).json({ error: "Unit not found" });
    return res.status(200).json({ id: docSnap.id, ...docSnap.data() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch unit" });
  }
});
exports.propertiesRouter.post("/unit", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const body = req.body ?? {};
    const calendars = (0, route_helpers_1.sanitizeCalendars)(body);
    const docRef = adminDb.collection("units").doc();
    const directCalendarUrl = (0, route_helpers_1.getDirectCalendarUrl)(
      req,
      docRef.id,
    );
    const pricing = (0, route_helpers_1.normalizeUnitPricing)(body);
    const newUnit = (0, route_helpers_1.stripUndefinedFields)({
      ...body,
      ...pricing,
      calendars: {
        ...calendars,
        direct: directCalendarUrl,
      },
    });
    await docRef.set(newUnit);
    const discordMessage = `
-----------------------------
🏢 New Unit Added!
-----------------------------
**Unit ID:** ${docRef.id}
**Name:** ${newUnit.name}
**Type:** ${newUnit.type || "N/A"}
**Capacity:** ${newUnit.capacity || "N/A"}
**Calendars:** Airbnb=${newUnit.calendars?.airbnb ? "✅" : "❌"} | Booking=${newUnit.calendars?.bookingCom ? "✅" : "❌"} | Direct=${newUnit.calendars?.direct ? "✅" : "❌"}
**Direct iCal:** ${directCalendarUrl}
`;
    await (0, route_helpers_1.sendDiscordNotification)({
      content: discordMessage,
    });
    return res
      .status(201)
      .json({ id: docRef.id, calendars: newUnit.calendars });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create unit" });
  }
});
exports.propertiesRouter.put("/unit/:unitId", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const body = req.body ?? {};
    const unitId = req.params.unitId;
    const ref = adminDb.collection("units").doc(unitId);
    const beforeSnap = await ref.get();
    const before = beforeSnap.data();
    if (!beforeSnap.exists)
      return res.status(404).json({ error: "Unit not found" });
    const pricing = (0, route_helpers_1.normalizeUnitPricing)(body, before);
    const unitData = (0, route_helpers_1.stripUndefinedFields)({
      ...body,
      ...pricing,
    });
    const directCalendarUrl = (0, route_helpers_1.getDirectCalendarUrl)(
      req,
      unitId,
    );
    if ("calendars" in body) {
      unitData.calendars = {
        ...(0, route_helpers_1.sanitizeCalendars)(body),
        direct: directCalendarUrl,
      };
    } else {
      unitData.calendars = {
        direct: directCalendarUrl,
      };
    }
    if (!("calendars" in body)) {
      unitData.calendars = {
        ...(before?.calendars ?? {}),
        direct: directCalendarUrl,
      };
    }
    await ref.update(unitData);
    const afterSnap = await ref.get();
    const after = afterSnap.data();
    const changedFields = (0, route_helpers_1.buildChangedFields)(
      before,
      after,
      Object.keys(unitData),
    );
    if (changedFields.trim()) {
      await (0, route_helpers_1.sendDiscordNotification)({
        content: `
-----------------------------
✏️ Unit **${unitId}** was updated:
-----------------------------
**Name:** ${after?.name || "N/A"}
**Direct iCal:** ${directCalendarUrl}
${changedFields}
`,
      });
    }
    return res.status(200).json({
      message: "Unit updated successfully",
      calendars: after?.calendars,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update unit" });
  }
});
exports.propertiesRouter.delete("/unit/:unitId", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const docRef = adminDb.collection("units").doc(req.params.unitId);
    const docSnap = await docRef.get();
    const unit = docSnap.data();
    await docRef.delete();
    if (unit) {
      try {
        await (0, route_helpers_1.sendDiscordNotification)({
          content: `
-----------------------------
❌ Unit deleted!
-----------------------------
**Unit ID:** ${req.params.unitId}
**Name:** ${unit.name}
**Type:** ${unit.type || "N/A"}
**Capacity:** ${unit.capacity || "N/A"}`,
        });
      } catch (err) {
        console.error("Discord notification failed:", err);
      }
    }
    return res.status(200).json({ message: "Unit deleted successfully" });
  } catch (err) {
    console.error("Failed to delete unit:", err);
    return res.status(500).json({ error: "Failed to delete unit" });
  }
});
exports.propertiesRouter.get("/ical/:unitId", async (req, res) => {
  try {
    const unitId = String(req.params.unitId || "").replace(/\.ics$/i, "");
    const adminDb = (0, route_helpers_1.getDb)();
    const unitSnap = await adminDb.collection("units").doc(unitId).get();
    if (!unitSnap.exists) {
      return res.status(404).send("Unit not found");
    }
    const unit = unitSnap.data();
    const directCalendarUrl = (0, route_helpers_1.getDirectCalendarUrl)(
      req,
      unitId,
    );
    if (unit.calendars?.direct !== directCalendarUrl) {
      await unitSnap.ref.set(
        {
          calendars: {
            ...(unit.calendars ?? {}),
            direct: directCalendarUrl,
          },
        },
        { merge: true },
      );
      unit.calendars = {
        ...(unit.calendars ?? {}),
        direct: directCalendarUrl,
      };
    }
    const bookingsSnap = await adminDb
      .collection("bookings")
      .where("unitId", "==", unitId)
      .get();
    const calendar = (0, ical_generator_1.default)({
      name: `${unit.name} Availability`,
      timezone: "UTC",
      method: ical_generator_1.ICalCalendarMethod.PUBLISH,
    });
    bookingsSnap.forEach((doc) => {
      const booking = doc.data();
      if (!booking.checkinDate || !booking.checkoutDate) return;
      calendar
        .createEvent({
          start: new Date(),
          end: new Date(),
        })
        .id(booking.id || doc.id)
        .uid(`booking-${booking.bookingId || doc.id}@yourdomain.com`)
        .start(new Date(booking.checkinDate))
        .end(new Date(booking.checkoutDate))
        .summary("Reserved")
        .description(`Booking ID: ${booking.bookingId || doc.id}`)
        .status(ical_generator_1.ICalEventStatus.CONFIRMED)
        .transparency(ical_generator_1.ICalEventTransparency.OPAQUE);
    });
    // Publish the same one-time winter closure in each existing direct iCal
    // feed. This creates no Firestore booking and expires after Jan 31, 2027.
    calendar
      .createEvent({
        start: new Date("2026-12-01T00:00:00Z"),
        end: new Date("2027-02-01T00:00:00Z"),
      })
      .id(`calendar-closure-winter-2026-${unitId}`)
      .uid(`calendar-closure-winter-2026-${unitId}@yourdomain.com`)
      .summary("Unavailable")
      .description(
        "Property unavailable from December 1, 2026 through January 31, 2027.",
      )
      .status(ical_generator_1.ICalEventStatus.CONFIRMED)
      .transparency(ical_generator_1.ICalEventTransparency.OPAQUE);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="unit-${unitId}.ics"`,
    );
    return res.status(200).send(calendar.toString());
  } catch (err) {
    console.error("iCal export failed:", err);
    return res.status(500).send("Failed to generate iCal");
  }
});
exports.propertiesRouter.get("/expenses", async (req, res) => {
  try {
    const expenses = await (0, route_helpers_1.getCollection)("expenses");
    return res.status(200).json(expenses);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch expenses" });
  }
});
exports.propertiesRouter.post("/expense", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const requestBody = (0, route_helpers_1.stripUndefinedFields)(
      req.body ?? {},
    );
    const normalized = (0, route_helpers_1.normalizeExpenseInput)(requestBody);
    if (
      normalized.amountMode === "per_unit" &&
      normalized.unitIds.length === 0
    ) {
      return res.status(400).json({
        error:
          "unitIds must contain at least 1 unit when amountMode is per_unit",
      });
    }
    const totals = (0, route_helpers_1.computeExpenseTotals)(normalized);
    const docData = (0, route_helpers_1.buildExpenseFirestoreDocument)(
      normalized,
      totals,
      {
        createdAt: requestBody.createdAt || new Date().toISOString(),
        ...(requestBody.updatedAt ? { updatedAt: requestBody.updatedAt } : {}),
      },
    );
    // Use deterministic ID if provided (for idempotency), otherwise auto-generate
    if (requestBody.id) {
      await adminDb
        .collection("expenses")
        .doc(requestBody.id)
        .set(docData, { merge: true });
      return res.status(201).json({ id: requestBody.id });
    } else {
      const docRef = await adminDb.collection("expenses").add(docData);
      return res.status(201).json({ id: docRef.id });
    }
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: err?.message ?? "Failed to create expense" });
  }
});
exports.propertiesRouter.put("/expense/:expenseId", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const ref = adminDb.collection("expenses").doc(req.params.expenseId);
    const beforeSnap = await ref.get();
    if (!beforeSnap.exists)
      return res.status(404).json({ error: "Expense not found" });
    const before = beforeSnap.data();
    const requestBody = (0, route_helpers_1.stripUndefinedFields)(
      req.body ?? {},
    );
    const merged = { ...before, ...requestBody };
    const normalized = (0, route_helpers_1.normalizeExpenseInput)(merged);
    if (
      normalized.amountMode === "per_unit" &&
      normalized.unitIds.length === 0
    ) {
      return res.status(400).json({
        error:
          "unitIds must contain at least 1 unit when amountMode is per_unit",
      });
    }
    const totals = (0, route_helpers_1.computeExpenseTotals)(normalized);
    const docData = (0, route_helpers_1.buildExpenseFirestoreDocument)(
      normalized,
      totals,
      {
        updatedAt: requestBody.updatedAt || new Date().toISOString(),
      },
    );
    await ref.update(docData);
    return res.status(200).json({ message: "Expense updated successfully" });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: err?.message ?? "Failed to update expense" });
  }
});
exports.propertiesRouter.delete("/expense/:expenseId", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    await adminDb.collection("expenses").doc(req.params.expenseId).delete();
    return res.status(200).json({ message: "Expense deleted successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete expense" });
  }
});
exports.propertiesRouter.get("/receipt-settings", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const docSnap = await adminDb
      .collection("config")
      .doc("receiptSettings")
      .get();
    if (!docSnap.exists) {
      return res.status(200).json({
        wifiNetwork: "Manila Prime WiFi",
        contactEmail: "primestaycation24@gmail.com",
        checkinTime: "15:00",
        checkoutTime: "11:00",
      });
    }
    return res.status(200).json(docSnap.data());
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch receipt settings" });
  }
});
exports.propertiesRouter.post("/receipt-settings", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const settings = req.body;
    await adminDb
      .collection("config")
      .doc("receiptSettings")
      .set(settings, { merge: true });
    return res
      .status(200)
      .json({ message: "Receipt settings updated successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update receipt settings" });
  }
});
//# sourceMappingURL=properties.js.map
