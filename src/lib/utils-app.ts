export function formatCurrency(amount: number) {
  return (
    "₱" +
    (amount || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

function normalizeDateValue(value: any) {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return trimmed;
  }
  if (typeof value === "number") return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === "function") {
    const date = value.toDate();
    if (date instanceof Date) return date.toISOString();
  }
  if (typeof value === "object") {
    const seconds = Number(value.seconds ?? value._seconds);
    const nanoseconds = Number(value.nanoseconds ?? value._nanoseconds);
    if (!Number.isNaN(seconds)) {
      const ms =
        seconds * 1000 + (Number.isFinite(nanoseconds) ? nanoseconds / 1e6 : 0);
      return new Date(ms).toISOString();
    }
    if (typeof value.toISOString === "function") return value.toISOString();
  }
  return String(value);
}

export function getSecurityDepositDate(deposit: any = {}) {
  const rawDate =
    deposit.depositDate ??
    deposit.paymentDate ??
    deposit.checkinDate ??
    deposit.bookingDate ??
    deposit.refundDate ??
    deposit.refundPaidAt ??
    deposit.timestamp ??
    deposit.paidAt ??
    deposit.recordedAt ??
    deposit.createdAt ??
    deposit.updatedAt ??
    deposit.date ??
    "";
  const normalized = normalizeDateValue(rawDate);
  return normalized && !Number.isNaN(new Date(normalized).getTime())
    ? normalized
    : null;
}

export function formatReadableDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDepositDate(value?: string | null) {
  return formatReadableDate(value);
}

export function formatReadableDateTime(value?: string | null) {
  if (!value) return { date: "—", time: "" };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: "—", time: "" };
  return {
    date: parsed.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    time: parsed.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

/**
 * True when a string looks like an opaque Firestore push-ID / Firebase Auth
 * UID: a 20+ character run of word characters (must contain at least one
 * letter so purely-numeric reservation numbers are never mistaken for ids).
 * Used to keep meaningless hashes out of the payments ledger.
 */
export function looksLikeFirestoreId(value?: unknown): boolean {
  if (!value) return false;
  return /^(?=.*[A-Za-z])[\w-]{20,}$/.test(String(value).trim());
}

/**
 * Strips a leading Firestore/Auth-ID hash from a ledger note so only the
 * human-readable text is shown. Returns "" when nothing meaningful remains.
 */
export function stripLedgerHashId(text?: string | null): string {
  if (!text) return "";
  const source = String(text);
  const trimmed = source.trim();
  if (looksLikeFirestoreId(trimmed)) return "";
  const lead = source.match(/^([\w-]{20,})\s+/);
  if (lead && /[A-Za-z]/.test(lead[1])) {
    return source.slice(lead[0].length).trim();
  }
  return trimmed;
}

/**
 * Builds a human-readable label for a booking (payments ledger "Booking"
 * column). Prefers the check-in date; falls back to "—" so a raw
 * Firestore/Auth ID is never displayed.
 */
export function getBookingLabel(booking?: any): string {
  if (!booking) return "—";
  const checkin = formatReadableDateTime(
    booking.checkinDate || booking.startDate || "",
  );
  return checkin.date || "—";
}

export function normalizeBookingDepositStatus(rawStatus: any) {
  const status = String(rawStatus || "")
    .trim()
    .toLowerCase();
  if (status.includes("partial")) return "Partial";
  if (status.includes("unpaid")) return "Unpaid";
  if (
    status.includes("paid") ||
    status.includes("received") ||
    status.includes("held") ||
    status.includes("active")
  )
    return "Paid";
  return "Unpaid";
}

export type NormalizedSecurityDeposit = {
  id: string;
  bookingId: string;
  guestName: string;
  unitId: string;
  unitName: string;
  agent: string;
  depositAmount: number;
  refundAmount: number;
  depositStatus: string;
  status: string;
  bookingStatus: string;
  transactionType: string;
  checkinDate: string;
  checkoutDate: string;
  bookingDate: string;
  createdAt: string;
  depositDate: string;
  refundDate: string;
};

// Returns the first finite, positive number from the given values, else 0.
function firstPositiveNumber(...values: unknown[]): number {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/**
 * Normalizes a raw deposit status into exactly one of: "Paid", "Partial",
 * "Unpaid". A refunded deposit was collected, so it is treated as "Paid"
 * (the refund reduces Active Held, not the collected total).
 */
export function normalizeDepositDisplayStatus(rawStatus: string): string {
  const s = String(rawStatus || "").trim().toLowerCase();
  if (s.includes("refund")) return "Paid";
  return normalizeBookingDepositStatus(rawStatus);
}

/**
 * Builds a single normalized dataset directly from Bookings (the source of
 * truth). One record per booking that carries security deposit data. Every
 * widget in the Security Deposit Monitoring tab consumes this same dataset so
 * summary cards, charts and the ledger always agree.
 */
export function normalizeSecurityDepositsFromBookings(bookings: any[] = []) {
  return (Array.isArray(bookings) ? bookings : [])
    .map((booking) => {
      const bookingId = String(
        booking.id || booking.bookingId || booking.booking_id || "",
      );
      const unitId = String(
        booking.unitId || booking.unit_id || booking.unit?.id || "",
      );
      const unitName =
        booking.unitName ||
        booking.unitNumber ||
        booking.unit?.name ||
        booking.unit?.unitNumber ||
        booking.listingName ||
        "";
      const guestName =
        String(booking.guestName || "").trim() ||
        `${booking.guestFirstName || ""} ${booking.guestLastName || ""}`.trim() ||
        String(booking.guest?.name || "").trim() ||
        String(booking.guest_name || "").trim() ||
        "";
      const agent = String(
        booking.agent ||
          booking.agentName ||
          booking.assignedAgent ||
          booking.assigned_agent ||
          booking.processedBy ||
          booking.agent_id ||
          booking.uid ||
          "",
      ).trim();

      const receipt = booking.securityDepositReceipt || {};
      const securityDeposit = booking.securityDeposit || {};
      const deposit =
        booking.deposit && typeof booking.deposit === "object"
          ? booking.deposit
          : {};

      const rawStatus = String(
        receipt.status ||
          securityDeposit.status ||
          booking.securityDepositStatus ||
          booking.depositStatus ||
          booking.deposit?.status ||
          "",
      );

      // Map the deposit amount from every plausible field — never 0/NaN when a
      // real deposit exists.
      const depositAmount = firstPositiveNumber(
        securityDeposit.amount,
        receipt.amount,
        deposit.amount,
        booking.securityDepositAmount,
        booking.depositAmount,
        booking.deposit?.amount,
        booking.additionalDepositAmount,
      );

      // Only bookings that actually carry a security deposit belong here.
      const hasDepositSignal =
        rawStatus.trim() !== "" ||
        depositAmount > 0 ||
        booking.securityDeposit != null ||
        booking.securityDepositReceipt != null ||
        booking.securityDepositStatus != null ||
        booking.depositStatus != null ||
        booking.deposit != null;
      if (!hasDepositSignal) return null;

      const status = normalizeDepositDisplayStatus(rawStatus);

      const refundAmount = Number(
        receipt.refundAmount ?? booking.refundAmount ?? 0,
      );

      // Only completed refunds are counted. When there is no explicit refund
      // status, a positive refund amount is treated as completed because the
      // canonical booking refund flow only writes a refund when it is paid out.
      const rawRefundStatus = String(
        receipt.refundStatus || booking.refundStatus || "",
      ).toLowerCase();
      const refundCompleted =
        (rawRefundStatus === "" && refundAmount > 0) ||
        (rawRefundStatus !== "" &&
          !["pending", "processing", "unpaid", "void", "cancelled", "failed"].some(
            (k) => rawRefundStatus.includes(k),
          ));
      const effectiveRefundAmount =
        refundCompleted && refundAmount > 0 ? refundAmount : 0;

      const checkinDate = booking.checkinDate || booking.bookingDate || "";
      const checkoutDate = booking.checkoutDate || "";
      const bookingDate = booking.bookingDate || booking.date || "";
      const createdAt =
        booking.createdAt || booking.bookingDate || booking.date || "";

      // Resolve the deposit date with a full fallback chain:
      // depositDate -> checkinDate -> createdAt -> date. Never drop a booking
      // simply because one optional date field is missing.
      const depositDate =
        getSecurityDepositDate({
          ...receipt,
          depositDate:
            receipt.depositDate ||
            receipt.paidAt ||
            checkinDate ||
            createdAt ||
            bookingDate,
        }) || "";

      return {
        id: bookingId,
        bookingId,
        guestName: guestName || "—",
        unitId: unitId || "—",
        unitName: unitName || unitId || "—",
        agent: agent || "—",
        depositAmount: Number.isFinite(depositAmount) ? depositAmount : 0,
        refundAmount: Number.isFinite(effectiveRefundAmount)
          ? effectiveRefundAmount
          : 0,
        depositStatus: status,
        status,
        bookingStatus: String(
          booking.bookingStatus ||
            booking.paymentStatus ||
            booking.bookingPayment?.status ||
            "",
        ),
        transactionType:
          status === "Unpaid" ? "Unpaid Deposit" : "Deposit Received",
        checkinDate,
        checkoutDate,
        bookingDate,
        createdAt,
        depositDate,
        refundDate:
          getSecurityDepositDate({
            ...receipt,
            refundPaidAt: receipt.refundPaidAt,
          }) || "",
      };
    })
    .filter((record) => record !== null);
}

/**
 * Summary metric for the normalized bookings-based security deposit dataset.
 * - Total Collected: sum of deposit amounts for Paid bookings.
 * - Total Refunded:  sum of completed refund amounts (never the original deposit).
 * - Active Held:     Total Collected minus Total Refunded.
 * - Unpaid Deposits: sum of deposit amounts not yet collected (Unpaid bookings).
 */
export function summarizeNormalizedSecurityDeposits(records: any[] = []) {
  const rows = Array.isArray(records) ? records : [];
  const totalCollected = rows
    .filter((r) => r.status === "Paid")
    .reduce((s, r) => s + (Number(r.depositAmount) || 0), 0);
  const isCompletedRefund = (r: any) => {
    const amount = Number(r.refundAmount) || 0;
    if (amount <= 0) return false;
    const rs = String(r.refundStatus || "").toLowerCase();
    if (rs === "") return true;
    return !["pending", "processing", "unpaid", "void", "cancelled", "failed"].some(
      (k) => rs.includes(k),
    );
  };
  const totalRefunded = rows
    .filter(isCompletedRefund)
    .reduce((s, r) => s + (Number(r.refundAmount) || 0), 0);
  const activeHeld = Math.max(0, totalCollected - totalRefunded);
  const unpaidDeposits = rows
    .filter((r) => r.status === "Unpaid")
    .reduce((s, r) => s + (Number(r.depositAmount) || 0), 0);
  return { totalCollected, totalRefunded, activeHeld, unpaidDeposits };
}


export type SecurityDepositFilters = {
  month?: number;
  year?: number;
  unit?: string;
  agent?: string;
  guest?: string;
  status?: string;
  paymentMethod?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
};

export function filterSecurityDeposits(
  deposits: any[] = [],
  filters: SecurityDepositFilters = {},
) {
  const {
    month,
    year,
    unit,
    agent,
    guest,
    status,
    paymentMethod,
    search,
    startDate,
    endDate,
  } = filters;

  const normalized = Array.isArray(deposits) ? deposits : [];

  return normalized.filter((deposit) => {
    // Voided or deleted transactions are never shown in reports/ledger.
    const dStatus = String(
      deposit.status || deposit.depositStatus || "",
    ).toLowerCase();
    if (
      deposit.deleted === true ||
      dStatus === "void" ||
      dStatus === "cancelled"
    ) {
      return false;
    }

    const depositDate = getSecurityDepositDate(deposit);
    if (month !== undefined && year !== undefined) {
      // Records without a resolvable date must never be dropped because of
      // a missing optional field — they still belong to the period view.
      if (
        depositDate &&
        !depositDate.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)
      ) {
        return false;
      }
    }

    if (startDate) {
      const start = parseLocalOnly(startDate);
      const actual = depositDate ? parseLocalOnly(depositDate) : null;
      if (actual && start && actual < start) return false;
    }

    if (endDate) {
      const end = parseLocalOnly(endDate);
      const actual = depositDate ? parseLocalOnly(depositDate) : null;
      if (actual && end && actual > end) return false;
    }

    if (unit && unit !== "all") {
      if (String(deposit.unitId || deposit.unit_id) !== String(unit))
        return false;
    }
    if (agent && agent !== "all") {
      const depositAgent = String(
        deposit.agent || deposit.processedBy || "",
      ).trim();
      if (depositAgent !== String(agent)) return false;
    }
    if (guest && guest !== "all") {
      if (String(deposit.guestName || deposit.guest?.name) !== String(guest))
        return false;
    }
    if (status && status !== "all") {
      const normalizedStatus = status.toLowerCase();
      const recordStatus = String(
        deposit.status || deposit.depositStatus || "",
      ).toLowerCase();

      const isPaidLike =
        recordStatus === "paid" ||
        recordStatus === "received" ||
        recordStatus === "held" ||
        recordStatus === "active";
      const isPartialLike = recordStatus.includes("partial");
      const isUnpaidLike = recordStatus === "unpaid";

      if (normalizedStatus === "paid" && !isPaidLike) return false;
      if (normalizedStatus === "partial" && !isPartialLike) return false;
      if (normalizedStatus === "unpaid" && !isUnpaidLike) return false;
      if (
        !["paid", "partial", "unpaid"].includes(normalizedStatus) &&
        recordStatus !== normalizedStatus
      )
        return false;
    }
    if (paymentMethod && paymentMethod !== "all") {
      const method = String(
        deposit.method || deposit.paymentMethod || deposit.depositMethod || "",
      ).toLowerCase();
      if (method !== paymentMethod.toLowerCase()) return false;
    }

    if (search && String(search).trim() !== "") {
      const needle = String(search).trim().toLowerCase();
      const guestName = String(
        deposit.guestName || deposit.guest?.name || "",
      ).toLowerCase();
      const bookingId = String(
        deposit.bookingId || deposit.booking_id || "",
      ).toLowerCase();
      const unitName = String(
        deposit.unitName || deposit.unit?.name || deposit.unitNumber || "",
      ).toLowerCase();
      const unitId = String(
        deposit.unitId || deposit.unit_id || "",
      ).toLowerCase();
      const agentName = String(
        deposit.agent || deposit.processedBy || "",
      ).toLowerCase();
      const receipt = String(
        deposit.receiptNumber ||
          deposit.reference ||
          deposit.transactionRef ||
          "",
      ).toLowerCase();
      if (
        !guestName.includes(needle) &&
        !bookingId.includes(needle) &&
        !unitName.includes(needle) &&
        !unitId.includes(needle) &&
        !agentName.includes(needle) &&
        !receipt.includes(needle)
      ) {
        return false;
      }
    }

    return true;
  });
}

export function normalizeSecurityDepositRecord(deposit: any = {}) {
  const rawType = String(deposit.type ?? deposit.kind ?? "").toLowerCase();
  const isRefundType =
    rawType.includes("refund") ||
    rawType === "refund" ||
    rawType === "partial refund" ||
    rawType === "partialrefund";
  const isAdjustmentType =
    rawType.includes("adjust") || rawType.includes("correction");
  const isAdditionalType = rawType.includes("additional");

  const amount = Number(
    deposit.amount ??
      (isRefundType
        ? (deposit.refundAmount ?? deposit.partialRefundAmount)
        : undefined) ??
      (isAdjustmentType ? deposit.adjustmentAmount : undefined) ??
      (isAdditionalType
        ? (deposit.additionalDepositAmount ?? deposit.depositAmount)
        : undefined) ??
      deposit.depositAmount ??
      deposit.additionalDepositAmount ??
      deposit.refundAmount ??
      deposit.partialRefundAmount ??
      deposit.adjustmentAmount ??
      deposit.totalAmount ??
      deposit.value ??
      0,
  );
  const rawPaidAt =
    deposit.depositDate ??
    deposit.paymentDate ??
    deposit.timestamp ??
    deposit.paidAt ??
    deposit.refundPaidAt ??
    deposit.updatedAt ??
    deposit.recordedAt ??
    deposit.createdAt ??
    deposit.date ??
    "";
  const paidAtValue = normalizeDateValue(rawPaidAt);
  const paidAt = !Number.isNaN(new Date(paidAtValue).getTime())
    ? paidAtValue
    : "";
  const rawStatus = String(
    deposit.status ?? deposit.depositStatus ?? "",
  ).toLowerCase();
  const type = rawType
    ? rawType
    : rawStatus.includes("refund")
      ? "refund"
      : "receive";
  const status = String(
    deposit.status ??
      deposit.depositStatus ??
      (type === "refund" ? "Refunded" : "Paid"),
  );
  const transactionType = String(deposit.transactionType || type).toLowerCase();
  const refundPaidAtValue = normalizeDateValue(deposit.refundPaidAt);
  const refundPaidAt = !Number.isNaN(new Date(refundPaidAtValue).getTime())
    ? refundPaidAtValue
    : "";
  const dateValue = normalizeDateValue(deposit.date ?? paidAt);
  const createdAtValue = normalizeDateValue(deposit.createdAt ?? paidAt);
  const method =
    deposit.method ||
    deposit.paymentMethod ||
    deposit.depositMethod ||
    deposit.receiptMethod ||
    "";
  const reference =
    deposit.reference ||
    deposit.receiptReference ||
    deposit.receiptNumber ||
    deposit.transactionRef ||
    deposit.ref ||
    "";
  const processedBy =
    deposit.processedBy ||
    deposit.processed_by ||
    deposit.user ||
    "";
  const notes =
    deposit.notes ||
    deposit.description ||
    deposit.remarks ||
    deposit.message ||
    "";
  const transactionDate = getSecurityDepositDate({
    ...deposit,
    paidAt,
    refundPaidAt,
    date: dateValue,
    createdAt: createdAtValue,
  });

  return {
    ...deposit,
    amount: Number.isFinite(amount) ? amount : 0,
    type,
    transactionType,
    status,
    paidAt,
    refundPaidAt,
    transactionDate,
    paymentMethod: method,
    reference,
    receiptNumber: reference,
    processedBy,
    notes,
    date: !Number.isNaN(new Date(dateValue).getTime()) ? dateValue : paidAt,
    createdAt: !Number.isNaN(new Date(createdAtValue).getTime())
      ? createdAtValue
      : paidAt,
    unitId:
      deposit.unitId ??
      deposit.unit_id ??
      deposit.unit?.id ??
      deposit.unitID ??
      "",
    bookingId:
      deposit.bookingId ?? deposit.booking_id ?? deposit.booking?.id ?? "",
    guestName:
      deposit.guestName ?? deposit.guest?.name ?? deposit.guestName ?? "",
    unitName:
      deposit.unitName ?? deposit.unit?.name ?? deposit.unit?.unitNumber ?? "",
  };
}

export function normalizeSecurityDeposits(deposits: any[] = []) {
  return (Array.isArray(deposits) ? deposits : []).map(
    normalizeSecurityDepositRecord,
  );
}

export function normalizeBookingSecurityDepositRecords(bookings: any[] = []) {
  return (Array.isArray(bookings) ? bookings : []).flatMap((booking) => {
    const bookingId = String(
      booking.id || booking.bookingId || booking.booking_id || "",
    );
    if (!bookingId) return [];

    const unitId = String(
      booking.unitId ||
        booking.unit_id ||
        booking.unit?.id ||
        booking.unitID ||
        "",
    );
    const unitName =
      booking.unitName || booking.unit?.name || booking.unit?.unitNumber || "";
    const guestName =
      String(booking.guestName || "").trim() ||
      `${booking.guestFirstName || ""} ${booking.guestLastName || ""}`.trim();
    const guestId =
      booking.guestId || booking.guest_id || booking.guest?.id || "";
    const receipt = booking.securityDepositReceipt || {};
    const defaultStatus = normalizeBookingDepositStatus(
      receipt.status ||
        booking.securityDepositStatus ||
        booking.depositStatus ||
        "",
    );
    const defaultAgent = String(
      booking.agent ||
        booking.agentName ||
        booking.assignedAgent ||
        booking.processedBy ||
        booking.processed_by ||
        "",
    ).trim();
    const defaultTimestamp =
      booking.bookingDate || booking.checkinDate || booking.createdAt || "";

    const history = Array.isArray(booking.securityDepositHistory)
      ? booking.securityDepositHistory
      : [];

    const records: any[] = [];

    if (history.length > 0) {
      history.forEach((entry: any, index: number) => {
        const amount = Number(entry.amount ?? entry.value ?? 0);
        if (amount === 0) return;

        const rawType = String(
          entry.type || entry.transactionType || "",
        ).trim();
        const typeSlug = rawType.toLowerCase();
        const type = typeSlug.includes("refund")
          ? typeSlug.includes("partial")
            ? "partial refund"
            : "refund"
          : typeSlug.includes("additional")
            ? "additional deposit"
            : typeSlug.includes("adjust")
              ? "adjustment"
              : typeSlug.includes("correct")
                ? "correction"
                : typeSlug.includes("transfer")
                  ? "transfer"
                  : "receive";

        const timestamp =
          entry.timestamp ||
          entry.paidAt ||
          entry.date ||
          entry.createdAt ||
          entry.recordedAt ||
          defaultTimestamp ||
          "";
        const agent = String(
          entry.agent || entry.processedBy || defaultAgent,
        ).trim();
        const status = normalizeBookingDepositStatus(
          entry.status || entry.state || defaultStatus,
        );

        records.push(
          normalizeSecurityDepositRecord({
            id: `booking-${bookingId}-history-${index}`,
            bookingId,
            unitId,
            unitName,
            guestName,
            guestId,
            processedBy: agent,
            agent,
            amount,
            transactionType: type,
            type,
            status,
            paidAt: timestamp,
            timestamp,
            paymentMethod:
              entry.method ||
              entry.paymentMethod ||
              receipt.method ||
              booking.paymentMethod ||
              "",
            reference:
              entry.reference ||
              entry.receiptNumber ||
              receipt.reference ||
              booking.transactionRef ||
              "",
            receiptNumber:
              entry.receiptNumber ||
              entry.reference ||
              receipt.reference ||
              booking.transactionRef ||
              "",
            notes:
              entry.notes ||
              entry.description ||
              receipt.notes ||
              booking.notes ||
              `Derived from booking ${bookingId}`,
            date: timestamp,
            createdAt: entry.createdAt || timestamp,
          }),
        );
      });

      return records;
    }

    const depositAmount = Number(
      booking.securityDeposit?.amount ??
        booking.securityDepositAmount ??
        receipt.amount ??
        0,
    );
    const refundAmount = Number(receipt.refundAmount ?? 0);

    const paidAt =
      receipt.paidAt ||
      booking.bookingDate ||
      booking.checkinDate ||
      booking.createdAt ||
      "";
    const refundPaidAt =
      receipt.refundPaidAt || receipt.paidAt || booking.refundPaidAt || "";

    const method =
      receipt.method ||
      booking.securityDeposit?.method ||
      booking.paymentMethod ||
      "";
    const reference =
      receipt.reference ||
      booking.securityDeposit?.reference ||
      booking.transactionRef ||
      "";
    const notes =
      receipt.notes ||
      booking.securityDeposit?.notes ||
      booking.notes ||
      `Derived from booking ${bookingId}`;

    if (depositAmount > 0) {
      const depositType = String(
        booking.securityDeposit?.type || receipt.type || defaultStatus || "",
      ).toLowerCase();
      const type = depositType.includes("refund")
        ? "refund"
        : depositType.includes("additional")
          ? "additional deposit"
          : depositType.includes("adjust")
            ? "adjustment"
            : depositType.includes("correction")
              ? "correction"
              : depositType.includes("transfer")
                ? "transfer"
                : "receive";

      records.push(
        normalizeSecurityDepositRecord({
          id: `booking-${bookingId}-deposit`,
          bookingId,
          unitId,
          unitName,
          guestName,
          guestId,
          processedBy: defaultAgent,
          agent: defaultAgent,
          amount: depositAmount,
          transactionType: type,
          type,
          status: defaultStatus,
          paidAt,
          paymentMethod: method,
          reference,
          receiptNumber: reference,
          notes,
          date: paidAt,
          createdAt:
            booking.createdAt ||
            booking.bookingDate ||
            new Date().toISOString(),
        }),
      );
    }

    if (refundAmount > 0) {
      const refundType = String(
        receipt.type || defaultStatus || booking.securityDeposit?.type || "",
      ).toLowerCase();
      const type = refundType.includes("partial")
        ? "partial refund"
        : refundType.includes("adjust")
          ? "adjustment"
          : refundType.includes("correction")
            ? "correction"
            : refundType.includes("transfer")
              ? "transfer"
              : "refund";

      records.push(
        normalizeSecurityDepositRecord({
          id: `booking-${bookingId}-refund`,
          bookingId,
          unitId,
          unitName,
          guestName,
          guestId,
          processedBy: defaultAgent,
          agent: defaultAgent,
          amount: refundAmount,
          transactionType: type,
          type,
          status: String(receipt.status || defaultStatus)
            .toLowerCase()
            .includes("pending")
            ? "Pending"
            : "Refunded",
          refundStatus: String(
            receipt.refundStatus || receipt.status || "",
          ).trim(),
          paidAt: refundPaidAt || paidAt,
          refundPaidAt: refundPaidAt || paidAt,
          paymentMethod: method,
          reference,
          receiptNumber: reference,
          notes: receipt.notes || booking.securityDeposit?.notes || notes,
          date: refundPaidAt || paidAt,
          createdAt:
            booking.createdAt ||
            booking.bookingDate ||
            new Date().toISOString(),
        }),
      );
    }

    if (
      records.length === 0 &&
      depositAmount > 0 &&
      String(defaultStatus).toLowerCase() === "unpaid"
    ) {
      records.push(
        normalizeSecurityDepositRecord({
          id: `booking-${bookingId}-deposit`,
          bookingId,
          unitId,
          unitName,
          guestName,
          guestId,
          processedBy: defaultAgent,
          agent: defaultAgent,
          amount: depositAmount,
          transactionType: "receive",
          type: "receive",
          status: "Unpaid",
          paidAt,
          paymentMethod: method,
          reference,
          receiptNumber: reference,
          notes,
          date: paidAt,
          createdAt:
            booking.createdAt ||
            booking.bookingDate ||
            new Date().toISOString(),
        }),
      );
    }

    return records;
  });
}

export function summarizeSecurityDeposits(deposits: any[] = []) {
  const records = Array.isArray(deposits) ? deposits : [];

  const typeOf = (d: any) =>
    String(d.transactionType || d.type || d.kind || "").toLowerCase();
  const statusOf = (d: any) =>
    String(d.status || d.depositStatus || "").toLowerCase();
  const refundStatusOf = (d: any) => String(d.refundStatus || "").toLowerCase();

  const isReceive = (d: any) => {
    const t = typeOf(d);
    return (
      t === "receive" ||
      t === "initial deposit" ||
      t === "initialdeposit" ||
      t === "additional deposit" ||
      t === "additionaldeposit" ||
      t === "top-up" ||
      t === "topup" ||
      t === "deposit" ||
      t === "adjustment" ||
      t === "correction" ||
      t === "transfer"
    );
  };
  const isRefund = (d: any) => {
    const t = typeOf(d);
    return (
      t === "refund" ||
      t === "partial refund" ||
      t === "partialrefund" ||
      t === "pending refund"
    );
  };
  const isVoid = (d: any) =>
    d?.deleted === true ||
    statusOf(d) === "void" ||
    statusOf(d) === "cancelled" ||
    typeOf(d) === "void";

  // Total Collected: every received security deposit that is still held.
  const collected = records
    .filter((d) => {
      if (isVoid(d)) return false;
      const s = statusOf(d);
      if (s === "refunded" || s === "unpaid") return false;
      if (isRefund(d)) return false;
      return (
        isReceive(d) ||
        s === "paid" ||
        s === "received" ||
        s === "held" ||
        s === "active"
      );
    })
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  // Total Refunded: only completed refunds (never pending refunds).
  const refunded = records
    .filter((d) => {
      if (isVoid(d)) return false;
      const s = statusOf(d);
      const rs = refundStatusOf(d);
      if (s === "refunded") return true;
      if (
        isRefund(d) &&
        rs !== "pending" &&
        s !== "pending" &&
        s !== "pending refund"
      )
        return true;
      return false;
    })
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  // Pending Refunds: records not yet completed plus explicit pending flags.
  const pendingRefunds = records
    .filter((d) => {
      if (isVoid(d)) return false;
      const s = statusOf(d);
      const rs = refundStatusOf(d);
      if (s === "refunded") return false;
      if (d?.refundRequested === true) return true;
      if (rs === "pending") return true;
      if (s === "pending" || s === "pending refund") return true;
      if (isRefund(d) && s !== "refunded") return true;
      return false;
    })
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  // Current Balance: collected minus completed refunds.
  const currentBalance = collected - refunded;
  // Active Held: deposits currently held by the property (net of refunds).
  const activeHeld = currentBalance;

  return { collected, refunded, pendingRefunds, activeHeld, currentBalance };
}

export function buildBookingDepositSummary(deposits: any[] = []) {
  const records = Array.isArray(deposits) ? deposits : [];
  const map = new Map<string, any>();

  records.forEach((d) => {
    const bookingId = String(d.bookingId || d.booking_id || "");
    if (!bookingId) return;

    const current =
      map.get(bookingId) ??
      ({
        bookingId,
        collected: 0,
        refunded: 0,
        pendingRefunds: 0,
        records: [] as any[],
        latestReceive: null,
        latestRefund: null,
        latestTransaction: null,
        receiptNumber: "",
        latestReceiveDate: "",
        latestRefundDate: "",
        latestTransactionDate: "",
      } as any);

    const status = String(d.status || d.depositStatus || "").toLowerCase();
    const amount = Number(d.amount) || 0;

    const isReceiveLike =
      d.type === "receive" ||
      status === "paid" ||
      status === "received" ||
      status === "held" ||
      status === "active";
    const isRefundLike =
      d.type === "refund" ||
      status === "refunded" ||
      status === "pending refund";

    if (
      isReceiveLike &&
      status !== "refunded" &&
      status !== "cancelled" &&
      status !== "void"
    ) {
      current.collected += amount;
      const date = getSecurityDepositDate(d) || "";
      if (date >= current.latestReceiveDate) {
        current.latestReceive = d;
        current.latestReceiveDate = date;
      }
    }

    if (isRefundLike) {
      current.refunded += amount;
      const date = getSecurityDepositDate(d) || "";
      if (date >= current.latestRefundDate) {
        current.latestRefund = d;
        current.latestRefundDate = date;
      }
    }

    if (d.type === "refund" && status !== "refunded" && status !== "void") {
      current.pendingRefunds += amount;
    }

    const txnDate = getSecurityDepositDate(d) || "";
    if (txnDate >= current.latestTransactionDate) {
      current.latestTransaction = d;
      current.latestTransactionDate = txnDate;
    }

    if (d.reference || d.receiptNumber) {
      current.receiptNumber = d.reference || d.receiptNumber;
    }

    current.records.push(d);
    map.set(bookingId, current);
  });

  map.forEach((value: any) => {
    const currentBalance = value.collected - value.refunded;
    value.currentDeposit = value.collected;
    value.totalDeposits = value.collected;
    value.totalRefunds = value.refunded;
    value.remainingHeldDeposit = currentBalance > 0 ? currentBalance : 0;
    value.currentBalance = currentBalance;
    value.completeDepositHistory = value.records;

    if (value.collected === 0) value.depositStatus = "Unpaid";
    else if (currentBalance <= 0 && value.refunded > 0)
      value.depositStatus = "Refunded";
    else value.depositStatus = "Received";

    value.refundStatus =
      value.pendingRefunds > 0
        ? "Pending"
        : value.refunded > 0
          ? "Refunded"
          : "None";

    // Kept for backward compatibility with consumers that read `.status`.
    value.status = value.depositStatus;

    delete value.latestReceiveDate;
    delete value.latestRefundDate;
    delete value.latestTransactionDate;
  });

  return map;
}

export function calculateSecurityDepositTransactionMetrics(
  deposits: any[] = [],
) {
  const records = Array.isArray(deposits) ? deposits : [];
  const getType = (d: any) =>
    String(d.transactionType || d.type || "").toLowerCase();
  const getStatus = (d: any) =>
    String(d.status || d.depositStatus || "").toLowerCase();

  const receiveTypes = new Set(["receive", "additional deposit"]);
  const refundTypes = new Set(["refund", "partial refund"]);
  const adjustmentTypes = new Set(["adjustment", "correction"]);

  const collected = records
    .filter((d) => {
      const type = getType(d);
      const status = getStatus(d);
      return (
        receiveTypes.has(type) && status !== "unpaid" && status !== "pending"
      );
    })
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  const refunded = records
    .filter((d) => {
      const type = getType(d);
      const status = getStatus(d);
      return (
        refundTypes.has(type) &&
        status !== "pending" &&
        status !== "pending refund"
      );
    })
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  const adjustments = records
    .filter((d) => adjustmentTypes.has(getType(d)))
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  const pendingRefunds = records
    .filter((d) => {
      const type = getType(d);
      const status = getStatus(d);
      return (
        refundTypes.has(type) &&
        (status === "pending" ||
          status === "pending refund" ||
          String(d.refundStatus || "").toLowerCase() === "pending")
      );
    })
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  const activeHeld = collected - refunded;
  const currentLiability = activeHeld + adjustments;
  const netDepositCash = activeHeld - pendingRefunds;

  return {
    collected,
    refunded,
    adjustments,
    pendingRefunds,
    activeHeld,
    currentLiability,
    netDepositCash,
    currentBalance: activeHeld,
  };
}

export function calculateDepositMetrics(deposits: any[] = []) {
  return calculateSecurityDepositTransactionMetrics(deposits);
}

export function getDaysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Parses a date string into a local midnight Date object, ignoring timezone offsets.
 */
export function parseLocalOnly(dateStr: string): Date | null {
  if (!dateStr) return null;
  const datePart = dateStr.split("T")[0];
  const parts = datePart.split("-");
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(Number);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day))
    return null;
  return new Date(year, month - 1, day);
}

const padTwo = (value: number) => String(value).padStart(2, "0");

/**
 * Formats a Date as a local calendar date string "YYYY-MM-DD" using the local
 * date components (year/month/day). This is the app's canonical date-key helper.
 *
 * CRITICAL: Do NOT use `date.toISOString().split("T")[0]` for a recording date.
 * `toISOString()` converts to UTC, so an activity performed before 08:00 local
 * time (Philippines, UTC+8) would be bucketed to the PREVIOUS calendar day.
 * This repository operates in Philippine local time, so recording dates must be
 * derived from local components, not UTC.
 */
export function parseLocalDateInput(date: Date): string {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(
    date.getDate(),
  )}`;
}

/** Returns the local date (per the field components) offset by `days`. */
export function addLocalDays(input: Date, days: number): Date {
  const normalized = new Date(
    input.getFullYear(),
    input.getMonth(),
    input.getDate(),
  );
  normalized.setDate(normalized.getDate() + days);
  return normalized;
}

/** Today's local calendar date as "YYYY-MM-DD" (the recording date for activity). */
export function todayLocalDateInput(): string {
  return parseLocalDateInput(new Date());
}

/** Tomorrow's local calendar date as "YYYY-MM-DD". */
export function tomorrowLocalDateInput(): string {
  return parseLocalDateInput(addLocalDays(new Date(), 1));
}

/**
 * Calculates the portion of a booking's total amount that belongs to a specific month.
 * @param booking The booking object containing totalAmount, checkinDate, and checkoutDate.
 * @param targetMonth 0-indexed month (0 = Jan, 11 = Dec).
 * @param targetYear The 4-digit year.
 * @returns The prorated amount for that month.
 */
export function calculateProratedRevenue(
  booking: any,
  targetMonth: number,
  targetYear: number,
) {
  const checkin = parseLocalOnly(booking.checkinDate);
  const checkout = parseLocalOnly(booking.checkoutDate);
  const totalAmount = Number(booking.totalAmount) || 0;

  if (!checkin || !checkout || totalAmount <= 0) return 0;

  const totalNights = Math.max(
    1,
    Math.round((checkout.getTime() - checkin.getTime()) / 86400000),
  );
  const nightlyRate = totalAmount / totalNights;

  const targetMonthStart = new Date(targetYear, targetMonth, 1);
  const nextMonthStart = new Date(targetYear, targetMonth + 1, 1);

  // Intersection of booking nights and target month
  const overlapStart = new Date(
    Math.max(targetMonthStart.getTime(), checkin.getTime()),
  );
  const overlapEnd = new Date(
    Math.min(nextMonthStart.getTime(), checkout.getTime()),
  );

  const overlapNights = Math.round(
    (overlapEnd.getTime() - overlapStart.getTime()) / 86400000,
  );

  return overlapNights > 0 ? overlapNights * nightlyRate : 0;
}

/**
 * Calculates the portion of a booking's base rate (excluding agent surplus) that belongs to a specific month.
 * @param booking The booking object containing baseRate/totalAmount, checkinDate, and checkoutDate.
 * @param targetMonth 0-indexed month (0 = Jan, 11 = Dec).
 * @param targetYear The 4-digit year.
 * @returns The prorated base amount for that month.
 */
export function calculateProratedBaseRevenue(
  booking: any,
  targetMonth: number,
  targetYear: number,
) {
  const checkin = parseLocalOnly(booking.checkinDate);
  const checkout = parseLocalOnly(booking.checkoutDate);

  if (!checkin || !checkout) return 0;

  const totalNights = Math.max(
    1,
    Math.round((checkout.getTime() - checkin.getTime()) / 86400000),
  );
  const totalAmount = Number(booking.totalAmount) || 0;

  // baseRate in database represents the nightly unit base rate. Total base rate is baseRate * totalNights.
  // Fall back to totalAmount if baseRate is not present.
  const rawBaseAmount = Number(booking.baseRate)
    ? Number(booking.baseRate) * totalNights
    : totalAmount;

  // Cap the total base rate at totalAmount only when it is higher than totalAmount
  const baseAmount = rawBaseAmount > totalAmount ? totalAmount : rawBaseAmount;

  if (baseAmount <= 0) return 0;

  const nightlyRate = baseAmount / totalNights;

  const targetMonthStart = new Date(targetYear, targetMonth, 1);
  const nextMonthStart = new Date(targetYear, targetMonth + 1, 1);

  // Intersection of booking nights and target month
  const overlapStart = new Date(
    Math.max(targetMonthStart.getTime(), checkin.getTime()),
  );
  const overlapEnd = new Date(
    Math.min(nextMonthStart.getTime(), checkout.getTime()),
  );

  const overlapNights = Math.round(
    (overlapEnd.getTime() - overlapStart.getTime()) / 86400000,
  );

  return overlapNights > 0 ? overlapNights * nightlyRate : 0;
}
