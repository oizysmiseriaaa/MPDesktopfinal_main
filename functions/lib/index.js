"use strict";
"use server";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillBookingIds =
  exports.googleSheetSyncScheduled =
  exports.bookingDeleted =
  exports.bookingUpdated =
  exports.bookingCreated =
  exports.api =
    void 0;
const https_1 = require("firebase-functions/v2/https");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = require("dotenv");
const bookings_1 = require("./routes/bookings");
const properties_1 = require("./routes/properties");
const entities_1 = require("./routes/entities");
const ai_1 = require("./routes/ai");
const sync_1 = require("./routes/sync");
// ponytail: load dotenv locally (not in production)
if (process.env.NODE_ENV !== "production") {
  (0, dotenv_1.config)();
}
const app = (0, express_1.default)();
app.set("trust proxy", true);
app.use(
  (0, cors_1.default)({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-sync-key"],
  }),
);
app.use(express_1.default.json({ limit: "5mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "5mb" }));
// Explicit OPTIONS response (preflight)
app.options("*", (0, cors_1.default)());
app.options("*", (_req, res) => res.sendStatus(204));
// Load modular routes
app.use(bookings_1.bookingsRouter);
app.use(properties_1.propertiesRouter);
app.use(entities_1.entitiesRouter);
app.use(ai_1.aiRouter);
app.use(sync_1.syncRouter);
// Firebase Function Export with secrets
// Manual expense saves must not depend on the Google Sheets spreadsheet secret.
// The spreadsheet secret is only required by the scheduled Google Sheets sync job.
exports.api = (0, https_1.onRequest)(
  {
    region: "asia-southeast1",
    secrets: ["SERVICE_ACCOUNT_KEY", "DISCORD_WEBHOOK_URL", "GEMINI_API_KEY"],
  },
  app,
);
// Firestore triggers for Google Calendar
var booking_calendar_sync_1 = require("./triggers/booking-calendar-sync");
Object.defineProperty(exports, "bookingCreated", {
  enumerable: true,
  get: function () {
    return booking_calendar_sync_1.bookingCreated;
  },
});
Object.defineProperty(exports, "bookingUpdated", {
  enumerable: true,
  get: function () {
    return booking_calendar_sync_1.bookingUpdated;
  },
});
Object.defineProperty(exports, "bookingDeleted", {
  enumerable: true,
  get: function () {
    return booking_calendar_sync_1.bookingDeleted;
  },
});
var backfillBookingIds_1 = require("./scripts/backfillBookingIds");
Object.defineProperty(exports, "backfillBookingIds", {
  enumerable: true,
  get: function () {
    return backfillBookingIds_1.backfillBookingIds;
  },
});
var google_sheet_sync_1 = require("./triggers/google-sheet-sync");
Object.defineProperty(exports, "googleSheetSyncScheduled", {
  enumerable: true,
  get: function () {
    return google_sheet_sync_1.googleSheetSyncScheduled;
  },
});
//# sourceMappingURL=index.js.map
