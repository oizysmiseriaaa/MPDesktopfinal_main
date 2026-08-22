"use client";

import {
  Building2,
  CalendarDays,
  Clock3,
  TimerReset,
  CheckCircle2,
  Circle,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  formatOperationsDate,
  formatOperationsTime,
  formatTimeRemaining,
  getOperationsStatus,
  type OperationsStatusKey,
} from "@/lib/calendar-operations";

const guestName = (booking: any) =>
  `${booking?.guestFirstName || ""} ${booking?.guestLastName || ""}`.trim() ||
  booking?.guestName ||
  "Guest not set";
const unitName = (booking: any, unit: any) =>
  unit?.name || unit?.unitNumber || booking?.unitName || "Unassigned unit";

const timeline: Array<{ key: OperationsStatusKey; label: string }> = [
  { key: "upcoming", label: "Upcoming" },
  { key: "checked-in", label: "Checked In" },
  { key: "due-for-checkout", label: "Due for Checkout" },
  { key: "checked-out", label: "Checked Out" },
];

const stage = (key: OperationsStatusKey) =>
  timeline.findIndex((item) => item.key === key);

export function CalendarBookingPanel({
  booking,
  unit,
  now,
  onOpenBooking,
  onOpenChange,
}: {
  booking: any | null;
  unit: any | null;
  now: Date;
  onOpenBooking: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const status = booking ? getOperationsStatus(booking, now) : null;
  const activeStage = status ? stage(status.key) : -1;
  const target =
    status?.key === "upcoming" ? status.checkinAt : status?.checkoutAt || null;

  return (
    <Sheet open={Boolean(booking)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-[var(--border)] bg-[hsl(var(--bg-surface))] p-0 sm:max-w-md"
      >
        {booking && status && (
          <div className="flex min-h-full flex-col">
            <SheetHeader className="border-b border-[var(--border)] px-6 py-5 pr-12">
              <SheetTitle>Booking Details</SheetTitle>
              <SheetDescription>
                Live operational monitoring. Booking records are not modified
                here.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-6 p-6">
              <div>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
                  style={{
                    backgroundColor: `${status.color}1a`,
                    color: status.color,
                  }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: status.color }}
                  />{" "}
                  {status.label}
                </span>
                <h2 className="mt-3 text-xl font-bold text-[hsl(var(--text-primary))]">
                  {guestName(booking)}
                </h2>
              </div>

              <div className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))]">
                  Booking information
                </p>
                <Info
                  icon={<Building2 />}
                  label="Unit"
                  value={unitName(booking, unit)}
                />
                <Info
                  icon={<CalendarDays />}
                  label="Check-in"
                  value={`${formatOperationsDate(status.checkinAt)} · ${formatOperationsTime(status.checkinAt)}`}
                />
                <Info
                  icon={<CalendarDays />}
                  label="Check-out"
                  value={`${formatOperationsDate(status.checkoutAt)} · ${formatOperationsTime(status.checkoutAt)}`}
                />
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[hsl(var(--bg-primary))] p-4">
                <div className="flex items-center gap-2">
                  <TimerReset className="h-5 w-5 text-[hsl(var(--accent))]" />
                  <p className="font-bold text-[hsl(var(--text-primary))]">
                    Time Remaining
                  </p>
                </div>
                <p className="mt-3 text-2xl font-bold text-[hsl(var(--text-primary))]">
                  {formatTimeRemaining(target, now)}
                </p>
                <p className="mt-1 text-sm text-[hsl(var(--text-secondary))]">
                  {status.key === "checked-out"
                    ? "Checkout completed — ready for housekeeping."
                    : status.key === "upcoming"
                      ? "until check-in"
                      : "until checkout"}
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))]">
                  Status Timeline
                </p>
                {timeline.map((item, index) => {
                  const complete = index <= activeStage;
                  const current = index === activeStage;
                  return (
                    <div key={item.key} className="flex items-center gap-3">
                      <div className="relative">
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-full"
                          style={{
                            backgroundColor: complete
                              ? `${status.color}1a`
                              : "transparent",
                            color: complete ? status.color : "#94a3b8",
                          }}
                        >
                          {complete ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : (
                            <Circle className="h-4 w-4" />
                          )}
                        </span>
                        {index < timeline.length - 1 && (
                          <span className="absolute left-3 top-6 h-5 border-l border-[var(--border)]" />
                        )}
                      </div>
                      <span
                        className={
                          current
                            ? "font-bold text-[hsl(var(--text-primary))]"
                            : "text-sm text-[hsl(var(--text-secondary))]"
                        }
                      >
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-auto border-t border-[var(--border)] p-5">
              <Button
                className="w-full gradient-btn text-white"
                onClick={onOpenBooking}
              >
                <ArrowUpRight className="mr-2 h-4 w-4" /> View Booking
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[20px_1fr] gap-2">
      <span className="text-[hsl(var(--text-secondary))] [&>svg]:h-4 [&>svg]:w-4">
        {icon}
      </span>
      <div>
        <p className="text-xs font-semibold text-[hsl(var(--text-secondary))]">
          {label}
        </p>
        <p className="text-sm font-medium text-[hsl(var(--text-primary))]">
          {value}
        </p>
      </div>
    </div>
  );
}
