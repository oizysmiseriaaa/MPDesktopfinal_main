export type OperationsStatusKey =
  | "upcoming"
  | "checked-in"
  | "due-for-checkout"
  | "checked-out";

export const CHECKOUT_WARNING_MINUTES = 120;

const dateAtTime = (
  dateValue: unknown,
  timeValue: unknown,
  fallback: string,
) => {
  const date = String(dateValue || "").split("T")[0];
  const rawTime = String(timeValue || fallback).trim();
  const twelveHour = rawTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  const time = twelveHour
    ? `${String((Number(twelveHour[1]) % 12) + (twelveHour[3].toUpperCase() === "PM" ? 12 : 0)).padStart(2, "0")}:${twelveHour[2]}:00`
    : rawTime.length === 5
      ? `${rawTime}:00`
      : rawTime;
  const parsed = new Date(`${date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getCheckinAt = (booking: any) =>
  dateAtTime(
    booking?.checkinDate || booking?.checkIn,
    booking?.checkinTime || booking?.checkInTime,
    "14:00",
  );
export const getCheckoutAt = (booking: any) =>
  dateAtTime(
    booking?.checkoutDate || booking?.checkOut,
    booking?.checkoutTime || booking?.checkOutTime,
    "12:00",
  );

export function getOperationsStatus(booking: any, now = new Date()) {
  const checkinAt = getCheckinAt(booking);
  const checkoutAt = getCheckoutAt(booking);
  const nowMs = now.getTime();
  if (!checkinAt || !checkoutAt)
    return {
      key: "upcoming" as const,
      label: "Upcoming",
      color: "#2563eb",
      checkinAt,
      checkoutAt,
    };
  if (nowMs >= checkoutAt.getTime())
    return {
      key: "checked-out" as const,
      label: "Checked Out",
      color: "#94a3b8",
      checkinAt,
      checkoutAt,
    };
  if (nowMs >= checkoutAt.getTime() - CHECKOUT_WARNING_MINUTES * 60_000)
    return {
      key: "due-for-checkout" as const,
      label: "Due for Checkout",
      color: "#f97316",
      checkinAt,
      checkoutAt,
    };
  // Green is reserved for the separate financial "Paid" state in the operations UI.
  if (nowMs >= checkinAt.getTime())
    return {
      key: "checked-in" as const,
      label: "Checked In",
      color: "#7c3aed",
      checkinAt,
      checkoutAt,
    };
  return {
    key: "upcoming" as const,
    label: "Upcoming",
    color: "#2563eb",
    checkinAt,
    checkoutAt,
  };
}

export const formatOperationsDate = (value: Date | null) =>
  value
    ? value.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

export const formatOperationsTime = (value: Date | null) =>
  value
    ? value.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const formatTimeRemaining = (target: Date | null, now = new Date()) => {
  if (!target) return "—";
  const diff = Math.max(0, target.getTime() - now.getTime());
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export function formatRemaining(target: Date | null, now = new Date()) {
  if (!target) return "—";
  const totalMinutes = Math.max(
    0,
    Math.ceil((target.getTime() - now.getTime()) / 60_000),
  );
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [
    days && `${days} Day${days === 1 ? "" : "s"}`,
    hours && `${hours} Hour${hours === 1 ? "" : "s"}`,
    `${minutes} Minute${minutes === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" ");
}
