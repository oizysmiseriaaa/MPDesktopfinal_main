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
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = exports.requireAdmin = void 0;
exports.normalizeRoleName = normalizeRoleName;
exports.resolveProfileRoleForRequest = resolveProfileRoleForRequest;
exports.requireOperationsStaff = requireOperationsStaff;
exports.getDb = getDb;
exports.loadDynamicExport = loadDynamicExport;
exports.sendDiscordNotification = sendDiscordNotification;
exports.safeJson = safeJson;
exports.stableStringify = stableStringify;
exports.cleanDiscordText = cleanDiscordText;
exports.formatDiscordValue = formatDiscordValue;
exports.buildChangedFields = buildChangedFields;
exports.buildBasicReportSummary = buildBasicReportSummary;
exports.getCollection = getCollection;
exports.findBookingConflict = findBookingConflict;
exports.getBookingOccupancyLockRefs = getBookingOccupancyLockRefs;
exports.reserveBookingOccupancy = reserveBookingOccupancy;
exports.updateBookingOccupancy = updateBookingOccupancy;
exports.isValidHttpUrl = isValidHttpUrl;
exports.getBaseUrl = getBaseUrl;
exports.getDirectCalendarUrl = getDirectCalendarUrl;
exports.sanitizeCalendars = sanitizeCalendars;
exports.toNumber = toNumber;
exports.normalizeUnitPricing = normalizeUnitPricing;
exports.getUnitBasePrice = getUnitBasePrice;
exports.getUnitMarkup = getUnitMarkup;
exports.getUnitFinalPrice = getUnitFinalPrice;
exports.clampInt = clampInt;
exports.normalizeExpenseInput = normalizeExpenseInput;
exports.computeExpenseTotals = computeExpenseTotals;
exports.stripUndefinedFields = stripUndefinedFields;
exports.buildExpenseFirestoreDocument = buildExpenseFirestoreDocument;
exports.computeAgentCommission = computeAgentCommission;
exports.resolveBookingPaymentStatus = resolveBookingPaymentStatus;
exports.resolveSecurityDepositStatus = resolveSecurityDepositStatus;
exports.recomputeBookingPayment = recomputeBookingPayment;
exports.recomputeSecurityDeposit = recomputeSecurityDeposit;
exports.syncLedgerRecord = syncLedgerRecord;
const firebase_admin_1 = require("./firebase-admin");
// ponytail: keep simple helper functions grouped in one file to avoid file clutter.
function getDb() {
  return (0, firebase_admin_1.getFirebaseAdmin)().adminDb;
}
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Unauthorized. Missing Bearer Token." });
  }
  try {
    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await (0,
    firebase_admin_1.getFirebaseAdmin)().adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
    return;
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
};
exports.authenticate = authenticate;
function normalizeRoleName(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["admin", "staff", "viewer"].includes(normalized) ? normalized : "";
}
function getProfileRoleFromDoc(profileDoc) {
  if (!profileDoc) return "";
  if (profileDoc.data && typeof profileDoc.data === "function") {
    return normalizeRoleName(profileDoc.data()?.role);
  }
  return normalizeRoleName(profileDoc?.role);
}
async function resolveProfileRoleForRequest(req, profileOverride = null) {
  const uid = String(req?.user?.uid ?? "").trim();
  if (!uid) {
    return {
      uid: "",
      profileExists: false,
      rolePresent: false,
      normalizedRole: "",
      allowed: false,
      reason: "Missing authenticated UID.",
    };
  }

  let profile = profileOverride;
  if (!profile) {
    try {
      profile = await getDb().collection("users").doc(uid).get();
    } catch (_error) {
      return {
        uid,
        profileExists: false,
        rolePresent: false,
        normalizedRole: "",
        allowed: false,
        reason: "Firestore profile lookup failed.",
      };
    }
  }

  const profileExists = Boolean(profile?.exists ?? false);
  const rawRole = profileExists ? profile.data()?.role : profile?.role;
  const rolePresent =
    rawRole !== undefined && rawRole !== null && String(rawRole).trim() !== "";
  const normalizedRole = normalizeRoleName(rawRole);

  if (!profileExists || !rolePresent) {
    return {
      uid,
      profileExists,
      rolePresent,
      normalizedRole,
      allowed: false,
      reason:
        "User profile missing or role not set. Only admin and staff can use the expense API.",
    };
  }

  const allowed = normalizedRole === "admin" || normalizedRole === "staff";
  return {
    uid,
    profileExists,
    rolePresent,
    normalizedRole,
    allowed,
    reason: allowed
      ? "authorized"
      : `User role is ${normalizedRole || "missing"}; only admin and staff are allowed.`,
  };
}
const requireAdmin = async (req, res, next, profileOverride = null) => {
  const token = req.user;
  const uid = String(token?.uid ?? "").trim();
  if (!uid) {
    return res
      .status(401)
      .json({ error: "Unauthorized. Missing authenticated user." });
  }

  const profileResult = await resolveProfileRoleForRequest(
    req,
    profileOverride,
  );
  if (profileResult.allowed && profileResult.normalizedRole === "admin") {
    next();
    return;
  }

  return res
    .status(403)
    .json({ error: "Forbidden. Admin access is required." });
};
exports.requireAdmin = requireAdmin;
async function requireOperationsStaff(req, res, next, profileOverride = null) {
  const requestPath = String(req?.originalUrl || req?.path || "").toLowerCase();

  // AI endpoints are authenticated but intentionally not expense-role-gated.
  // This guard prevents accidental inheritance from stale middleware, duplicate routers,
  // or a mis-mounted API stack while preserving strict admin/staff checks on expense CRUD.
  if (requestPath.includes("/ai/")) {
    if (!req?.user?.uid) {
      return res
        .status(401)
        .json({ error: "Unauthorized. Missing authenticated user." });
    }

    next();
    return;
  }

  const uid = String(req?.user?.uid ?? "").trim();
  if (!uid) {
    return res
      .status(401)
      .json({ error: "Unauthorized. Missing authenticated user." });
  }

  const profileResult = await resolveProfileRoleForRequest(
    req,
    profileOverride,
  );
  if (profileResult.allowed) {
    next();
    return;
  }

  return res.status(403).json({
    error:
      profileResult.normalizedRole === "viewer"
        ? "Forbidden. Staff or admin access is required."
        : profileResult.reason ||
          "Forbidden. Staff or admin access is required.",
  });
}
async function loadDynamicExport(modulePath, exportName) {
  const mod = await Promise.resolve(`${modulePath}`).then((s) =>
    __importStar(require(s)),
  );
  const fn = mod?.[exportName];
  if (typeof fn !== "function") {
    throw new Error(`Missing export "${exportName}" from ${modulePath}`);
  }
  return fn;
}
async function sendDiscordNotification(input) {
  const { sendDiscordNotificationFlow } = await Promise.resolve().then(() =>
    __importStar(require("../ai/flows/send-discord-notification")),
  );
  return sendDiscordNotificationFlow(input);
}
function safeJson(value, maxLength = 8000) {
  const text = JSON.stringify(value ?? {}, null, 2);
  return text.length > maxLength
    ? `${text.slice(0, maxLength)}\n...truncated`
    : text;
}
function stableStringify(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
function cleanDiscordText(value) {
  return value.replace(/`/g, "'").replace(/\s+/g, " ").trim();
}
function formatDiscordValue(value, maxLength = 260) {
  if (value === undefined || value === null || value === "") return "N/A";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const text = cleanDiscordText(String(value));
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }
  if (Array.isArray(value)) {
    const text = value.length
      ? value.map((item) => formatDiscordValue(item, 80)).join(", ")
      : "[]";
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).filter(
      ([, entryValue]) =>
        entryValue !== undefined && entryValue !== null && entryValue !== "",
    );
    if (!entries.length) return "{}";
    const text = entries
      .map(
        ([key, entryValue]) => `${key}: ${formatDiscordValue(entryValue, 90)}`,
      )
      .join(", ");
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }
  const fallback = cleanDiscordText(String(value));
  return fallback.length > maxLength
    ? `${fallback.slice(0, maxLength - 1)}…`
    : fallback;
}
function buildChangedFields(before, after, keys, maxFields = 20) {
  const changed = keys
    .filter(
      (key) => stableStringify(before?.[key]) !== stableStringify(after?.[key]),
    )
    .slice(0, maxFields)
    .map(
      (key) =>
        `**${key}**: \`${formatDiscordValue(before?.[key])}\` → \`${formatDiscordValue(after?.[key])}\``,
    );
  const remainingCount =
    keys.filter(
      (key) => stableStringify(before?.[key]) !== stableStringify(after?.[key]),
    ).length - changed.length;
  if (remainingCount > 0) {
    changed.push(
      `...and ${remainingCount} more field${remainingCount === 1 ? "" : "s"} changed.`,
    );
  }
  return changed.join("\n");
}
function buildBasicReportSummary(reportData) {
  const name = reportData?.name || "Business report";
  const period = reportData?.period || "selected period";
  const revenue = toNumber(reportData?.revenue ?? reportData?.income);
  const expense = toNumber(reportData?.expense ?? reportData?.expenses);
  const commission = toNumber(reportData?.commission);
  const investorShare = toNumber(reportData?.investorShare);
  const profit = toNumber(
    reportData?.profit ??
      reportData?.netProfit ??
      revenue - expense - commission - investorShare,
  );
  return [
    `${name} for ${period}:`,
    `Revenue is ${revenue.toLocaleString()}.`,
    `Expenses are ${expense.toLocaleString()}.`,
    `Estimated profit is ${profit.toLocaleString()}.`,
    profit >= 0
      ? "The period appears profitable. Continue monitoring high expense categories and low-performing units."
      : "The period appears to be at a loss. Review expense categories, pricing, and occupancy.",
  ].join(" ");
}
async function getCollection(collectionName) {
  const adminDb = getDb();
  const snapshot = await adminDb.collection(collectionName).get();
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}
// Older calendar sync runs created document placeholders from rate-only cells.
// They are identifiable artifacts, not reservations: the generated guest equals
// the unit label and the document carries no Sheet-row identity. Keep the
// documents for audit, but never let them block availability or conflict checks.
function isLegacySheetBookingPlaceholder(booking) {
  const id = String(booking?.id || booking?.bookingId || "");
  if (!id.startsWith("sheet-booking-") || booking?.sourceRow) return false;
  const normalize = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const guest = normalize(
    [booking?.guestFirstName, booking?.guestLastName]
      .filter(Boolean)
      .join(" ") || booking?.guestName,
  );
  return Boolean(
    guest && guest === normalize(booking?.unitName) && !booking?.notes,
  );
}
function isLegacySheetBookingPlaceholderId(bookingId) {
  return String(bookingId || "").startsWith("sheet-booking-");
}
async function findBookingConflict(newBooking, excludeBookingId) {
  const adminDb = getDb();
  const snapshot = await adminDb
    .collection("bookings")
    .where("unitId", "==", newBooking.unitId)
    .where("checkoutDate", ">", newBooking.checkinDate)
    .get();
  if (snapshot.empty) return null;
  return (
    snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((booking) => !isLegacySheetBookingPlaceholder(booking))
      .find(
        (booking) =>
          String(booking.id || booking.bookingId || "") !==
            String(excludeBookingId || "") &&
          booking.checkinDate < newBooking.checkoutDate,
      ) || null
  );
}
function getBookingOccupancyLockRefs(adminDb, booking) {
  const unitId = String(booking?.unitId || "").trim();
  const checkin = new Date(
    `${String(booking?.checkinDate || "").slice(0, 10)}T00:00:00.000Z`,
  );
  const checkout = new Date(
    `${String(booking?.checkoutDate || "").slice(0, 10)}T00:00:00.000Z`,
  );
  if (
    !unitId ||
    Number.isNaN(checkin.getTime()) ||
    Number.isNaN(checkout.getTime()) ||
    checkout <= checkin
  ) {
    const error = new Error(
      "A valid unit, check-in date, and later check-out date are required.",
    );
    error.code = "invalid-booking-dates";
    throw error;
  }
  const refs = [];
  for (
    const date = new Date(checkin);
    date < checkout;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const key = `${Buffer.from(unitId).toString("base64url")}__${date.toISOString().slice(0, 10)}`;
    refs.push(adminDb.collection("booking-occupancy").doc(key));
  }
  return refs;
}
async function reserveBookingOccupancy(adminDb, bookingRef, booking) {
  const lockRefs = getBookingOccupancyLockRefs(adminDb, booking);
  await adminDb.runTransaction(async (transaction) => {
    const [lockSnapshots, bookingSnapshot] = await Promise.all([
      transaction.getAll(...lockRefs),
      transaction.get(
        adminDb
          .collection("bookings")
          .where("unitId", "==", booking.unitId)
          .where("checkoutDate", ">", booking.checkinDate),
      ),
    ]);
    const conflict = bookingSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((existing) => !isLegacySheetBookingPlaceholder(existing))
      .find((existing) => existing.checkinDate < booking.checkoutDate);
    const locked = lockSnapshots.find(
      (snapshot) =>
        snapshot.exists &&
        !isLegacySheetBookingPlaceholderId(snapshot.data()?.bookingId),
    );
    if (conflict || locked) {
      const error = new Error("Booking conflict detected.");
      error.code = "booking-conflict";
      error.existingBooking = conflict || {
        id: locked?.data()?.bookingId || "",
      };
      throw error;
    }
    transaction.set(bookingRef, booking);
    lockRefs.forEach((lockRef) =>
      transaction.set(lockRef, {
        bookingId: bookingRef.id,
        unitId: booking.unitId,
        checkinDate: booking.checkinDate,
        checkoutDate: booking.checkoutDate,
      }),
    );
  });
}
async function updateBookingOccupancy(
  adminDb,
  bookingRef,
  before,
  updatedFields,
) {
  const after = {
    ...before,
    ...updatedFields,
    id: bookingRef.id,
    bookingId: bookingRef.id,
  };
  const oldLockRefs = getBookingOccupancyLockRefs(adminDb, before);
  const newLockRefs = getBookingOccupancyLockRefs(adminDb, after);
  const newLockPaths = new Set(newLockRefs.map((ref) => ref.path));
  await adminDb.runTransaction(async (transaction) => {
    const [newLocks, candidates] = await Promise.all([
      transaction.getAll(...newLockRefs),
      transaction.get(
        adminDb
          .collection("bookings")
          .where("unitId", "==", after.unitId)
          .where("checkoutDate", ">", after.checkinDate),
      ),
    ]);
    const conflict = candidates.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((existing) => !isLegacySheetBookingPlaceholder(existing))
      .find(
        (existing) =>
          String(existing.id || existing.bookingId || "") !== bookingRef.id &&
          existing.checkinDate < after.checkoutDate,
      );
    const locked = newLocks.find(
      (snapshot) =>
        snapshot.exists &&
        String(snapshot.data()?.bookingId || "") !== bookingRef.id &&
        !isLegacySheetBookingPlaceholderId(snapshot.data()?.bookingId),
    );
    if (conflict || locked) {
      const error = new Error("Booking conflict detected.");
      error.code = "booking-conflict";
      error.existingBooking = conflict || {
        id: locked?.data()?.bookingId || "",
      };
      throw error;
    }
    transaction.update(bookingRef, updatedFields);
    oldLockRefs
      .filter((ref) => !newLockPaths.has(ref.path))
      .forEach((ref) => transaction.delete(ref));
    newLockRefs.forEach((lockRef) =>
      transaction.set(lockRef, {
        bookingId: bookingRef.id,
        unitId: after.unitId,
        checkinDate: after.checkinDate,
        checkoutDate: after.checkoutDate,
      }),
    );
  });
}
function isValidHttpUrl(value) {
  if (typeof value !== "string") return false;
  if (!value.trim()) return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
function getBaseUrl(req) {
  const forwardedProto = (req.get("x-forwarded-proto") || "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = (req.get("x-forwarded-host") || "")
    .split(",")[0]
    .trim();
  const host = forwardedHost || req.get("host");
  if (!host) {
    throw new Error("Unable to determine public host for iCal URL");
  }
  return `${protocol}://${host}`;
}
function getDirectCalendarUrl(req, unitId) {
  return `${getBaseUrl(req)}/ical/${encodeURIComponent(unitId)}.ics`;
}
function sanitizeCalendars(input) {
  const calendars = input?.calendars ?? {};
  const result = {};
  if ("airbnb" in calendars) {
    if (!isValidHttpUrl(calendars.airbnb))
      throw new Error("Invalid calendars.airbnb URL");
    result.airbnb = (calendars.airbnb ?? "").trim();
  }
  if ("bookingCom" in calendars) {
    if (!isValidHttpUrl(calendars.bookingCom))
      throw new Error("Invalid calendars.bookingCom URL");
    result.bookingCom = (calendars.bookingCom ?? "").trim();
  }
  if ("direct" in calendars) {
    if (!isValidHttpUrl(calendars.direct))
      throw new Error("Invalid calendars.direct URL");
    result.direct = (calendars.direct ?? "").trim();
  }
  return result;
}
function toNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  // Google Sheets supplies currency cells as formatted strings (for example
  // "₱16,666.67"). Convert the stored value, not merely its UI display.
  const raw = String(v ?? "").trim();
  const normalized = raw.replace(/[₱$€£,\s]/g, "").replace(/[^0-9.+-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
function getUnitBasePrice(unit) {
  return toNumber(unit?.basePrice ?? unit?.rate);
}
function getUnitMarkup(unit) {
  return toNumber(unit?.markup);
}
function getUnitFinalPrice(unit) {
  return Math.max(0, getUnitBasePrice(unit) + getUnitMarkup(unit));
}
function normalizeUnitPricing(body, existing = {}) {
  const hasBasePrice =
    body?.basePrice !== undefined &&
    body?.basePrice !== null &&
    body?.basePrice !== "";
  const basePrice = hasBasePrice
    ? toNumber(body.basePrice)
    : getUnitBasePrice(existing) || toNumber(body?.rate);
  const markup =
    body?.markup === undefined || body?.markup === null || body?.markup === ""
      ? getUnitMarkup(existing)
      : toNumber(body.markup);
  if (basePrice < 0 || markup < 0) {
    throw new Error("Unit base price and markup must be non-negative numbers.");
  }
  return { basePrice, markup, rate: getUnitFinalPrice({ basePrice, markup }) };
}
function clampInt(n, min, max) {
  const x = parseInt(String(n), 10);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}
function stripUndefinedFields(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedFields(item))
      .filter((item) => item !== undefined);
  }
  const result = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (nestedValue === undefined) continue;
    if (
      nestedValue !== null &&
      typeof nestedValue === "object" &&
      !Array.isArray(nestedValue)
    ) {
      const cleanedNested = stripUndefinedFields(nestedValue);
      if (
        cleanedNested !== undefined &&
        (!cleanedNested ||
          typeof cleanedNested !== "object" ||
          Array.isArray(cleanedNested) ||
          Object.keys(cleanedNested).length > 0)
      ) {
        result[key] = cleanedNested;
      }
      continue;
    }
    result[key] = nestedValue;
  }
  return result;
}
function normalizeExpenseInput(body) {
  const title = String(body?.title ?? "").trim();
  const category = String(body?.category ?? "Other");
  const amountMode = body?.amountMode === "per_unit" ? "per_unit" : "total";
  const amount = toNumber(body?.amount);
  const frequency = body?.frequency === "recurring" ? "recurring" : "one_time";
  const date = String(body?.date ?? "").trim();
  const recurringDay = body?.recurringDay;
  let unitIds = Array.isArray(body?.unitIds)
    ? body.unitIds.map((x) => String(x)).filter(Boolean)
    : [];
  if (unitIds.length === 0 && body?.unitId) {
    unitIds = [String(body.unitId)];
  }
  const description = String(body?.description ?? body?.notes ?? "").trim();
  const statusRaw = String(body?.status ?? "Paid").trim();
  const status = ["Paid", "Pending", "Cancelled", "Unpaid"].includes(statusRaw)
    ? statusRaw
    : "Paid";
  if (!title) throw new Error("title is required");
  if (!Number.isFinite(amount) || amount < 0)
    throw new Error("amount must be a non-negative number");
  if (frequency === "one_time") {
    if (!date) throw new Error("date is required for one_time expenses");
  }
  let normalizedRecurringDay = undefined;
  if (frequency === "recurring") {
    normalizedRecurringDay = clampInt(recurringDay ?? 1, 1, 31);
  }
  return {
    title,
    category,
    amountMode,
    amount,
    frequency,
    date,
    unitIds,
    description,
    status,
    ...(normalizedRecurringDay !== undefined
      ? { recurringDay: normalizedRecurringDay }
      : {}),
    ...(body?.agentId ? { agentId: String(body.agentId) } : {}),
    ...(body?.agentName ? { agentName: String(body.agentName) } : {}),
    ...(body?.bookingId ? { bookingId: String(body.bookingId) } : {}),
    ...(body?.commissionStatus
      ? { commissionStatus: String(body.commissionStatus) }
      : {}),
    ...(body?.paymentMethod
      ? { paymentMethod: String(body.paymentMethod) }
      : {}),
    ...(body?.notes ? { notes: String(body.notes) } : {}),
    ...(body?.unitName ? { unitName: String(body.unitName) } : {}),
    ...(unitIds.length === 1 ? { unitId: unitIds[0] } : {}),
    ...(body?.unitSelectionMode
      ? { unitSelectionMode: String(body.unitSelectionMode) }
      : {}),
    ...(body?.distributionMode
      ? { distributionMode: String(body.distributionMode) }
      : {}),
    ...(body?.distributionValues && typeof body.distributionValues === "object"
      ? { distributionValues: body.distributionValues }
      : {}),
    ...(body?.recordedByName
      ? { recordedByName: String(body.recordedByName) }
      : {}),
    ...(body?.recordedByEmail
      ? { recordedByEmail: String(body.recordedByEmail) }
      : {}),
    ...(body?.recordedBy ? { recordedBy: String(body.recordedBy) } : {}),
    ...(body?.uid ? { uid: String(body.uid) } : {}),
  };
}
function buildExpenseFirestoreDocument(normalized, totals, extras = {}) {
  return stripUndefinedFields({
    ...normalized,
    unitCount: totals.unitCount,
    calculatedTotal: totals.calculatedTotal,
    ...extras,
  });
}
function computeExpenseTotals(normalized) {
  const unitCount = normalized.unitIds.length;
  const calculatedTotal =
    normalized.amountMode === "per_unit"
      ? normalized.amount * unitCount
      : normalized.amount;
  return {
    unitCount,
    calculatedTotal,
  };
}
function computeAgentCommission(agent, baseRate, totalAmountPaid) {
  if (!agent) return 0;
  if (agent.commissionType === "fixed_commission") {
    return Math.max(0, totalAmountPaid - baseRate);
  }
  if (agent.commissionType === "percentage") {
    return Math.max(0, baseRate * (toNumber(agent.commissionRate) / 100));
  }
  return 0;
}
function resolveBookingPaymentStatus(data, fallback) {
  const raw = String(
    data?.bookingPaymentStatus ??
      data?.paymentStatus ??
      data?.bookingPayment?.status ??
      data?.bookingPayment?.paymentStatus ??
      fallback?.bookingPaymentStatus ??
      fallback?.paymentStatus ??
      fallback?.bookingPayment?.status ??
      fallback?.bookingPayment?.paymentStatus ??
      "Unpaid",
  )
    .trim()
    .toLowerCase();
  if (raw === "paid") return "Paid";
  if (raw === "partial") return "Partial";
  return "Unpaid";
}
function resolveSecurityDepositStatus(data, fallback) {
  const raw = String(
    data?.securityDepositStatus ??
      data?.securityDeposit?.status ??
      data?.securityDepositReceipt?.status ??
      fallback?.securityDepositStatus ??
      fallback?.securityDeposit?.status ??
      fallback?.securityDepositReceipt?.status ??
      "Unpaid",
  )
    .trim()
    .toLowerCase();
  if (raw === "refunded") return "Refunded";
  if (raw === "paid" || raw === "received") return "Received";
  return "Unpaid";
}
async function recomputeBookingPayment(bookingId) {
  const db = getDb();
  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) throw new Error("Booking not found");
  const booking = bookingSnap.data();
  const totalAmount = toNumber(booking.totalAmount);
  const agentCommission = toNumber(booking.agentCommission ?? 0);
  const revenueTarget = Math.max(0, totalAmount - agentCommission);
  const paymentsSnap = await db
    .collection("booking-payments")
    .where("bookingId", "==", bookingId)
    .get();
  let paidTotal = 0;
  paymentsSnap.forEach((d) => {
    paidTotal += toNumber(d.data().amount);
  });
  let paymentStatus = "Unpaid";
  if (paidTotal > 0 && paidTotal < revenueTarget) paymentStatus = "Partial";
  if (revenueTarget > 0 && paidTotal >= revenueTarget) paymentStatus = "Paid";
  const balance = Math.max(0, revenueTarget - paidTotal);
  await bookingRef.set(
    {
      paymentStatus,
      bookingPaymentStatus: paymentStatus,
      paidTotal,
      balance,
    },
    { merge: true },
  );
  return {
    bookingId,
    totalAmount,
    revenueTarget,
    agentCommission,
    paidTotal,
    balance,
    paymentStatus,
  };
}
async function recomputeSecurityDeposit(bookingId) {
  const db = getDb();
  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) throw new Error("Booking not found");
  const booking = bookingSnap.data();
  const configuredAmount = toNumber(booking?.securityDeposit?.amount) || 1000;
  const snap = await db
    .collection("security-deposits")
    .where("bookingId", "==", bookingId)
    .get();
  let receivedTotal = 0;
  let refundedTotal = 0;
  let hasRefunded = false;
  snap.forEach((d) => {
    const row = d.data();
    const type = String(row.type || "");
    const status = String(row.status || "");
    const amt = toNumber(row.amount);
    if (type === "receive") {
      receivedTotal += amt;
      if (status.toLowerCase() === "refunded") {
        hasRefunded = true;
      }
    }
    if (type === "refund") {
      refundedTotal += amt;
      hasRefunded = true;
    }
  });
  const depositBalance =
    hasRefunded || refundedTotal >= receivedTotal
      ? 0
      : receivedTotal - refundedTotal;
  let status = "Unpaid";
  if (receivedTotal > 0) {
    status = hasRefunded || depositBalance <= 0 ? "Refunded" : "Received";
  }
  await bookingRef.set(
    {
      securityDeposit: {
        amount: configuredAmount,
        status,
      },
      securityDepositStatus: status,
      securityDepositReceipt: {
        ...(booking?.securityDepositReceipt || {}),
        status,
      },
      depositPaidTotal: receivedTotal,
      depositRefundedTotal: refundedTotal,
      depositBalance,
    },
    { merge: true },
  );
  return {
    bookingId,
    configuredAmount,
    receivedTotal,
    refundedTotal,
    depositBalance,
    status,
  };
}
async function syncLedgerRecord(params) {
  const adminDb = getDb();
  const { collectionName, bookingId, deterministicId, desiredAmount, payload } =
    params;
  const isBookingPayment = collectionName === "booking-payments";
  const snapshot = await adminDb
    .collection(collectionName)
    .where("bookingId", "==", bookingId)
    .get();
  const managedDocs = snapshot.docs.filter((d) => {
    const row = d.data();
    return (
      row.managedByBooking ||
      row.source === "booking-save" ||
      d.id === deterministicId
    );
  });
  if (isBookingPayment && desiredAmount > 0 && managedDocs.length === 0) {
    if (snapshot.docs.length > 0) return snapshot.docs[0].id;
  }
  if (isBookingPayment && desiredAmount <= 0) {
    return managedDocs[0]?.id || snapshot.docs[0]?.id || null;
  }
  const primaryRef =
    managedDocs.find((d) => d.id === deterministicId)?.ref ??
    managedDocs[0]?.ref ??
    adminDb.collection(collectionName).doc(deterministicId);
  const deletePromises = managedDocs
    .filter((doc) => doc.ref.path !== primaryRef.path)
    .map((doc) => doc.ref.delete());
  await Promise.all(deletePromises);
  if (desiredAmount <= 0) {
    if (managedDocs.length > 0) await primaryRef.delete();
    return null;
  }
  await primaryRef.set(
    stripUndefinedFields({
      ...payload,
      id: primaryRef.id,
      bookingId,
      unitId: params.unitId,
      amount: desiredAmount,
      createdAt: managedDocs[0]?.data()?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: "booking-save",
      managedByBooking: true,
    }),
    { merge: true },
  );
  return primaryRef.id;
}
//# sourceMappingURL=route-helpers.js.map
