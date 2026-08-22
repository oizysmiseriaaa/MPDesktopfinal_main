import { getOperationsStatus, getCheckoutAt } from "./calendar-operations";

export const HOUSEKEEPING_STATUS_PENDING = "Pending";
export const HOUSEKEEPING_STATUS_IN_PROGRESS = "In Progress";
export const HOUSEKEEPING_STATUS_COMPLETED = "Completed";

export const HOUSEKEEPING_STATUSES = [
  HOUSEKEEPING_STATUS_PENDING,
  HOUSEKEEPING_STATUS_IN_PROGRESS,
  HOUSEKEEPING_STATUS_COMPLETED,
] as const;

export type HousekeepingStatus = (typeof HOUSEKEEPING_STATUSES)[number];

/** Next status a human staff move lands on; completed is terminal. */
export function nextHousekeepingStatus(
  current: string | null | undefined,
): HousekeepingStatus {
  const normalized = String(current || "").trim();
  if (normalized === HOUSEKEEPING_STATUS_COMPLETED)
    return HOUSEKEEPING_STATUS_COMPLETED;
  if (normalized === HOUSEKEEPING_STATUS_PENDING)
    return HOUSEKEEPING_STATUS_IN_PROGRESS;
  if (normalized === HOUSEKEEPING_STATUS_IN_PROGRESS)
    return HOUSEKEEPING_STATUS_COMPLETED;
  return HOUSEKEEPING_STATUS_PENDING;
}

/** Builds a short human-friendly date label like "2026-06-03". */
function localDateLabel(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Local-time date label (ignores the ISO time-component timezone shift). */
export function checkoutDateInput(checkoutAt: Date | null): string {
  if (!checkoutAt) return localDateLabel(new Date());
  return localDateLabel(checkoutAt);
}

/**
 * Deterministic document id for a housekeeping task so the same booking can
 * never produce more than one task (unit stays idempotent across refreshes,
 * navigation, reconnects and repeated time checks).
 */
export function getHousekeepingTaskId(
  bookingId: string | undefined,
  checkoutDate: string,
): string {
  const id = String(bookingId || "").trim() || "unknown";
  return `housekeeping-${id}-${checkoutDate}`;
}

/** True when a reminder belongs to the checkout workflow. */
export function isCheckoutReminder(reminder: any): boolean {
  const type = String(reminder?.reminderType || "").toLowerCase();
  if (
    type === "checkout" ||
    type === "checkout-due" ||
    type.includes("checkout")
  )
    return true;
  const title = String(reminder?.title || "").toLowerCase();
  return title.includes("checkout") || title.includes("check out");
}

function resolvedStatus(booking: any): string {
  return String(
    booking?.cancelled === true
      ? "cancelled"
      : booking?.status || booking?.bookingStatus || "",
  )
    .trim()
    .toLowerCase();
}

/** Whether a booking is genuinely finished and eligible for housekeeping. */
export function isHousekeepingEligibleBooking(
  booking: any,
  now: Date = new Date(),
): boolean {
  if (!booking || !booking?.id) return false;
  // Cancelled bookings are removed outright in this app (cancel deletes the doc),
  // but guard defensively against any status values that could linger.
  if (
    booking?.cancelled === true ||
    ["cancelled", "canceled", "void", "deleted"].includes(
      resolvedStatus(booking),
    )
  )
    return false;
  const status = getOperationsStatus(booking, now);
  return status.key === "checked-out" && Boolean(getCheckoutAt(booking));
}

/**
 * Auto-creation boundary for housekeeping reminders. The automatic sweep in
 * Reminders must only create records for checkouts that happen *from now
 * onward* within the active session — historical checkouts (already past
 * before the page mounted) would otherwise be re-recorded as new tasks on
 * every load, flooding the list. Reuses `getCheckoutAt` so the ordering
 * matches every other checkout comparison in the app.
 */
export function isCheckoutAtOrAfter(fromNowAt: Date, booking: any): boolean {
  const checkoutAt = getCheckoutAt(booking);
  return Boolean(checkoutAt) && checkoutAt!.getTime() >= fromNowAt.getTime();
}

function guestNameOf(source: any): string {
  const first = String(source?.guestFirstName || "").trim();
  const last = String(source?.guestLastName || "").trim();
  const fullName = [first, last].filter(Boolean).join(" ");
  return (
    fullName ||
    String(source?.guestName || "").trim() ||
    String(source?.guest || "").trim() ||
    "Guest"
  );
}

/**
 * Decision gate. All conditions must hold:
 *  - staff just completed the checkout reminder,
 *  - the booking actually exists and is past checkout,
 *  - a housekeeping task does not already exist for the booking.
 */
export function shouldCreateHousekeeping({
  reminder,
  booking,
  now = new Date(),
  nowCompleted,
  existing = false,
}: {
  reminder: any;
  booking: any;
  now?: Date;
  nowCompleted: boolean;
  existing?: boolean;
}): boolean {
  if (!nowCompleted) return false;
  if (existing) return false;
  if (!isCheckoutReminder(reminder)) return false;
  return isHousekeepingEligibleBooking(booking, now);
}
/**
 * Builds the full payload for a housekeeping task. Mirrors the reminder
 * document shape conventions (bookingId, unitId, unitName, uid, createdAt).
 */
export function buildHousekeepingTask({
  reminder,
  booking,
  now = new Date(),
  userId,
}: {
  reminder: any;
  booking: any;
  now?: Date;
  userId?: string;
}): any {
  const checkoutAt = getCheckoutAt(booking);
  const dateStr = checkoutDateInput(checkoutAt);
  const unitName =
    String(booking?.unitName || reminder?.unitName || "").trim() ||
    String(booking?.unitId || "").trim() ||
    "Unassigned unit";
  return {
    id: getHousekeepingTaskId(booking.id, dateStr),
    bookingId: booking.id,
    unitId: String(booking?.unitId || reminder?.unitId || "").trim(),
    unitName,
    guestName: guestNameOf(booking) || guestNameOf(reminder),
    title: `Housekeeping Required - ${unitName}`,
    status: HOUSEKEEPING_STATUS_PENDING,
    priority: "high",
    checkoutDate: checkoutAt ? checkoutAt.toISOString() : null,
    checkoutDateLocal: dateStr,
    sourceReminderId: reminder?.id ?? null,
    notes: "Unit requires cleaning after completed checkout.",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    uid: userId ?? null,
  };
}
