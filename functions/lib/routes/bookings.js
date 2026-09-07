"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingsRouter = void 0;
const express_1 = __importDefault(require("express"));
const route_helpers_1 = require("../lib/route-helpers");
const AUG29_BLOCK_DATE = "2026-08-29";
const WINTER_BLOCK_START_DATE = "2026-12-01";
const WINTER_BLOCK_END_EXCLUSIVE = "2027-02-01";
const isAug29ExceptionUnit = (unit) => {
  const values = [unit?.id, unit?.unitNumber, unit?.name]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  return values.includes("shore 3") || values.includes("447");
};
const dateRangeOverlaps = (checkinDate, checkoutDate, blockStart, blockEnd) =>
  String(checkinDate || "").slice(0, 10) < blockEnd &&
  String(checkoutDate || "").slice(0, 10) > blockStart;
const isCalendarClosureOverlap = (booking, unit) =>
  dateRangeOverlaps(
    booking?.checkinDate,
    booking?.checkoutDate,
    WINTER_BLOCK_START_DATE,
    WINTER_BLOCK_END_EXCLUSIVE,
  ) ||
  (!isAug29ExceptionUnit(unit) &&
    dateRangeOverlaps(
      booking?.checkinDate,
      booking?.checkoutDate,
      AUG29_BLOCK_DATE,
      "2026-08-30",
    ));
// ponytail: Group bookings, payments, security deposits, incidents, and profit-payments together.
exports.bookingsRouter = express_1.default.Router();
exports.bookingsRouter.use(route_helpers_1.authenticate);
exports.bookingsRouter.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  return (0, route_helpers_1.requireOperationsStaff)(req, res, next);
});
exports.bookingsRouter.get("/bookings", async (req, res) => {
  try {
    const bookings = await (0, route_helpers_1.getCollection)("bookings");
    return res.status(200).json(bookings);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch bookings" });
  }
});
exports.bookingsRouter.post(
  "/booking",
  route_helpers_1.authenticate,
  async (req, res) => {
    try {
      const adminDb = (0, route_helpers_1.getDb)();
      // Remove optional undefined fields before any transaction or ledger
      // write. Firestore rejects undefined values such as recurringDay.
      const newBooking = (0, route_helpers_1.stripUndefinedFields)(
        req.body ?? {},
      );
      newBooking.uid = req.user.uid;
      const paymentStatus = (0, route_helpers_1.resolveBookingPaymentStatus)(
        newBooking,
      );
      const depositStatus = (0, route_helpers_1.resolveSecurityDepositStatus)(
        newBooking,
      );
      const incomingDeposit = newBooking.securityDeposit || {};
      const depositAmount = Number(incomingDeposit.amount);
      const safeDepositAmount =
        Number.isFinite(depositAmount) && depositAmount > 0
          ? depositAmount
          : 1000;
      newBooking.securityDeposit = {
        amount: safeDepositAmount,
        status: depositStatus,
      };
      newBooking.securityDepositStatus = depositStatus;
      newBooking.paymentStatus = paymentStatus;
      newBooking.bookingPaymentStatus = paymentStatus;
      newBooking.bookingPayment = {
        ...(newBooking.bookingPayment || {}),
        status: paymentStatus,
        paymentStatus,
      };
      newBooking.securityDepositReceipt = {
        ...(newBooking.securityDepositReceipt || {}),
        status: depositStatus,
      };
      const unitRef = adminDb.collection("units").doc(newBooking.unitId);
      const unitSnap = await unitRef.get();
      if (!unitSnap.exists) {
        return res
          .status(400)
          .json({ error: "Invalid unit ID — unit not found." });
      }
      const unitData = unitSnap.data();
      if (isCalendarClosureOverlap(newBooking, unitData)) {
        return res.status(409).json({
          error: "The selected stay overlaps a calendar closure.",
          code: "calendar-closure",
        });
      }
      const checkin = new Date(newBooking.checkinDate);
      const checkout = new Date(newBooking.checkoutDate);
      const oneDay = 1000 * 60 * 60 * 24;
      const totalNights = Math.max(
        0,
        Math.round((checkout.getTime() - checkin.getTime()) / oneDay),
      );
      const capacity = unitData.capacity ?? unitData.baseOccupancy ?? 0;
      const extraGuests = Math.max(
        0,
        newBooking.adults + newBooking.children - capacity,
      );
      const extraGuestFee = unitData.extraGuestFee ?? 0;
      const finalNightlyRate = (0, route_helpers_1.getUnitFinalPrice)(unitData);
      const baseRate =
        totalNights * (finalNightlyRate + extraGuests * extraGuestFee);
      let totalAmount;
      if (newBooking.isCustomAmount && newBooking.totalAmount) {
        totalAmount = newBooking.totalAmount;
      } else {
        totalAmount = baseRate;
      }
      let agentCommission = 0;
      if (newBooking.agentId) {
        const agentSnap = await adminDb
          .collection("agents")
          .doc(newBooking.agentId)
          .get();
        if (agentSnap.exists) {
          agentCommission = (0, route_helpers_1.computeAgentCommission)(
            agentSnap.data(),
            baseRate,
            totalAmount,
          );
        }
      }
      const revenueAmount = Math.max(0, totalAmount - agentCommission);
      const conflictCheck = {
        ...newBooking,
        id: "",
        bookingId: "",
        totalAmount,
        createdAt: new Date().toISOString(),
        nightlyRate: finalNightlyRate,
        paymentStatus,
      };
      const docRef = adminDb.collection("bookings").doc();
      const id = docRef.id;
      const bookingWithId = {
        ...newBooking,
        id,
        bookingId: id,
        totalAmount,
        baseRate,
        agentCommission,
        nightlyRate: finalNightlyRate,
        paymentStatus,
        createdAt: new Date().toISOString(),
      };
      await (0, route_helpers_1.reserveBookingOccupancy)(
        adminDb,
        docRef,
        (0, route_helpers_1.stripUndefinedFields)(bookingWithId),
      );
      const guestName =
        `${newBooking.guestFirstName} ${newBooking.guestLastName}`.trim();
      const paymentAmount = newBooking.bookingPayment?.amount;
      let resolvedPaymentAmount = 0;
      if (paymentStatus === "Paid") {
        resolvedPaymentAmount =
          !paymentAmount || (0, route_helpers_1.toNumber)(paymentAmount) <= 0
            ? revenueAmount
            : (0, route_helpers_1.toNumber)(paymentAmount);
      } else if (paymentStatus === "Partial") {
        resolvedPaymentAmount = (0, route_helpers_1.toNumber)(paymentAmount);
      }
      await Promise.all([
        (0, route_helpers_1.syncLedgerRecord)({
          collectionName: "booking-payments",
          bookingId: id,
          unitId: newBooking.unitId,
          deterministicId: `booking-payment-${id}`,
          desiredAmount: resolvedPaymentAmount,
          payload: {
            unitName: unitData.name,
            guestName,
            type: "income",
            status: paymentStatus,
            method: newBooking.bookingPayment?.method || "CASH",
            paidAt:
              newBooking.bookingPayment?.paidAt || new Date().toISOString(),
            reference: newBooking.bookingPayment?.reference || "",
            notes:
              newBooking.bookingPayment?.notes || "Auto-synced from booking.",
          },
        }),
        (0, route_helpers_1.syncLedgerRecord)({
          collectionName: "security-deposits",
          bookingId: id,
          unitId: newBooking.unitId,
          deterministicId: `security-deposit-${id}`,
          desiredAmount:
            depositStatus === "Received" || depositStatus === "Refunded"
              ? safeDepositAmount
              : 0,
          payload: {
            unitName: unitData.name,
            guestName,
            type: "receive",
            status: depositStatus,
            method: newBooking.securityDepositReceipt?.method || "CASH",
            paidAt:
              newBooking.securityDepositReceipt?.paidAt ||
              new Date().toISOString(),
            reference: newBooking.securityDepositReceipt?.reference || "",
            notes:
              newBooking.securityDepositReceipt?.notes ||
              "Auto-synced from booking.",
          },
        }),
        (0, route_helpers_1.syncLedgerRecord)({
          collectionName: "security-deposits",
          bookingId: id,
          unitId: newBooking.unitId,
          deterministicId: `security-deposit-refund-${id}`,
          desiredAmount: 0,
          payload: {
            unitName: unitData.name,
            guestName,
            type: "refund",
            status: "Refunded",
            method: newBooking.securityDepositReceipt?.refundMethod || "CASH",
            paidAt:
              newBooking.securityDepositReceipt?.refundPaidAt ||
              new Date().toISOString(),
            reference: newBooking.securityDepositReceipt?.refundReference || "",
            notes:
              newBooking.securityDepositReceipt?.refundNotes ||
              "Auto-synced refund from booking.",
          },
        }),
      ]);
      await Promise.all([
        (0, route_helpers_1.recomputeBookingPayment)(id),
        (0, route_helpers_1.recomputeSecurityDeposit)(id),
      ]);
      try {
        await (0, route_helpers_1.sendDiscordNotification)({
          content: `
-----------------------------
🎉 New booking confirmed!
-----------------------------
**Unit:** ${unitData.name || "Unknown unit"}
**Guest:** ${newBooking.guestFirstName} ${newBooking.guestLastName}
**From:** ${newBooking.checkinDate}
**To:** ${newBooking.checkoutDate}
**Total:** ₱${totalAmount.toLocaleString()} ${newBooking.isCustomAmount ? "(Custom)" : ""}
**Special Requests:** ${newBooking.specialRequests?.trim() || "N/A"}
​`,
        });
      } catch (e) {
        console.error("Discord notification failed:", e);
      }
      if (newBooking.uid) {
        await adminDb.collection("notifications").add({
          userId: newBooking.uid,
          type: "booking",
          title: "Booking Confirmed!",
          description: `Your booking for ${unitData.name} from ${newBooking.checkinDate} to ${newBooking.checkoutDate} is confirmed.`,
          createdAt: new Date().toISOString(),
          isRead: false,
          data: { bookingId: id, unitId: newBooking.unitId },
        });
      }
      return res.status(201).json({ bookingId: id, id, totalAmount });
    } catch (err) {
      if (err?.code === "booking-conflict") {
        return res.status(409).json({
          error: "Booking conflict detected.",
          existingBooking: err.existingBooking,
        });
      }
      if (err?.code === "invalid-booking-dates") {
        return res.status(400).json({ error: err.message });
      }
      console.error(err);
      return res.status(500).json({ error: "Failed to create booking" });
    }
  },
);
exports.bookingsRouter.put(
  ["/booking/:bookingId", "/bookings/:bookingId"],
  route_helpers_1.authenticate,
  async (req, res) => {
    try {
      const adminDb = (0, route_helpers_1.getDb)();
      const bookingData = (0, route_helpers_1.stripUndefinedFields)(
        req.body ?? {},
      );
      const ref = adminDb.collection("bookings").doc(req.params.bookingId);
      const beforeSnap = await ref.get();
      const before = beforeSnap.data();
      if (!beforeSnap.exists || !before) {
        return res.status(404).json({ error: "Booking not found" });
      }
      const effectiveUnitId = bookingData.unitId || before.unitId;
      const effectiveUnitSnap = await adminDb
        .collection("units")
        .doc(effectiveUnitId)
        .get();
      if (!effectiveUnitSnap.exists) {
        return res.status(400).json({ error: "Invalid unit ID" });
      }
      const effectiveBookingDates = {
        checkinDate: bookingData.checkinDate || before.checkinDate,
        checkoutDate: bookingData.checkoutDate || before.checkoutDate,
      };
      if (
        isCalendarClosureOverlap(
          effectiveBookingDates,
          effectiveUnitSnap.data(),
        )
      ) {
        return res.status(409).json({
          error: "The selected stay overlaps a calendar closure.",
          code: "calendar-closure",
        });
      }
      const paymentStatus = (0, route_helpers_1.resolveBookingPaymentStatus)(
        bookingData,
        before,
      );
      const depositStatus = (0, route_helpers_1.resolveSecurityDepositStatus)(
        bookingData,
        before,
      );
      let updatedFields = { ...bookingData };
      let configuredDepositAmount = Number.isFinite(
        Number(bookingData.securityDeposit?.amount),
      )
        ? Number(bookingData.securityDeposit?.amount)
        : Number(before?.securityDeposit?.amount) || 1000;
      updatedFields.paymentStatus = paymentStatus;
      updatedFields.bookingPaymentStatus = paymentStatus;
      updatedFields.bookingPayment = {
        ...(before?.bookingPayment || {}),
        ...(bookingData.bookingPayment || {}),
        status: paymentStatus,
        paymentStatus,
      };
      updatedFields.securityDepositStatus = depositStatus;
      updatedFields.securityDeposit = {
        ...(before?.securityDeposit || { status: "Unpaid" }),
        ...(bookingData.securityDeposit || {}),
        amount: configuredDepositAmount,
        status: depositStatus,
      };
      updatedFields.securityDepositReceipt = {
        ...(before?.securityDepositReceipt || {}),
        ...(bookingData.securityDepositReceipt || {}),
        status: depositStatus,
      };
      const shouldRecalculateTotal =
        bookingData.checkinDate ||
        bookingData.checkoutDate ||
        bookingData.unitId ||
        bookingData.adults !== undefined ||
        bookingData.children !== undefined ||
        bookingData.isCustomAmount !== undefined ||
        bookingData.totalAmount !== undefined;
      if (shouldRecalculateTotal) {
        const targetUnitId = bookingData.unitId || before?.unitId;
        const unitSnap = await adminDb
          .collection("units")
          .doc(targetUnitId)
          .get();
        if (!unitSnap.exists)
          return res.status(400).json({ error: "Invalid unit ID" });
        const unit = unitSnap.data();
        const checkin = new Date(
          bookingData.checkinDate || before?.checkinDate,
        );
        const checkout = new Date(
          bookingData.checkoutDate || before?.checkoutDate,
        );
        const totalNights = Math.max(
          0,
          Math.round(
            (checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24),
          ),
        );
        const adults = bookingData.adults ?? before?.adults ?? 0;
        const children = bookingData.children ?? before?.children ?? 0;
        const capacity = unit.capacity ?? unit.baseOccupancy ?? 0;
        const extraGuests = Math.max(0, adults + children - capacity);
        const finalNightlyRate = (0, route_helpers_1.getUnitFinalPrice)(unit);
        const computedBaseRate =
          totalNights *
          (finalNightlyRate + extraGuests * (unit.extraGuestFee ?? 0));
        updatedFields.baseRate = computedBaseRate;
        const useCustomAmount =
          bookingData.isCustomAmount ?? before?.isCustomAmount;
        if (useCustomAmount && bookingData.totalAmount !== undefined) {
          updatedFields.totalAmount = (0, route_helpers_1.toNumber)(
            bookingData.totalAmount,
          );
        } else if (useCustomAmount && bookingData.totalAmount === undefined) {
          updatedFields.totalAmount = (0, route_helpers_1.toNumber)(
            before?.totalAmount,
          );
        } else {
          updatedFields.totalAmount = computedBaseRate;
        }
        updatedFields.nightlyRate = finalNightlyRate;
        const effectiveAgentId = bookingData.agentId ?? before?.agentId;
        let agentCommission = 0;
        if (effectiveAgentId) {
          const agentSnap = await adminDb
            .collection("agents")
            .doc(effectiveAgentId)
            .get();
          if (agentSnap.exists) {
            const effectiveTotalAmount = (0, route_helpers_1.toNumber)(
              updatedFields.totalAmount ?? before?.totalAmount,
            );
            agentCommission = (0, route_helpers_1.computeAgentCommission)(
              agentSnap.data(),
              computedBaseRate,
              effectiveTotalAmount,
            );
          }
        }
        updatedFields.agentCommission = agentCommission;
      } else if (bookingData.agentId !== undefined) {
        const existingBaseRate = (0, route_helpers_1.toNumber)(
          before?.baseRate ?? before?.totalAmount,
        );
        const existingTotalAmount = (0, route_helpers_1.toNumber)(
          before?.totalAmount,
        );
        let agentCommission = 0;
        if (bookingData.agentId) {
          const agentSnap = await adminDb
            .collection("agents")
            .doc(bookingData.agentId)
            .get();
          if (agentSnap.exists) {
            agentCommission = (0, route_helpers_1.computeAgentCommission)(
              agentSnap.data(),
              existingBaseRate,
              existingTotalAmount,
            );
          }
        }
        updatedFields.agentCommission = agentCommission;
      }
      const overlapCandidate = {
        ...before,
        ...updatedFields,
        id: req.params.bookingId,
        bookingId: req.params.bookingId,
      };
      if (before?.id && !bookingData.bookingId)
        updatedFields.bookingId = before.id;
      updatedFields = (0, route_helpers_1.stripUndefinedFields)(updatedFields);
      await (0, route_helpers_1.updateBookingOccupancy)(
        adminDb,
        ref,
        before,
        updatedFields,
      );
      const refreshedSnap = await ref.get();
      const refreshed = refreshedSnap.data();
      const unitDoc = await adminDb
        .collection("units")
        .doc(refreshed?.unitId)
        .get();
      const unitName = unitDoc.exists ? unitDoc.data()?.name : "Unknown unit";
      const guestName =
        `${refreshed.guestFirstName} ${refreshed.guestLastName}`.trim();
      const paymentAmount = refreshed.bookingPayment?.amount;
      const refreshedCommission = (0, route_helpers_1.toNumber)(
        refreshed.agentCommission ?? 0,
      );
      const refreshedRevenue = Math.max(
        0,
        (0, route_helpers_1.toNumber)(refreshed.totalAmount) -
          refreshedCommission,
      );
      let resolvedPaymentAmount = 0;
      if (paymentStatus === "Paid") {
        resolvedPaymentAmount =
          !paymentAmount || (0, route_helpers_1.toNumber)(paymentAmount) <= 0
            ? refreshedRevenue
            : (0, route_helpers_1.toNumber)(paymentAmount);
      } else if (paymentStatus === "Partial") {
        resolvedPaymentAmount = (0, route_helpers_1.toNumber)(paymentAmount);
      }
      await Promise.all([
        (0, route_helpers_1.syncLedgerRecord)({
          collectionName: "booking-payments",
          bookingId: req.params.bookingId,
          unitId: refreshed.unitId,
          deterministicId: `booking-payment-${req.params.bookingId}`,
          desiredAmount: resolvedPaymentAmount,
          payload: {
            unitName,
            guestName,
            type: "income",
            status: paymentStatus,
            method: refreshed.bookingPayment?.method || "CASH",
            paidAt:
              refreshed.bookingPayment?.paidAt || new Date().toISOString(),
            reference: refreshed.bookingPayment?.reference || "",
            notes:
              refreshed.bookingPayment?.notes || "Auto-synced from booking.",
          },
        }),
        (0, route_helpers_1.syncLedgerRecord)({
          collectionName: "security-deposits",
          bookingId: req.params.bookingId,
          unitId: refreshed.unitId,
          deterministicId: `security-deposit-${req.params.bookingId}`,
          desiredAmount:
            depositStatus === "Received" || depositStatus === "Refunded"
              ? configuredDepositAmount
              : 0,
          payload: {
            unitName,
            guestName,
            type: "receive",
            status: depositStatus,
            method: refreshed.securityDepositReceipt?.method || "CASH",
            paidAt:
              refreshed.securityDepositReceipt?.paidAt ||
              new Date().toISOString(),
            reference: refreshed.securityDepositReceipt?.reference || "",
            notes:
              refreshed.securityDepositReceipt?.notes ||
              "Auto-synced from booking.",
          },
        }),
        (0, route_helpers_1.syncLedgerRecord)({
          collectionName: "security-deposits",
          bookingId: req.params.bookingId,
          unitId: refreshed.unitId,
          deterministicId: `security-deposit-refund-${req.params.bookingId}`,
          desiredAmount: 0,
          payload: {
            unitName,
            guestName,
            type: "refund",
            status: "Refunded",
            method: refreshed.securityDepositReceipt?.refundMethod || "CASH",
            paidAt:
              refreshed.securityDepositReceipt?.refundPaidAt ||
              new Date().toISOString(),
            reference: refreshed.securityDepositReceipt?.refundReference || "",
            notes:
              refreshed.securityDepositReceipt?.refundNotes ||
              "Auto-synced refund from booking.",
          },
        }),
      ]);
      await Promise.all([
        (0, route_helpers_1.recomputeBookingPayment)(req.params.bookingId),
        (0, route_helpers_1.recomputeSecurityDeposit)(req.params.bookingId),
      ]);
      const changedFields = (0, route_helpers_1.buildChangedFields)(
        before,
        refreshed,
        Object.keys(bookingData),
      );
      if (changedFields.trim()) {
        await (0, route_helpers_1.sendDiscordNotification)({
          content: `
-----------------------------
✏️ Booking was updated:
-----------------------------
**Unit:** ${unitName}
${changedFields}
​`,
        });
      }
      return res.status(200).json({ message: "Booking updated successfully" });
    } catch (err) {
      if (err?.code === "booking-conflict") {
        return res.status(409).json({
          error: "Booking conflict detected.",
          existingBooking: err.existingBooking,
        });
      }
      console.error(err);
      return res.status(500).json({ error: "Failed to update booking" });
    }
  },
);
exports.bookingsRouter.delete(
  ["/booking/:bookingId", "/bookings/:bookingId"],
  route_helpers_1.authenticate,
  async (req, res) => {
    try {
      const adminDb = (0, route_helpers_1.getDb)();
      const id = req.params.bookingId;
      const docRef = adminDb.collection("bookings").doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return res.status(404).json({ error: "Booking not found" });
      }
      const booking = docSnap.data();
      const [
        pSnap,
        dSnap,
        remindersSnap,
        housekeepingSnap,
        expensesSnap,
        profitPaymentsSnap,
      ] = await Promise.all([
        adminDb
          .collection("booking-payments")
          .where("bookingId", "==", id)
          .get(),
        adminDb
          .collection("security-deposits")
          .where("bookingId", "==", id)
          .get(),
        adminDb.collection("reminders").where("bookingId", "==", id).get(),
        adminDb.collection("housekeeping").where("bookingId", "==", id).get(),
        adminDb.collection("expenses").where("bookingId", "==", id).get(),
        adminDb
          .collection("profit-payments")
          .where("bookingId", "==", id)
          .get(),
      ]);
      const batch = adminDb.batch();
      batch.delete(docRef);
      pSnap.docs.forEach((doc) => batch.delete(doc.ref));
      dSnap.docs.forEach((doc) => batch.delete(doc.ref));
      // These documents are operational derivatives of a reservation. Remove
      // them in the same commit so no page can retain a ghost reminder, task,
      // commission, or profit record after the booking has gone away.
      remindersSnap.docs.forEach((doc) => batch.delete(doc.ref));
      housekeepingSnap.docs.forEach((doc) => batch.delete(doc.ref));
      expensesSnap.docs.forEach((doc) => batch.delete(doc.ref));
      profitPaymentsSnap.docs.forEach((doc) => batch.delete(doc.ref));
      if (booking) {
        (0, route_helpers_1.getBookingOccupancyLockRefs)(
          adminDb,
          booking,
        ).forEach((lockRef) => batch.delete(lockRef));
      }
      await batch.commit();
      if (booking) {
        await (0, route_helpers_1.sendDiscordNotification)({
          content: `
-----------------------------
❌ Booking deleted!
-----------------------------
**Guest:** ${booking.guestFirstName} ${booking.guestLastName || "N/A"}
**From:** ${booking.checkinDate || "N/A"}
**To:** ${booking.checkoutDate || "N/A"}
\u200B`,
        });
      }
      return res.status(200).json({ message: "Booking deleted successfully" });
    } catch (err) {
      console.error("Failed to delete booking:", err);
      return res.status(500).json({ error: "Failed to delete booking" });
    }
  },
);
exports.bookingsRouter.get("/booking-payments", async (req, res) => {
  try {
    const payments = await (0, route_helpers_1.getCollection)(
      "booking-payments",
    );
    return res.status(200).json(payments);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch booking payments" });
  }
});
exports.bookingsRouter.post("/booking-payment", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const body = req.body ?? {};
    const bookingId = String(body.bookingId || "");
    if (!bookingId)
      return res.status(400).json({ error: "bookingId is required" });
    const bookingSnap = await adminDb
      .collection("bookings")
      .doc(bookingId)
      .get();
    if (!bookingSnap.exists)
      return res.status(404).json({ error: "Booking not found" });
    const booking = bookingSnap.data();
    const unitId = String(body.unitId || booking.unitId || "");
    const amount = (0, route_helpers_1.toNumber)(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "amount must be > 0" });
    }
    const paidAt = String(body.paidAt || new Date().toISOString());
    const requestedId = String(body.id || "").trim();
    const docRef = requestedId
      ? adminDb.collection("booking-payments").doc(requestedId)
      : adminDb.collection("booking-payments").doc();
    const now = new Date().toISOString();
    const paymentStatus = String(body.paymentStatus || body.status || "Paid");
    await docRef.set(
      {
        id: docRef.id,
        bookingId,
        unitId,
        unitName: body.unitName || booking.unitName || "Unknown Unit",
        guestName:
          body.guestName ||
          `${booking.guestFirstName} ${booking.guestLastName}`.trim(),
        amount,
        paidAt,
        method: body.method ?? null,
        reference: body.reference ?? null,
        notes: body.notes ?? null,
        status: paymentStatus,
        paymentStatus,
        type: "income",
        source: body.source ?? null,
        managedByBooking: Boolean(
          body.managedByBooking || body.source === "booking-save",
        ),
        createdAt: body.createdAt || now,
        updatedAt: now,
      },
      { merge: Boolean(requestedId) },
    );
    let summary = null;
    try {
      summary = await (0, route_helpers_1.recomputeBookingPayment)(bookingId);
    } catch (e) {
      console.error("recomputeBookingPayment failed:", e);
    }
    return res.status(201).json({ id: docRef.id, summary });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: err?.message ?? "Failed to create booking payment" });
  }
});
exports.bookingsRouter.put("/booking-payment/:paymentId", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const paymentId = req.params.paymentId;
    const body = req.body ?? {};
    const ref = adminDb.collection("booking-payments").doc(paymentId);
    const snap = await ref.get();
    const before = snap.exists ? snap.data() : {};
    const bookingId = String(body.bookingId || before.bookingId || "");
    if (!bookingId)
      return res
        .status(400)
        .json({ error: "bookingId is required for payment upsert" });
    const bookingSnap = await adminDb
      .collection("bookings")
      .doc(bookingId)
      .get();
    if (!bookingSnap.exists)
      return res.status(404).json({ error: "Booking not found" });
    const booking = bookingSnap.data();
    const amount =
      body.amount !== undefined
        ? (0, route_helpers_1.toNumber)(body.amount)
        : (0, route_helpers_1.toNumber)(before.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "amount must be > 0" });
    }
    const now = new Date().toISOString();
    const paymentStatus = String(
      body.paymentStatus ||
        body.status ||
        before.paymentStatus ||
        before.status ||
        "Paid",
    );
    await ref.set(
      {
        id: paymentId,
        bookingId,
        unitId: String(body.unitId || before.unitId || booking.unitId || ""),
        amount,
        paidAt: String(body.paidAt || before.paidAt || now),
        method:
          body.method !== undefined
            ? (body.method ?? null)
            : (before.method ?? null),
        reference:
          body.reference !== undefined
            ? (body.reference ?? null)
            : (before.reference ?? null),
        notes:
          body.notes !== undefined
            ? (body.notes ?? null)
            : (before.notes ?? null),
        status: paymentStatus,
        paymentStatus,
        source:
          body.source !== undefined ? body.source : (before.source ?? null),
        managedByBooking: Boolean(
          body.managedByBooking ??
          before.managedByBooking ??
          body.source === "booking-save",
        ),
        createdAt: before.createdAt || body.createdAt || now,
        updatedAt: now,
      },
      { merge: true },
    );
    let summary = null;
    try {
      summary = await (0, route_helpers_1.recomputeBookingPayment)(bookingId);
    } catch (e) {
      console.error("recomputeBookingPayment failed:", e);
    }
    return res.status(snap.exists ? 200 : 201).json({
      message: snap.exists
        ? "Booking payment updated successfully"
        : "Booking payment created successfully",
      id: paymentId,
      summary,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: err?.message ?? "Failed to upsert booking payment" });
  }
});
exports.bookingsRouter.delete(
  "/booking-payment/:paymentId",
  async (req, res) => {
    try {
      const adminDb = (0, route_helpers_1.getDb)();
      const paymentId = req.params.paymentId;
      const ref = adminDb.collection("booking-payments").doc(paymentId);
      const snap = await ref.get();
      if (!snap.exists)
        return res.status(404).json({ error: "Booking payment not found" });
      const data = snap.data();
      const bookingId = String(data.bookingId || "");
      await ref.delete();
      let summary = null;
      if (bookingId) {
        try {
          summary = await (0, route_helpers_1.recomputeBookingPayment)(
            bookingId,
          );
        } catch (e) {
          console.error("recomputeBookingPayment failed after delete:", e);
        }
      }
      return res
        .status(200)
        .json({ message: "Booking payment deleted successfully", summary });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ error: err?.message ?? "Failed to delete booking payment" });
    }
  },
);
exports.bookingsRouter.get("/security-deposits", async (req, res) => {
  try {
    const deposits = await (0, route_helpers_1.getCollection)(
      "security-deposits",
    );
    return res.status(200).json(deposits);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch security deposits" });
  }
});
exports.bookingsRouter.post("/security-deposit", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const body = req.body ?? {};
    const bookingId = String(body.bookingId || "");
    if (!bookingId)
      return res.status(400).json({ error: "bookingId is required" });
    const type = String(body.type || "");
    if (!["receive", "refund"].includes(type)) {
      return res
        .status(400)
        .json({ error: "type must be 'receive' or 'refund'" });
    }
    const bookingSnap = await adminDb
      .collection("bookings")
      .doc(bookingId)
      .get();
    if (!bookingSnap.exists)
      return res.status(404).json({ error: "Booking not found" });
    const booking = bookingSnap.data();
    const unitId = String(body.unitId || booking.unitId || "");
    const defaultAmount =
      (0, route_helpers_1.toNumber)(booking?.securityDeposit?.amount) || 1000;
    const amount =
      type === "receive" && body.amount === undefined
        ? defaultAmount
        : (0, route_helpers_1.toNumber)(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "amount must be > 0" });
    }
    if (type === "refund") {
      const current = await (0, route_helpers_1.recomputeSecurityDeposit)(
        bookingId,
      );
      if (amount > current.depositBalance) {
        return res.status(400).json({
          error: `Refund exceeds remaining deposit balance (${current.depositBalance}).`,
        });
      }
      const snap = await adminDb
        .collection("security-deposits")
        .where("bookingId", "==", bookingId)
        .where("type", "==", "receive")
        .get();
      const now = new Date().toISOString();
      const paidAt = String(body.paidAt || new Date().toISOString());
      if (!snap.empty) {
        const primaryRef = snap.docs[0].ref;
        await primaryRef.update({
          status: "Refunded",
          refundMethod: body.method ?? null,
          refundPaidAt: paidAt,
          refundReference: body.reference ?? null,
          refundNotes: body.notes ?? null,
          updatedAt: now,
        });
        const bookingRef = adminDb.collection("bookings").doc(bookingId);
        await bookingRef.set(
          {
            securityDeposit: {
              amount: current.configuredAmount,
              status: "Refunded",
            },
            securityDepositStatus: "Refunded",
            securityDepositReceipt: {
              ...(booking?.securityDepositReceipt || {}),
              status: "Refunded",
              refundMethod: body.method ?? null,
              refundPaidAt: paidAt,
              refundReference: body.reference ?? null,
              refundNotes: body.notes ?? null,
              refundAmount: amount,
            },
            depositRefundedTotal: amount,
            depositBalance: 0,
          },
          { merge: true },
        );
        const refundSnap = await adminDb
          .collection("security-deposits")
          .where("bookingId", "==", bookingId)
          .where("type", "==", "refund")
          .get();
        const deletePromises = refundSnap.docs.map((doc) => doc.ref.delete());
        await Promise.all(deletePromises);
        return res.status(201).json({
          id: primaryRef.id,
          summary: {
            ...current,
            status: "Refunded",
            depositBalance: 0,
            refundedTotal: amount,
          },
        });
      }
    }
    const paidAt = String(body.paidAt || new Date().toISOString());
    const requestedId = String(body.id || "").trim();
    const docRef = requestedId
      ? adminDb.collection("security-deposits").doc(requestedId)
      : adminDb.collection("security-deposits").doc();
    const now = new Date().toISOString();
    const status = String(
      body.status || (type === "refund" ? "Refunded" : "Paid"),
    );
    await docRef.set(
      {
        id: docRef.id,
        bookingId,
        unitId,
        unitName: body.unitName || booking.unitName || "Unknown Unit",
        guestName:
          body.guestName ||
          `${booking.guestFirstName} ${booking.guestLastName}`.trim(),
        type,
        amount,
        paidAt,
        method: body.method ?? null,
        reference: body.reference ?? null,
        notes: body.notes ?? null,
        status,
        source: body.source ?? null,
        managedByBooking: Boolean(
          body.managedByBooking || body.source === "booking-save",
        ),
        createdAt: body.createdAt || now,
        updatedAt: now,
      },
      { merge: Boolean(requestedId) },
    );
    let summary = null;
    try {
      summary = await (0, route_helpers_1.recomputeSecurityDeposit)(bookingId);
    } catch (e) {
      console.error("recomputeSecurityDeposit failed:", e);
    }
    return res.status(201).json({ id: docRef.id, summary });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: err?.message ?? "Failed to create security deposit record",
    });
  }
});
exports.bookingsRouter.put("/security-deposit/:id", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const id = req.params.id;
    const body = req.body ?? {};
    const ref = adminDb.collection("security-deposits").doc(id);
    const snap = await ref.get();
    const before = snap.exists ? snap.data() : {};
    const bookingId = String(body.bookingId || before.bookingId || "");
    if (!bookingId)
      return res
        .status(400)
        .json({ error: "bookingId is required for security deposit upsert" });
    const type = String(body.type || before.type || "");
    if (!["receive", "refund"].includes(type)) {
      return res
        .status(400)
        .json({ error: "type must be 'receive' or 'refund'" });
    }
    const bookingSnap = await adminDb
      .collection("bookings")
      .doc(bookingId)
      .get();
    if (!bookingSnap.exists)
      return res.status(404).json({ error: "Booking not found" });
    const defaultAmount =
      (0, route_helpers_1.toNumber)(
        bookingSnap.data()?.securityDeposit?.amount,
      ) || 1000;
    const amount =
      body.amount !== undefined
        ? (0, route_helpers_1.toNumber)(body.amount)
        : (0, route_helpers_1.toNumber)(before.amount) ||
          (type === "receive" ? defaultAmount : 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "amount must be > 0" });
    }
    if (type === "refund" && !snap.exists) {
      const current = await (0, route_helpers_1.recomputeSecurityDeposit)(
        bookingId,
      );
      if (amount > current.depositBalance) {
        return res.status(400).json({
          error: `Refund exceeds remaining deposit balance (${current.depositBalance}).`,
        });
      }
    }
    const now = new Date().toISOString();
    const status = String(
      body.status || before.status || (type === "refund" ? "Refunded" : "Paid"),
    );
    await ref.set(
      {
        id,
        bookingId,
        unitId: String(
          body.unitId || before.unitId || bookingSnap.data()?.unitId || "",
        ),
        type,
        amount,
        paidAt: String(body.paidAt || before.paidAt || now),
        method:
          body.method !== undefined
            ? (body.method ?? null)
            : (before.method ?? null),
        reference:
          body.reference !== undefined
            ? (body.reference ?? null)
            : (before.reference ?? null),
        notes:
          body.notes !== undefined
            ? (body.notes ?? null)
            : (before.notes ?? null),
        status,
        source:
          body.source !== undefined ? body.source : (before.source ?? null),
        managedByBooking: Boolean(
          body.managedByBooking ??
          before.managedByBooking ??
          body.source === "booking-save",
        ),
        createdAt: before.createdAt || body.createdAt || now,
        updatedAt: now,
      },
      { merge: true },
    );
    let summary = null;
    try {
      summary = await (0, route_helpers_1.recomputeSecurityDeposit)(bookingId);
    } catch (e) {
      console.error("recomputeSecurityDeposit failed:", e);
    }
    return res.status(snap.exists ? 200 : 201).json({
      message: snap.exists
        ? "Security deposit updated successfully"
        : "Security deposit created successfully",
      id,
      summary,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: err?.message ?? "Failed to upsert security deposit record",
    });
  }
});
exports.bookingsRouter.delete("/security-deposit/:id", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const id = req.params.id;
    const ref = adminDb.collection("security-deposits").doc(id);
    const snap = await ref.get();
    if (!snap.exists)
      return res
        .status(404)
        .json({ error: "Security deposit record not found" });
    const data = snap.data();
    const bookingId = String(data.bookingId || "");
    await ref.delete();
    let summary = null;
    if (bookingId) {
      try {
        summary = await (0, route_helpers_1.recomputeSecurityDeposit)(
          bookingId,
        );
      } catch (e) {
        console.error("recomputeSecurityDeposit failed after delete:", e);
      }
    }
    return res
      .status(200)
      .json({ message: "Security deposit deleted successfully", summary });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: err?.message ?? "Failed to delete security deposit record",
    });
  }
});
exports.bookingsRouter.get("/incidents/:unitId", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const { unitId } = req.params;
    const { daysAgo } = req.query;
    let query = adminDb.collection("incidents").where("unitId", "==", unitId);
    if (daysAgo) {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - Number(daysAgo));
      query = query.where("date", ">=", pastDate.toISOString().split("T")[0]);
    }
    const snapshot = await query.orderBy("date", "desc").get();
    const incidents = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    return res.status(200).json(incidents);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch incidents" });
  }
});
exports.bookingsRouter.post("/incident", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const newIncident = req.body;
    const docRef = await adminDb.collection("incidents").add(newIncident);
    return res.status(201).json({ id: docRef.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create incident" });
  }
});
exports.bookingsRouter.put("/incident/:incidentId", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const incidentData = req.body;
    await adminDb
      .collection("incidents")
      .doc(req.params.incidentId)
      .update(incidentData);
    return res.status(200).json({ message: "Incident updated successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update incident" });
  }
});
exports.bookingsRouter.delete("/incident/:incidentId", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    await adminDb.collection("incidents").doc(req.params.incidentId).delete();
    return res.status(200).json({ message: "Incident deleted successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete incident" });
  }
});
exports.bookingsRouter.get("/profit-payments", async (req, res) => {
  try {
    const payments = await (0, route_helpers_1.getCollection)(
      "profit-payments",
    );
    return res.status(200).json(payments);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch profit payments" });
  }
});
exports.bookingsRouter.post("/profit-payment", async (req, res) => {
  try {
    const adminDb = (0, route_helpers_1.getDb)();
    const newPayment = req.body;
    const docRef = await adminDb.collection("profit-payments").add(newPayment);
    return res.status(201).json({ id: docRef.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create profit payment" });
  }
});
//# sourceMappingURL=bookings.js.map
