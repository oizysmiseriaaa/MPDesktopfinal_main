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
exports.aiRouter = void 0;
const express_1 = __importDefault(require("express"));
const route_helpers_1 = require("../lib/route-helpers");
// ponytail: Group AI, Discord messaging, and debug tools in this route module.
exports.aiRouter = express_1.default.Router();
exports.aiRouter.use(route_helpers_1.authenticate);
exports.aiRouter.post("/ai/guest-response", async (req, res) => {
  try {
    const automatedGuestResponse = await (0, route_helpers_1.loadDynamicExport)(
      "../ai/flows/automated-guest-response",
      "automatedGuestResponse",
    );
    const result = await automatedGuestResponse({
      guestInquiry: String(req.body?.guestInquiry || ""),
      listingDetails: String(req.body?.listingDetails || ""),
      hostInstructions: String(req.body?.hostInstructions || ""),
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("AI guest response failed:", err);
    return res.status(500).json({
      error: err?.message || "Failed to generate guest response",
    });
  }
});
exports.aiRouter.post("/ai/listing-description", async (req, res) => {
  try {
    const generateListingDescription = await (0,
    route_helpers_1.loadDynamicExport)(
      "../ai/flows/listing-description-generator",
      "generateListingDescription",
    );
    const result = await generateListingDescription({
      propertyName: String(req.body?.propertyName || ""),
      location: String(req.body?.location || ""),
      bedrooms: (0, route_helpers_1.toNumber)(req.body?.bedrooms) || 1,
      bathrooms: (0, route_helpers_1.toNumber)(req.body?.bathrooms) || 1,
      guests: (0, route_helpers_1.toNumber)(req.body?.guests) || 1,
      amenities: Array.isArray(req.body?.amenities)
        ? req.body.amenities.map((item) => String(item)).filter(Boolean)
        : [],
      uniqueSellingPoints: Array.isArray(req.body?.uniqueSellingPoints)
        ? req.body.uniqueSellingPoints
            .map((item) => String(item))
            .filter(Boolean)
        : [],
      targetAudience: req.body?.targetAudience
        ? String(req.body.targetAudience)
        : undefined,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("AI listing description failed:", err);
    return res.status(500).json({
      error: err?.message || "Failed to generate listing description",
    });
  }
});
exports.aiRouter.post("/ai/report-summary", async (req, res) => {
  const reportData = req.body?.reportData ?? req.body ?? {};
  try {
    const genkitModulePath = "../ai/genkit";
    const { ai } = await Promise.resolve(`${genkitModulePath}`).then((s) =>
      __importStar(require(s)),
    );
    if (!ai?.generate) {
      throw new Error("Genkit AI client is not available.");
    }
    const response = await ai.generate({
      model: "googleai/gemini-1.5-flash",
      system:
        "You are a concise financial analyst for a property management business.",
      prompt: `
Summarize this property management report in 4-6 practical sentences.
Mention revenue, expenses, profit/loss, and one operational recommendation.

Report JSON:
${(0, route_helpers_1.safeJson)(reportData)}
`,
    });
    const maybeText = response?.text;
    const summary =
      typeof maybeText === "function"
        ? maybeText.call(response)
        : typeof maybeText === "string"
          ? maybeText
          : response?.output?.summary;
    return res.status(200).json({
      summary: String(
        summary || (0, route_helpers_1.buildBasicReportSummary)(reportData),
      ),
    });
  } catch (err) {
    console.error("AI report summary failed, returning fallback summary:", err);
    return res.status(200).json({
      summary: (0, route_helpers_1.buildBasicReportSummary)(reportData),
      fallback: true,
    });
  }
});
exports.aiRouter.post(
  "/sendDiscordNotification",
  route_helpers_1.requireOperationsStaff,
  async (req, res) => {
    try {
      const input = req.body;
      const result = await (0, route_helpers_1.sendDiscordNotification)(input);
      return res.status(result.success ? 200 : 500).json(result);
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ error: "Failed to send Discord notification" });
    }
  },
);
exports.aiRouter.post(
  "/external-booking",
  route_helpers_1.requireOperationsStaff,
  async (req, res) => {
    try {
      const adminDb = (0, route_helpers_1.getDb)();
      const newBooking = req.body;
      const docRef = adminDb.collection("bookings").doc();
      const id = docRef.id;
      const booking = {
        ...newBooking,
        id,
        bookingId: id,
        createdAt: new Date().toISOString(),
      };
      await (0, route_helpers_1.reserveBookingOccupancy)(
        adminDb,
        docRef,
        booking,
      );
      try {
        const unitDoc = await adminDb
          .collection("units")
          .doc(newBooking.unitId)
          .get();
        const unitName = unitDoc.exists ? unitDoc.data()?.name : "Unknown unit";
        await (0, route_helpers_1.sendDiscordNotification)({
          content: `
-----------------------------
🎉 New booking external source confirmed!
-----------------------------
**Source:** ${newBooking.source}
**Unit:** ${unitName}
**Guest:** ${newBooking.guestFirstName} ${newBooking.guestLastName || "N/A"}
**From:** ${newBooking.checkinDate} 
**To:** ${newBooking.checkoutDate}
**Total:** ₱${(newBooking.totalAmount ?? 0).toLocaleString()}

\u200B`,
        });
      } catch (e) {
        console.error("Discord notification failed for external booking", e);
      }
      await adminDb.collection("notifications").add({
        type: "booking",
        title: `Booking from ${newBooking.source}`,
        description: `Booking for unit ${newBooking.unitId} from ${newBooking.checkinDate} to ${newBooking.checkoutDate}`,
        createdAt: new Date().toISOString(),
        isRead: false,
        data: {
          bookingId: docRef.id,
          unitId: newBooking.unitId,
          source: newBooking.source,
        },
      });
      return res.status(201).json({ id: docRef.id });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ error: "Failed to create external booking" });
    }
  },
);
exports.aiRouter.get(
  "/backfillBookingIds",
  route_helpers_1.requireAdmin,
  async (req, res) => {
    try {
      const adminDb = (0, route_helpers_1.getDb)();
      const bookingsSnapshot = await adminDb.collection("bookings").get();
      if (bookingsSnapshot.empty) {
        return res.status(200).send("No bookings found to backfill.");
      }
      const batch = adminDb.batch();
      let updatedCount = 0;
      bookingsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.id) {
          batch.update(doc.ref, { id: doc.id });
          updatedCount++;
          console.log(`✅ Backfilled booking id for doc ${doc.id}`);
        }
      });
      await batch.commit();
      if (updatedCount === 0) {
        return res
          .status(200)
          .send("All bookings already have IDs. Nothing to backfill.");
      } else {
        return res
          .status(200)
          .send(`✅ Backfill complete! Total updated: ${updatedCount}`);
      }
    } catch (err) {
      console.error("❌ Backfill failed:", err);
      return res.status(500).send("❌ Backfill failed");
    }
  },
);
//# sourceMappingURL=ai.js.map
