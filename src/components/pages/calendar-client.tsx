"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useUser, useAuth } from "@/firebase";
import { useAppResources } from "@/lib/app-data-store";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CalendarPlus,
  Clipboard,
  ImageDown,
  Trash2,
  X,
  CalendarDays,
  CalendarRange,
  Building2,
  ChevronDown,
  CircleDot,
  Circle,
  CheckCircle2,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  TimerReset,
  UserRound,
} from "lucide-react";
import { useDateStore } from "@/lib/date-store";
import { useDialogCleanup } from "@/hooks/use-dialog-cleanup";
import { cn } from "@/lib/utils";
import { todayLocalDateInput, parseLocalDateInput } from "@/lib/utils-app";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import html2canvas from "html2canvas";
import { AddBookingDialog } from "./add-booking-dialog";
import { BookingDetailsDialog } from "./booking-details-dialog";
import {
  getOperationsStatus,
  formatOperationsDate,
  formatOperationsTime,
  formatTimeRemaining,
} from "@/lib/calendar-operations";
import { getHousekeepingTaskId } from "@/lib/housekeeping";
import { createBookingPdf, type BookingDocumentType } from "@/lib/booking-pdf";
import { useUserRole } from "@/hooks/use-user-role";
import { canManageOperations } from "@/auth/roles";
import {
  deduplicateCalendarBookingsByDate,
  getCalendarBookingIdentity,
  getOccupiedCalendarDates,
  normalizeCalendarDate,
} from "@/lib/calendar-booking-occupancy";
import { summarizeBookingBatchResults } from "@/lib/booking-batch";
import {
  BOOKING_SOURCE_LEGEND,
  getBookingSourceLabel,
  type BookingSourceLabel,
} from "@/lib/booking-source";

const unitColors = [
  "#2563EB",
  "#7C3AED",
  "#0F766E",
  "#F97316",
  "#DB2777",
  "#059669",
  "#0891B2",
  "#D97706",
  "#4F46E5",
  "#16A34A",
  "#EA580C",
  "#E11D48",
  "#0EA5E9",
  "#65A30D",
  "#9333EA",
  "#0369A1",
  "#0F766E",
  "#C2410C",
];

const bookingLabelStyles = BOOKING_SOURCE_LEGEND;
type BookingLabel = BookingSourceLabel;
const getBookingLabel = getBookingSourceLabel;

// Darken a hex color so unit-colored bars stay prominent with white text
// while keeping the unit's identity color.
const darkenHexColor = (hex: string, amount = 0.12) => {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(
    String(hex || "").trim(),
  );
  if (!match) return hex;
  const adjust = (channel: string) =>
    Math.max(0, Math.min(255, Math.round(parseInt(channel, 16) * (1 - amount))))
      .toString(16)
      .padStart(2, "0");
  return `#${adjust(match[1])}${adjust(match[2])}${adjust(match[3])}`;
};

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Unable to encode the booking image."));
        return;
      }
      try {
        resolve(new Uint8Array(await blob.arrayBuffer()));
      } catch (error) {
        reject(error);
      }
    }, "image/png");
  });
}

type CalendarCell = {
  unitId: string;
  unitIndex: number;
  date: string;
  dayIndex: number;
};

type UnitDateRange = {
  unit: any;
  checkinDate: string;
  checkoutDate: string;
  nights: number;
};

type BookingDraft = {
  guestFirstName: string;
  guestLastName: string;
  guestPhone: string;
  guestEmail: string;
  agentId: string;
  agentName: string;
  bookingSource: string;
  bookingLabel: string;
  bookingDate: string;
  adults: number;
  children: number;
  paymentStatus: string;
  bookingPaymentStatus: string;
  notes: string;
  totalAmount: number | string;
  isCustomAmount: boolean;
  bookingPayment: {
    amount: number | string;
    paidAt: string;
    method: string;
    reference: string;
    notes: string;
    status: string;
    paymentStatus: string;
  };
  securityDepositStatus: string;
  securityDeposit: {
    amount: number | string;
    status: string;
  };
  securityDepositReceipt: {
    amount: number | string;
    paidAt: string;
    method: string;
    reference: string;
    notes: string;
    status: string;
    refundAmount: number | string;
    refundPaidAt: string;
    refundMethod: string;
    refundReference: string;
    refundNotes: string;
  };
};

const toDateInput = (value?: string) => {
  if (!value) return "";
  return String(value).split("T")[0];
};

const normalizedCalendarValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

// These were produced by an earlier Sheet parser from rate-only cells. They
// are not reservations: their generated guest is the unit label itself.
// Keep the documents intact for auditability, but do not let non-reservation
// artifacts participate in calendar availability or bar rendering.
const isRateOnlySheetPlaceholder = (booking: any) => {
  const id = String(booking?.id || booking?.bookingId || "");
  if (!id.startsWith("sheet-booking-")) return false;
  const guest = normalizedCalendarValue(
    [booking?.guestFirstName, booking?.guestLastName]
      .filter(Boolean)
      .join(" ") || booking?.guestName,
  );
  const unit = normalizedCalendarValue(booking?.unitName);
  return Boolean(
    guest && unit && guest === unit && !booking?.notes && !booking?.sourceRow,
  );
};

const padDatePart = (value: number) => String(value).padStart(2, "0");

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0);

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const addMonths = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
};

const subMonths = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() - amount);
  return next;
};

const eachDayOfInterval = ({ start, end }: { start: Date; end: Date }) => {
  const days: Date[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
};

const format = (date: Date, pattern: string) => {
  if (pattern === "yyyy-MM-dd") {
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
  }

  if (pattern === "MMM d") {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  if (pattern === "EEE") {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }

  if (pattern === "EEEE") {
    return date.toLocaleDateString("en-US", { weekday: "long" });
  }

  if (pattern === "MMMM yyyy") {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  return date.toLocaleDateString("en-US");
};

const isSameDay = (left: Date, right: Date) => {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
};

const todayDateInput = todayLocalDateInput;

// One-time temporary block for the specific August 29 occurrence.
// All units are blocked except the listed exceptions. This is visual/availability
// only and never touches Firestore data, recurring availability, or other dates.
const AUG29_BLOCK_DATE = "2026-08-29";
const AUG29_BLOCK_EXCEPTIONS = ["shore 3", "447"];
const isAug29ExceptionUnit = (unit: any) => {
  // Match against every stable identity available on the unit, rather than its
  // rendered row position (or a single preferred label).
  return toComparableUnitValues(unit).some((value) =>
    AUG29_BLOCK_EXCEPTIONS.includes(value),
  );
};
const isAug29BlockedCell = (unit: any, dateStr: string) =>
  dateStr === AUG29_BLOCK_DATE && !isAug29ExceptionUnit(unit);

// One-time all-unit closure. Date-string comparisons are deliberate: calendar
// dates are stored and selected as YYYY-MM-DD values, avoiding timezone drift.
const WINTER_BLOCK_START_DATE = "2026-12-01";
const WINTER_BLOCK_END_DATE = "2027-01-31";
const isWinterClosureDate = (dateStr: string) =>
  dateStr >= WINTER_BLOCK_START_DATE && dateStr <= WINTER_BLOCK_END_DATE;
const isCalendarBlockedCell = (unit: any, dateStr: string) =>
  isAug29BlockedCell(unit, dateStr) || isWinterClosureDate(dateStr);

const toNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatCurrency = (value: any) =>
  `₱${toNumber(value, 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function removeUndefinedDeep(value: any): any {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedDeep);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, removeUndefinedDeep(entryValue)]),
    );
  }
  return value;
}

const displayGuestName = (booking: any) => {
  const explicitGuestName = String(booking?.guestName || "").trim();
  const fullName =
    `${booking?.guestFirstName || ""} ${booking?.guestLastName || ""}`.trim();
  return explicitGuestName || fullName || "Guest not set";
};

const getUnitLabel = (unit: any) =>
  unit?.name || unit?.unitNumber || unit?.unitName || "Unnamed unit";

const toComparableUnitValues = (unit: any) =>
  [unit?.id, unit?.unitNumber, unit?.name]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

const makeDefaultBookingDraft = (): BookingDraft => {
  const today = todayDateInput();
  return {
    guestFirstName: "",
    guestLastName: "",
    guestPhone: "",
    guestEmail: "",
    agentId: "",
    agentName: "",
    bookingSource: "N/A",
    bookingLabel: "N/A",
    bookingDate: today,
    adults: 2,
    children: 0,
    paymentStatus: "Unpaid",
    bookingPaymentStatus: "Unpaid",
    notes: "",
    totalAmount: 0,
    isCustomAmount: false,
    bookingPayment: {
      amount: 0,
      paidAt: today,
      method: "CASH",
      reference: "",
      notes: "",
      status: "Unpaid",
      paymentStatus: "Unpaid",
    },
    securityDepositStatus: "Unpaid",
    securityDeposit: {
      amount: 1000,
      status: "Unpaid",
    },
    securityDepositReceipt: {
      amount: 0,
      paidAt: today,
      method: "CASH",
      reference: "",
      notes: "",
      status: "Unpaid",
      refundAmount: 0,
      refundPaidAt: today,
      refundMethod: "CASH",
      refundReference: "",
      refundNotes: "",
    },
  };
};

export default function CalendarClient() {
  const { user } = useUser();
  const { role } = useUserRole();
  const auth = useAuth();
  const { toast } = useToast();
  const { month, year, setMonth, setYear } = useDateStore();

  const calendarResources = useAppResources([
    "bookings",
    "units",
    "agents",
    "expenses",
  ]);
  const remindersResources = useAppResources(["reminders"]);
  const bookings = calendarResources.data["bookings"] ?? [];
  const calendarBookings = useMemo(() => {
    const seen = new Set<string>();
    return (bookings as any[]).filter((booking) => {
      if (isRateOnlySheetPlaceholder(booking)) return false;
      const key = getCalendarBookingIdentity(booking);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [bookings]);
  const units = calendarResources.data["units"] ?? [];
  const agents = calendarResources.data["agents"] ?? [];
  const loading = calendarResources.loading;
  const error = calendarResources.error;

  const [dragAnchor, setDragAnchor] = useState<CalendarCell | null>(null);
  const [dragTarget, setDragTarget] = useState<CalendarCell | null>(null);
  const [selection, setSelection] = useState<CalendarCell[]>([]);
  const [dragSelection, setDragSelection] = useState<CalendarCell[]>([]);
  const [dragAction, setDragAction] = useState<"add" | "remove">("add");
  const [blockedDuringSelection, setBlockedDuringSelection] = useState(0);
  const [detailsBooking, setDetailsBooking] = useState<any | null>(null);
  const [operationsBooking, setOperationsBooking] = useState<any | null>(null);
  const [selectedBookings, setSelectedBookings] = useState<Set<string>>(
    () => new Set(),
  );
  const [systemNow, setSystemNow] = useState(() => new Date());
  const [clockNow, setClockNow] = useState(() => new Date());
  const [documentLoading, setDocumentLoading] =
    useState<BookingDocumentType | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageSaving, setImageSaving] = useState(false);
  const [bookingDraft, setBookingDraft] = useState<BookingDraft>(() =>
    makeDefaultBookingDraft(),
  );
  const [, startDraftTransition] = useTransition();
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [isDesktopHover, setIsDesktopHover] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isUnitLegendOpen, setIsUnitLegendOpen] = useState(false);
  const [calendarZoom, setCalendarZoom] = useState(1);
  const [isOffGrid, setIsOffGrid] = useState(false);
  const [isInquiryMode, setIsInquiryMode] = useState(false);
  const [inquiryStartDate, setInquiryStartDate] = useState<string | null>(null);
  const [inquiryEndDate, setInquiryEndDate] = useState<string | null>(null);
  const [inquirySearchRan, setInquirySearchRan] = useState(false);
  const [inquiryBookingRange, setInquiryBookingRange] =
    useState<UnitDateRange | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );
  const pageScrollPositionRef = useRef(0);
  const notificationKeysRef = useRef(new Set<string>());
  const reminderCreatedKeysRef = useRef(new Set<string>());
  const lastHousekeepingCheckRef = useRef<number>(0);
  const HOUSEKEEPING_CHECK_INTERVAL_MS = 60_000;

  useEffect(() => {
    const updateTime = () => setSystemNow(new Date());
    const interval = window.setInterval(updateTime, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;

    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const updateState = () => setIsDesktopHover(mediaQuery.matches);

    updateState();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateState);
      return () => mediaQuery.removeEventListener("change", updateState);
    }

    mediaQuery.addListener(updateState);
    return () => mediaQuery.removeListener(updateState);
  }, []);

  useEffect(() => {
    if (!isFullScreen) return;
    pageScrollPositionRef.current = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.setAttribute("data-fullscreen-calendar", "true");
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.removeAttribute("data-fullscreen-calendar");
      window.scrollTo({
        top: pageScrollPositionRef.current,
        behavior: "instant" as ScrollBehavior,
      });
    };
  }, [isFullScreen]);

  // Clear booking selections when clicking outside the calendar card
  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      const card = document.getElementById("calendar-card");
      if (!card) return;
      const target = ev.target as Node | null;
      if (!target) return;
      if (!card.contains(target)) {
        setSelectedBookings(new Set());
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  useEffect(() => {
    if (!isFullScreen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") exitFullScreen();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isFullScreen]);

  const areCellsEqual = useCallback(
    (left: CalendarCell[], right: CalendarCell[]) => {
      if (left.length !== right.length) return false;
      return left.every(
        (cell, index) => cellKey(cell) === cellKey(right[index]),
      );
    },
    [],
  );

  const clearSelection = useCallback(() => {
    setSelection([]);
    setDragSelection([]);
    setBlockedDuringSelection(0);
    setDragAnchor(null);
    setDragTarget(null);
    setDragAction("add");
    setInquiryBookingRange(null);
  }, []);

  const clearInquiryRange = useCallback(() => {
    setInquiryStartDate(null);
    setInquiryEndDate(null);
    setInquirySearchRan(false);
  }, []);

  const handleUnitFilter = useCallback(
    (value: string) => {
      if (value === unitFilter) return;
      setUnitFilter(value);
      clearSelection();
    },
    [clearSelection, unitFilter],
  );

  const exitFullScreen = () => {
    setIsFullScreen(false);
    setIsUnitLegendOpen(false);
  };

  const displayUnits = useMemo(() => {
    const resolvedUnits =
      (unitFilter === "all"
        ? (units as any[])
        : (units as any[]).filter((unit) => String(unit.id) === unitFilter)) ||
      [];
    return [...resolvedUnits].sort((left, right) => {
      const leftLabel = String(
        left?.unitNumber || left?.name || left?.id || "",
      );
      const rightLabel = String(
        right?.unitNumber || right?.name || right?.id || "",
      );
      return leftLabel.localeCompare(rightLabel);
    });
  }, [units, unitFilter]);

  const handleToday = useCallback(() => {
    const now = new Date();
    setMonth(now.getMonth());
    setYear(now.getFullYear());
    if (!isInquiryMode) clearSelection();

    requestAnimationFrame(() => {
      const target = document.querySelector(
        `[data-calendar-day="${format(now, "yyyy-MM-dd")}"]`,
      ) as HTMLElement | null;
      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        });
      }
    });
  }, [clearSelection, isInquiryMode, setMonth, setYear]);

  useDialogCleanup(isAddDialogOpen || !!detailsBooking);

  const calendarSnapshotRef = useRef<HTMLDivElement | null>(null);
  const detailsSnapshotRef = useRef<HTMLDivElement | null>(null);
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);

  const viewDate = useMemo(() => new Date(year, month, 1), [month, year]);

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    return eachDayOfInterval({ start, end });
  }, [viewDate]);

  const zoomScale = Math.max(0.5, Math.min(2.0, calendarZoom));
  const baseDayWidth = isFullScreen
    ? Math.max(
        72,
        Math.min(
          140,
          Math.floor((viewportWidth - 160) / Math.max(daysInMonth.length, 1)),
        ),
      )
    : 64;
  const computedDayWidth = Math.round(baseDayWidth * zoomScale);
  const compactBase = 40;
  const computedCellHeight = Math.max(
    compactBase,
    Math.round(compactBase * zoomScale),
  );
  const computedHeaderHeight = Math.max(
    compactBase,
    Math.round(compactBase * zoomScale),
  );
  const computedUnitRowHeight = Math.max(
    compactBase,
    Math.round(compactBase * zoomScale),
  );
  const fullScreenCardPadding = zoomScale < 0.85 ? 8 : 10;
  const fullScreenFontSize = zoomScale < 0.85 ? 10 : 11;
  const fullScreenCompactTextSize = zoomScale < 0.85 ? 8 : 9;
  const dayStyle = {
    width: `${computedDayWidth}px`,
    minWidth: `${computedDayWidth}px`,
    height: `${computedCellHeight}px`,
  };

  const unitColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const sortedUnits = [...(units as any[])].sort((left, right) => {
      const leftLabel = String(
        left?.unitNumber || left?.name || left?.id || "",
      );
      const rightLabel = String(
        right?.unitNumber || right?.name || right?.id || "",
      );
      return leftLabel.localeCompare(rightLabel);
    });

    sortedUnits.forEach((unit, index) => {
      const fallbackColor = `hsl(${(index * 67) % 360} 68% 50%)`;
      map.set(
        String(unit.id),
        unitColors[index % unitColors.length] || fallbackColor,
      );
    });

    return map;
  }, [units]);

  const cellKey = (cell: Pick<CalendarCell, "unitId" | "date">) =>
    `${cell.unitId}__${cell.date}`;

  const findBookingForCell = (unit: any, dateObj: Date) => {
    const unitId = String(unit?.id || "");
    const date = format(dateObj, "yyyy-MM-dd");
    return calendarBookingByCell.get(`${unitId}__${date}`) || null;
  };

  const isCellAvailable = (unit: any, dateObj: Date) => {
    if (isCalendarBlockedCell(unit, format(dateObj, "yyyy-MM-dd")))
      return false;
    return !findBookingForCell(unit, dateObj);
  };

  const buildCellsBetween = (start: CalendarCell, end: CalendarCell) => {
    const minUnitIndex = Math.min(start.unitIndex, end.unitIndex);
    const maxUnitIndex = Math.max(start.unitIndex, end.unitIndex);
    const minDayIndex = Math.min(start.dayIndex, end.dayIndex);
    const maxDayIndex = Math.max(start.dayIndex, end.dayIndex);
    const availableCells: CalendarCell[] = [];
    let blockedCells = 0;

    for (
      let unitIndex = minUnitIndex;
      unitIndex <= maxUnitIndex;
      unitIndex += 1
    ) {
      const unit = displayUnits[unitIndex];
      if (!unit) continue;

      for (let dayIndex = minDayIndex; dayIndex <= maxDayIndex; dayIndex += 1) {
        const day = daysInMonth[dayIndex];
        if (!day) continue;

        const dateStr = format(day, "yyyy-MM-dd");
        const nextCell = {
          unitId: String(unit.id),
          unitIndex,
          date: dateStr,
          dayIndex,
        };

        if (isCellAvailable(unit, day)) {
          availableCells.push(nextCell);
        } else {
          blockedCells += 1;
        }
      }
    }

    return { availableCells, blockedCells };
  };

  const selectedCellKeys = useMemo(
    () => new Set(selection.map(cellKey)),
    [selection],
  );

  const inquiryRangeDates = useMemo(() => {
    if (!inquiryStartDate) return [];
    const start = new Date(`${inquiryStartDate}T00:00:00`);
    const end = new Date(`${inquiryEndDate || inquiryStartDate}T00:00:00`);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    )
      return [];
    // Checkout is not an occupied night. A 29 Aug → 2 Sep inquiry is four
    // nights (29–31 Aug and 1 Sep), while the checkout date stays visible in
    // the picker and is never treated as a booking conflict.
    const lastNight = inquiryEndDate ? addDays(end, -1) : start;
    return eachDayOfInterval({ start, end: lastNight }).map((day) =>
      format(day, "yyyy-MM-dd"),
    );
  }, [inquiryStartDate, inquiryEndDate]);
  const inquiryRangeDateSet = useMemo(
    () => new Set(inquiryRangeDates),
    [inquiryRangeDates],
  );
  const dragCellKeys = useMemo(
    () => new Set(dragSelection.map(cellKey)),
    [dragSelection],
  );

  const previewSelectedCellKeys = useMemo(() => {
    const preview = new Set(selectedCellKeys);
    dragSelection.forEach((cell) => {
      const key = cellKey(cell);
      if (dragAction === "remove") preview.delete(key);
      else preview.add(key);
    });
    return preview;
  }, [selectedCellKeys, dragSelection, dragAction]);

  const buildSelectedRanges = useCallback(
    (cells: CalendarCell[]) => {
      const byUnit = new Map<string, CalendarCell[]>();
      cells.forEach((cell) => {
        const current = byUnit.get(cell.unitId) || [];
        current.push(cell);
        byUnit.set(cell.unitId, current);
      });

      const ranges: UnitDateRange[] = [];
      Array.from(byUnit.entries()).forEach(([unitId, groupedCells]) => {
        const sorted = [...groupedCells].sort((a, b) => {
          if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
          return a.date.localeCompare(b.date);
        });
        const unit = (units as any[]).find(
          (item) => String(item.id) === unitId,
        );
        if (!unit || sorted.length === 0) return;

        let currentGroup: CalendarCell[] = [];
        sorted.forEach((cell) => {
          const previous = currentGroup[currentGroup.length - 1];
          if (!previous || cell.dayIndex === previous.dayIndex + 1) {
            currentGroup.push(cell);
            return;
          }
          const firstDate = currentGroup[0].date;
          const lastDate = currentGroup[currentGroup.length - 1].date;
          ranges.push({
            unit,
            checkinDate: firstDate,
            checkoutDate: format(
              addDays(new Date(`${lastDate}T00:00:00`), 1),
              "yyyy-MM-dd",
            ),
            nights: currentGroup.length,
          });
          currentGroup = [cell];
        });

        if (currentGroup.length > 0) {
          const firstDate = currentGroup[0].date;
          const lastDate = currentGroup[currentGroup.length - 1].date;
          ranges.push({
            unit,
            checkinDate: firstDate,
            checkoutDate: format(
              addDays(new Date(`${lastDate}T00:00:00`), 1),
              "yyyy-MM-dd",
            ),
            nights: currentGroup.length,
          });
        }
      });

      return ranges;
    },
    [units],
  );

  const selectedRanges = useMemo<UnitDateRange[]>(() => {
    return inquiryBookingRange
      ? [inquiryBookingRange]
      : buildSelectedRanges(selection);
  }, [buildSelectedRanges, inquiryBookingRange, selection]);

  const getAgentLabel = (agent: any) =>
    agent?.name || agent?.fullName || agent?.agentName || "Unnamed Agent";

  const findUnitForBooking = (unitIdOrName?: string) => {
    const target = String(unitIdOrName || "")
      .trim()
      .toLowerCase();
    if (!target) return null;
    return (
      (units as any[]).find((unit) =>
        toComparableUnitValues(unit).includes(target),
      ) || null
    );
  };

  const getBookingUnit = (booking: any) =>
    findUnitForBooking(
      booking?.unitId ||
        booking?.unit_id ||
        booking?.unitName ||
        booking?.unitname,
    );

  const calendarBookingByCell = useMemo(
    () =>
      deduplicateCalendarBookingsByDate(calendarBookings as any[], (booking) =>
        String(getBookingUnit(booking)?.id || ""),
      ),
    [calendarBookings, units],
  );

  // Inquiry mode: reuse existing availability/occupancy logic to summarize which
  // units are available vs occupied for the selected date range. No bookings are
  // created and no records are modified.
  const inquiryResults = useMemo(() => {
    if (!inquirySearchRan || inquiryRangeDates.length === 0) return null;
    const byUnit = new Map<
      string,
      { unit: any; total: number; booked: number; blocked: number }
    >();
    for (const unit of displayUnits) {
      const unitId = String(unit.id);
      const entry = {
        unit,
        total: inquiryRangeDates.length,
        booked: 0,
        blocked: 0,
      };
      for (const date of inquiryRangeDates) {
        if (isCalendarBlockedCell(unit, date)) entry.blocked += 1;
        else if (calendarBookingByCell.has(`${unitId}__${date}`))
          entry.booked += 1;
      }
      byUnit.set(unitId, entry);
    }
    const rows = Array.from(byUnit.values()).map((entry) => ({
      unit: entry.unit,
      total: entry.total,
      booked: entry.booked,
      blocked: entry.blocked,
      available: entry.booked === 0 && entry.blocked === 0,
    }));
    const availableCount = rows.filter((row) => row.available).length;
    const occupiedCount = rows.filter((row) => row.booked > 0).length;
    const blockedCount = rows.filter((row) => row.blocked > 0).length;
    return { rows, availableCount, occupiedCount, blockedCount };
  }, [
    inquirySearchRan,
    inquiryRangeDates,
    displayUnits,
    calendarBookingByCell,
  ]);

  const getBookingGuestName = (booking: any) => {
    const explicitGuestName = String(booking?.guestName || "").trim();
    const fullName =
      `${booking?.guestFirstName || ""} ${booking?.guestLastName || ""}`.trim();
    return explicitGuestName || fullName || "Valued Guest";
  };

  const getBookingUnitName = (booking: any) => {
    const unit = getBookingUnit(booking);
    return unit?.name || booking?.unitName || booking?.unitname || "Unassigned";
  };

  const getBookingDateValue = (booking: any) =>
    toDateInput(booking?.bookingDate) ||
    toDateInput(booking?.createdAt) ||
    todayDateInput();

  const getRangeAutoAmount = (
    range: UnitDateRange,
    draft: BookingDraft = bookingDraft,
  ) => {
    const adults = toNumber(draft.adults, 2);
    const children = toNumber(draft.children, 0);
    const baseOccupancy = toNumber(
      range.unit?.capacity ?? range.unit?.baseOccupancy,
      0,
    );
    const extraGuests = Math.max(0, adults + children - baseOccupancy);
    const nightlyRate = toNumber(range.unit?.rate, 0);
    const extraGuestFee = toNumber(range.unit?.extraGuestFee, 0);
    return Math.max(
      0,
      range.nights * (nightlyRate + extraGuests * extraGuestFee),
    );
  };

  const getDetailsTotalNights = () => {
    const checkin = detailsBooking?.checkinDate
      ? new Date(detailsBooking.checkinDate)
      : null;
    const checkout = detailsBooking?.checkoutDate
      ? new Date(detailsBooking.checkoutDate)
      : null;
    if (
      !checkin ||
      !checkout ||
      Number.isNaN(checkin.getTime()) ||
      Number.isNaN(checkout.getTime())
    )
      return 0;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.max(
      0,
      Math.round((checkout.getTime() - checkin.getTime()) / oneDay),
    );
  };

  const getDetailsAutoAmount = () => {
    if (!detailsBooking) return 0;
    const unit = getBookingUnit(detailsBooking);
    if (!unit) return toNumber(detailsBooking?.totalAmount);
    const adults = toNumber(detailsBooking?.adults, 2);
    const children = toNumber(detailsBooking?.children, 0);
    const baseOccupancy = toNumber(unit?.capacity ?? unit?.baseOccupancy, 0);
    const extraGuests = Math.max(0, adults + children - baseOccupancy);
    const nightlyRate = toNumber(unit?.rate, 0);
    const extraGuestFee = toNumber(unit?.extraGuestFee, 0);
    return Math.max(
      0,
      getDetailsTotalNights() * (nightlyRate + extraGuests * extraGuestFee),
    );
  };

  const setDetailsNested = (path: string, value: any) => {
    setDetailsBooking((prev: any) => {
      if (!prev) return prev;
      const [parent, child] = path.split(".");
      return {
        ...prev,
        [parent]: {
          ...(prev[parent] || {}),
          [child]: value,
        },
      };
    });
  };

  const setDraftNested = (path: string, value: any) => {
    startDraftTransition(() => {
      setBookingDraft((prev: any) => {
        const [parent, child] = path.split(".");
        return {
          ...prev,
          [parent]: {
            ...(prev[parent] || {}),
            [child]: value,
          },
        };
      });
    });
  };

  const getPillStatus = (booking: any) =>
    getOperationsStatus(booking, systemNow);

  const getPaymentStatus = (booking: any) => {
    const status = String(
      booking?.paymentStatus ||
        booking?.bookingPaymentStatus ||
        booking?.bookingPayment?.status ||
        "Unpaid",
    )
      .trim()
      .toLowerCase();

    if (status === "paid" || status.includes("paid")) {
      return { label: "Paid", color: "#16a34a", key: "paid" as const };
    }
    if (status.includes("partial")) {
      return { label: "Partial", color: "#3b82f6", key: "partial" as const };
    }
    if (status.includes("refund") || status.includes("refunded")) {
      return { label: "Refunded", color: "#111827", key: "refunded" as const };
    }
    if (status.includes("received") || status.includes("deposit")) {
      return { label: "Received", color: "#f59e0b", key: "received" as const };
    }

    return { label: "Unpaid", color: "#dc2626", key: "unpaid" as const };
  };

  const operationsSummary = useMemo(() => {
    const counts = {
      upcoming: 0,
      "checked-in": 0,
      "due-for-checkout": 0,
      "checked-out": 0,
    };
    (calendarBookings as any[]).forEach((booking) => {
      counts[getOperationsStatus(booking, systemNow).key] += 1;
    });
    return counts;
  }, [calendarBookings, systemNow]);

  const housekeepingReadyCount = useMemo(() => {
    return (calendarBookings as any[]).filter((booking) => {
      const status = getOperationsStatus(booking, systemNow);
      if (status.key !== "checked-out") return false;
      if (!status.checkoutAt) return false;
      return isSameDay(status.checkoutAt, systemNow);
    }).length;
  }, [calendarBookings, systemNow]);

  useEffect(() => {
    const deliverNotifications = async () => {
      try {
        const { isPermissionGranted, requestPermission, sendNotification } =
          await import("@tauri-apps/plugin-notification");
        let permission = await isPermissionGranted();
        if (!permission) permission = (await requestPermission()) === "granted";
        if (!permission) return;
        (calendarBookings as any[]).forEach((booking) => {
          const status = getOperationsStatus(booking, systemNow);
          const unit = getBookingUnitName(booking);
          const guest = getBookingGuestName(booking);
          const target =
            status.key === "upcoming" ? status.checkinAt : status.checkoutAt;
          const minutes = target
            ? Math.round((target.getTime() - systemNow.getTime()) / 60_000)
            : null;
          const notification =
            status.key === "upcoming" &&
            minutes !== null &&
            minutes >= 29 &&
            minutes <= 31
              ? {
                  event: "checkin",
                  title: "Upcoming Check-in",
                  body: `${guest}\nUnit ${unit}\nCheck-in in ${Math.max(0, minutes)} minutes.`,
                }
              : status.key === "due-for-checkout" &&
                  minutes !== null &&
                  minutes >= 119 &&
                  minutes <= 121
                ? {
                    event: "checkout",
                    title: "Checkout Reminder",
                    body: `${guest}\nUnit ${unit}\nCheckout in ${Math.max(0, minutes)} minutes.`,
                  }
                : status.key === "checked-out" &&
                    minutes !== null &&
                    minutes >= -1 &&
                    minutes <= 1
                  ? {
                      event: "ready",
                      title: "Room Ready",
                      body: `Unit ${unit}\nGuest has checked out. Ready for housekeeping.`,
                    }
                  : null;
          if (!notification) return;
          const key = `${booking.id || guest}:${notification.event}:${target?.toISOString() || ""}`;
          if (notificationKeysRef.current.has(key)) return;
          notificationKeysRef.current.add(key);
          sendNotification({
            title: notification.title,
            body: notification.body,
          });
        });
      } catch {
        // The web build has no native notification bridge; Calendar remains fully functional there.
      }
    };
    void deliverNotifications();
  }, [calendarBookings, systemNow]);

  useEffect(() => {
    // Auto-create housekeeping reminders when checkout is within 5 minutes
    if (!user) return;
    const now = Date.now();
    if (now - lastHousekeepingCheckRef.current < HOUSEKEEPING_CHECK_INTERVAL_MS)
      return;
    lastHousekeepingCheckRef.current = now;
    (async () => {
      for (const booking of calendarBookings as any[]) {
        try {
          const status = getOperationsStatus(booking, clockNow);
          const checkoutAt = status?.checkoutAt || null;
          if (!checkoutAt) continue;
          // only today's checkouts
          if (!isSameDay(checkoutAt, clockNow)) continue;
          const diffMs = checkoutAt.getTime() - clockNow.getTime();
          if (diffMs < 0 || diffMs > 5 * 60 * 1000) continue;

          // Deterministic reminder id for this booking + checkout date. The
          // server create is create-only (ref.create), so re-running this on a
          // page refresh inside the 5-minute window is idempotent and cannot
          // add a duplicate reminder document.
          const dateStr = parseLocalDateInput(checkoutAt);
          const bookingId = String(booking.id || booking.bookingId || "");
          const reminderId = getHousekeepingTaskId(bookingId, dateStr);

          const key = `${bookingId}:housekeeping:${dateStr}`;
          if (reminderCreatedKeysRef.current.has(key)) continue;
          reminderCreatedKeysRef.current.add(key);

          const unitName = getBookingUnitName(booking);
          const guest = displayGuestName(booking);
          const payload = {
            id: reminderId,
            title: `Housekeeping Reminder - ${unitName}`,
            description: `${guest}\nCheckout at ${formatOperationsTime(checkoutAt)}\nCheckout in less than 5 minutes. Prepare room cleaning.`,
            priority: "high",
            dueDate: dateStr,
            completed: false,
            createdAt: new Date().toISOString(),
            uid: user?.uid,
          } as any;

          try {
            await apiClient.post("/reminder", payload, auth);
            // refresh reminders so Dashboard sees it immediately
            try {
              await remindersResources.refresh();
            } catch {}
          } catch (e) {
            // ignore individual reminder failures
          }
        } catch (e) {
          // ignore per-booking errors
        }
      }
    })();
  }, [calendarBookings, clockNow, user]);

  const hasCalendarDraftGuestName = () => {
    const draft = bookingDraft as any;
    return Boolean(
      String(draft.guestName || "").trim() ||
      String(draft.guestFirstName || "").trim() ||
      String(draft.guestLastName || "").trim(),
    );
  };

  const canGenerateCalendarArtifacts = () =>
    selectedRanges.length > 0 && hasCalendarDraftGuestName();

  const formatBookingCardDate = (value: string | undefined) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return toDateInput(value) || "-";
    return parsed.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getBookingBarsForUnit = useCallback(
    (unit: any, offGrid: boolean) => {
      const unitId = String(unit?.id || "");
      const segments = new Map<string, { booking: any; dates: string[] }>();
      const monthStart = startOfMonth(viewDate);
      const monthEnd = endOfMonth(viewDate);

      for (const booking of calendarBookings as any[]) {
        const ownedDates = getOccupiedCalendarDates(booking).filter(
          (date) => calendarBookingByCell.get(`${unitId}__${date}`) === booking,
        );
        if (ownedDates.length === 0) continue;

        const identity = getCalendarBookingIdentity(booking);
        const existing = segments.get(identity);
        if (existing) {
          existing.dates.push(...ownedDates);
        } else {
          segments.set(identity, { booking, dates: ownedDates });
        }
      }

      return Array.from(segments.values()).flatMap(({ booking, dates }) => {
        const sortedDates = dates.sort();
        const ranges: string[][] = [];
        for (const date of sortedDates) {
          const current = ranges[ranges.length - 1];
          const previous = current?.[current.length - 1];
          const nextDate = previous
            ? format(addDays(new Date(`${previous}T00:00:00`), 1), "yyyy-MM-dd")
            : "";
          if (current && nextDate === date) current.push(date);
          else ranges.push([date]);
        }

        return ranges.flatMap((range) => {
          const rawStart = new Date(`${range[0]}T00:00:00`);
          const rawEnd = new Date(`${range[range.length - 1]}T00:00:00`);

          // Skip ranges that are entirely outside the visible month.
          if (rawEnd.getTime() < monthStart.getTime()) return [];
          if (rawStart.getTime() > monthEnd.getTime()) return [];

          // Clip ranges that extend before/after the visible month so
          // multi-month (long-term) bookings still render on-screen.
          const clippedStart = rawStart.getTime() < monthStart.getTime();
          const clippedEnd = rawEnd.getTime() > monthEnd.getTime();
          const visibleStart = clippedStart ? monthStart : rawStart;
          const visibleEnd = clippedEnd ? monthEnd : rawEnd;

          const startIndex = daysInMonth.findIndex((day) =>
            isSameDay(day, visibleStart),
          );
          const endIndex = daysInMonth.findIndex((day) =>
            isSameDay(day, visibleEnd),
          );
          if (startIndex < 0 || endIndex < startIndex) return [];

          // Off Grid: derive a continuous, fractional position from the real
          // check-in / check-out dates so the bar is not forced to snap to the
          // date-grid cell boundaries. This is purely visual.
          let fracStart = startIndex;
          let fracWidth = endIndex - startIndex + 1;
          if (offGrid) {
            const checkinDate = normalizeCalendarDate(
              booking?.checkinDate || booking?.checkIn,
            );
            const checkoutDate = normalizeCalendarDate(
              booking?.checkoutDate || booking?.checkOut,
            );
            if (checkinDate && checkoutDate) {
              const cIn = new Date(`${checkinDate}T00:00:00`).getTime();
              const cOut = new Date(`${checkoutDate}T00:00:00`).getTime();
              const day = 86400000;
              const rawStartFrac = Math.round(
                (cIn - monthStart.getTime()) / day,
              );
              const rawEndFrac = Math.round(
                (cOut - monthStart.getTime()) / day,
              );
              const startFrac = Math.max(
                0,
                Math.min(rawStartFrac, daysInMonth.length),
              );
              const endFrac = Math.max(
                0,
                Math.min(rawEndFrac, daysInMonth.length),
              );
              fracStart = startFrac;
              fracWidth = Math.max(0, endFrac - startFrac);
            }
          }

          return [
            {
              booking,
              startIndex,
              endIndex,
              span: endIndex - startIndex + 1,
              fracStart,
              fracWidth,
              paymentStatus: getPaymentStatus(booking),
              pillStatus: getPillStatus(booking),
              bookingLabel: getBookingLabel(booking),
              clippedStart,
              clippedEnd,
              lane: 0,
              laneCount: 1,
            },
          ];
        });
      });
    },
    [viewDate, daysInMonth, calendarBookingByCell, calendarBookings, systemNow],
  );

  const bookingBarsByUnit = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const unit of displayUnits) {
      map.set(String(unit.id), getBookingBarsForUnit(unit, isOffGrid));
    }
    return map;
  }, [displayUnits, getBookingBarsForUnit, isOffGrid]);

  const handleCopyCalendarAuthorizationLetters = async () => {
    if (selectedRanges.length === 0) {
      toast({ variant: "destructive", title: "No selected dates" });
      return;
    }

    const guestName =
      [bookingDraft.guestFirstName?.trim(), bookingDraft.guestLastName?.trim()]
        .filter(Boolean)
        .join(" ") || "Guest";

    const letterBody = [
      `Dear ${guestName},`,
      "",
      "This is your authorization letter for the selected calendar booking range.",
      "",
      ...selectedRanges.map((range) => {
        const rangeLabel = `${getUnitLabel(range.unit)} — ${range.checkinDate} → ${range.checkoutDate} (${range.nights} night(s))`;
        return `- ${rangeLabel}`;
      }),
      "",
      "Please keep this document as proof of your booking selection.",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(letterBody);
      toast({ title: "Authorization letter copied" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Copy failed" });
    }
  };

  const handleSaveCalendarSnapshot = async () => {
    if (!calendarSnapshotRef.current || selectedRanges.length === 0) {
      toast({ variant: "destructive", title: "Nothing to snapshot" });
      return;
    }

    setImageSaving(true);
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const canvas = await html2canvas(calendarSnapshotRef.current, {
        backgroundColor: "#141414",
        scale: 1,
        logging: false,
      });
      const pngBytes = await canvasToPngBytes(canvas);

      const { exists, mkdir, writeFile, BaseDirectory } =
        await import("@tauri-apps/plugin-fs");

      const guestName =
        [
          bookingDraft.guestFirstName?.trim(),
          bookingDraft.guestLastName?.trim(),
        ]
          .filter(Boolean)
          .join("-") || "guest";

      const fileName = `${guestName}-${selectedRanges[0]?.checkinDate || todayDateInput()}.png`;
      const folder = "ManilaPrime/Bookings";
      const targetPath = `${folder}/${fileName}`;

      await mkdir(folder, {
        baseDir: BaseDirectory.Desktop,
        recursive: true,
      });
      if (await exists(targetPath, { baseDir: BaseDirectory.Desktop })) {
        const shouldReplace = window.confirm(
          `${fileName} already exists. Replace it?`,
        );
        if (!shouldReplace) return;
      }
      await writeFile(targetPath, pngBytes, {
        baseDir: BaseDirectory.Desktop,
        create: true,
      });
      toast({
        title: "Booking image saved",
        description: `Saved to Desktop/${targetPath}`,
      });
    } catch (error: any) {
      console.error("Booking image save failed", error);
      toast({
        variant: "destructive",
        title: "Image save failed",
        description:
          error?.message || "The booking image could not be created.",
      });
    } finally {
      setImageSaving(false);
    }
  };

  const handleGenerateBookingDocument = async (type: BookingDocumentType) => {
    if (!detailsBooking?.id) return;
    setDocumentLoading(type);
    try {
      const unit = getBookingUnit(detailsBooking);
      const document = await createBookingPdf({
        type,
        booking: detailsBooking,
        unit,
        preparedBy: user?.displayName || user?.email || null,
      });
      const { exists, mkdir, writeFile, BaseDirectory } =
        await import("@tauri-apps/plugin-fs");
      const folder =
        type === "quotation" ? "ManilaPrime/Quotations" : "ManilaPrime/SOA";
      const path = `${folder}/${document.fileName}`;

      if (!document?.bytes || document.bytes.length === 0) {
        throw new Error("Generated PDF bytes are empty");
      }

      await mkdir(folder, {
        baseDir: BaseDirectory.Desktop,
        recursive: true,
      });
      if (
        (await exists(path, { baseDir: BaseDirectory.Desktop })) &&
        !confirm(`${document.fileName} already exists. Replace it?`)
      )
        return;

      await writeFile(path, document.bytes, {
        baseDir: BaseDirectory.Desktop,
        create: true,
      });

      toast({
        title:
          type === "quotation"
            ? "Quotation generated"
            : "Statement of Account generated",
        description: `Saved to Desktop/${path}`,
      });
    } catch (error: any) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : JSON.stringify(error);
      console.error("Booking document save failed", error);
      toast({
        variant: "destructive",
        title: "Document generation failed",
        description: errorMessage || "Unable to save the PDF.",
      });
    } finally {
      setDocumentLoading(null);
    }
  };

  useEffect(() => {
    if (!dragAnchor || !dragTarget) return;
    const { availableCells, blockedCells } = buildCellsBetween(
      dragAnchor,
      dragTarget,
    );

    setDragSelection((previousDragSelection) => {
      if (areCellsEqual(previousDragSelection, availableCells)) {
        return previousDragSelection;
      }
      return availableCells;
    });

    setBlockedDuringSelection((previousBlocked) => {
      if (previousBlocked === blockedCells) return previousBlocked;
      return blockedCells;
    });
  }, [
    areCellsEqual,
    dragAnchor,
    dragTarget,
    bookings,
    daysInMonth,
    displayUnits,
  ]);

  useEffect(() => {
    if (!dragAnchor) return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor =
      dragAction === "remove" ? "not-allowed" : "crosshair";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragAnchor, dragAction]);

  useEffect(() => {
    if (!dragAnchor) return;
    const handleMouseUp = () => {
      const nextSelection = (() => {
        const nextByKey = new Map(
          selection.map((cell) => [cellKey(cell), cell]),
        );
        dragSelection.forEach((cell) => {
          const key = cellKey(cell);
          if (dragAction === "remove") nextByKey.delete(key);
          else nextByKey.set(key, cell);
        });
        return Array.from(nextByKey.values()).sort((a, b) => {
          if (a.unitIndex !== b.unitIndex) return a.unitIndex - b.unitIndex;
          return a.dayIndex - b.dayIndex;
        });
      })();

      setSelection((previousSelection) => {
        if (areCellsEqual(previousSelection, nextSelection)) {
          return previousSelection;
        }
        return nextSelection;
      });
      setDragAnchor(null);
      setDragTarget(null);
      setDragSelection([]);
      setBlockedDuringSelection(0);
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [areCellsEqual, dragAction, dragAnchor, dragSelection, selection]);

  const handlePrevMonth = useCallback(() => {
    const prev = subMonths(viewDate, 1);
    setMonth(prev.getMonth());
    setYear(prev.getFullYear());
    if (!isInquiryMode) clearSelection();
  }, [clearSelection, isInquiryMode, setMonth, setYear, viewDate]);

  const handleNextMonth = useCallback(() => {
    const next = addMonths(viewDate, 1);
    setMonth(next.getMonth());
    setYear(next.getFullYear());
    if (!isInquiryMode) clearSelection();
  }, [clearSelection, isInquiryMode, setMonth, setYear, viewDate]);

  const handleInquiryDateSelect = useCallback(
    (date: string) => {
      setOperationsBooking(null);
      setDetailsBooking(null);
      setSelection([]);
      setDragSelection([]);
      setDragAnchor(null);
      setDragTarget(null);
      setInquirySearchRan(false);

      if (!inquiryStartDate || inquiryEndDate) {
        setInquiryStartDate(date);
        setInquiryEndDate(null);
        return;
      }

      // Starting a new range on an earlier date avoids ever storing an invalid
      // end-before-start state, while still making correction a one-click action.
      if (date < inquiryStartDate) {
        setInquiryStartDate(date);
        setInquiryEndDate(null);
        return;
      }
      setInquiryEndDate(date);
    },
    [inquiryEndDate, inquiryStartDate],
  );

  const updateInquiryDate = useCallback(
    (field: "start" | "end", date: string) => {
      if (!date) return;
      setInquirySearchRan(false);
      if (field === "start") {
        setInquiryStartDate(date);
        // Keep a valid range while editing: checkout follows check-in only
        // when it would otherwise be before it.
        if (!inquiryEndDate || inquiryEndDate < date) {
          setInquiryEndDate(
            format(addDays(new Date(`${date}T00:00:00`), 1), "yyyy-MM-dd"),
          );
        }
      } else if (!inquiryStartDate || date >= inquiryStartDate) {
        setInquiryEndDate(date);
      }
    },
    [inquiryEndDate, inquiryStartDate],
  );

  const setInquiryQuickRange = useCallback(
    (offset: number) => {
      const start = addDays(new Date(), offset);
      const end = addDays(start, 1);
      setInquiryStartDate(format(start, "yyyy-MM-dd"));
      setInquiryEndDate(format(end, "yyyy-MM-dd"));
      setInquirySearchRan(false);
      if (!isInquiryMode) setIsInquiryMode(true);
    },
    [isInquiryMode],
  );

  const checkInquiryAvailability = useCallback(() => {
    if (!inquiryStartDate || !inquiryEndDate) {
      toast({
        variant: "destructive",
        title: "Choose check-in and check-out dates",
      });
      return;
    }
    if (inquiryEndDate <= inquiryStartDate) {
      toast({
        variant: "destructive",
        title: "Check-out must be after check-in",
      });
      return;
    }
    if (!isInquiryMode) setIsInquiryMode(true);
    setInquirySearchRan(true);
  }, [inquiryEndDate, inquiryStartDate, isInquiryMode, toast]);

  const startInquiryBooking = useCallback(
    (unit: any) => {
      if (!inquiryStartDate || !inquiryEndDate) return;
      const start = new Date(`${inquiryStartDate}T00:00:00`);
      const end = new Date(`${inquiryEndDate}T00:00:00`);
      const range: UnitDateRange = {
        unit,
        checkinDate: inquiryStartDate,
        checkoutDate: inquiryEndDate,
        nights: Math.max(
          1,
          Math.round((end.getTime() - start.getTime()) / 86400000),
        ),
      };
      setInquiryBookingRange(range);
      setBookingDraft(
        (draft) =>
          ({
            ...draft,
            checkinDate: range.checkinDate,
            checkoutDate: range.checkoutDate,
          }) as any,
      );
      setIsAddDialogOpen(true);
    },
    [inquiryEndDate, inquiryStartDate],
  );

  const toggleInquiryMode = useCallback(() => {
    // Do not perform other state updates inside a state-setter callback. In
    // React strict mode that callback may be replayed, which previously left
    // the calendar with a stale drag or inquiry selection.
    setIsInquiryMode(!isInquiryMode);
    clearSelection();
    clearInquiryRange();
  }, [clearInquiryRange, clearSelection, isInquiryMode]);

  const toggleOffGrid = useCallback(() => {
    // Off Grid changes timeline positioning only; it intentionally preserves
    // the visible month, inquiry range, and any normal booking selection.
    setIsOffGrid((enabled) => !enabled);
  }, []);

  const handleAvailableMouseDown = useCallback(
    (cell: CalendarCell) => {
      const blockUnit = displayUnits.find(
        (unit) => String(unit.id) === cell.unitId,
      );
      if (blockUnit && isCalendarBlockedCell(blockUnit, cell.date)) return;
      const { availableCells, blockedCells } = buildCellsBetween(cell, cell);
      const isAlreadySelected = selectedCellKeys.has(cellKey(cell));
      setDragAction(isAlreadySelected ? "remove" : "add");

      setBlockedDuringSelection((previousBlocked) => {
        if (previousBlocked === blockedCells) return previousBlocked;
        return blockedCells;
      });

      setDragAnchor(cell);
      setDragTarget(cell);
      setDragSelection((previousDragSelection) => {
        if (areCellsEqual(previousDragSelection, availableCells)) {
          return previousDragSelection;
        }
        return availableCells;
      });
      setOperationsBooking(null);
      setDetailsBooking(null);
    },
    [areCellsEqual, buildCellsBetween, displayUnits, selectedCellKeys],
  );

  const updateDraft = useCallback(
    (field: keyof BookingDraft, value: any) => {
      // Calendar rows contain hundreds of interactive cells. Keeping draft edits
      // non-urgent prevents those cells from blocking text entry in the dialog.
      startDraftTransition(() => {
        setBookingDraft((prev) => ({ ...prev, [field]: value }));
      });
    },
    [startDraftTransition],
  );

  const handleToggleSelection = useCallback(
    (cell: CalendarCell) => {
      const cellKeyStr = cellKey(cell);
      const alreadySelected = selection.some(
        (currentCell) => cellKey(currentCell) === cellKeyStr,
      );
      const nextSelection = alreadySelected
        ? selection.filter((currentCell) => cellKey(currentCell) !== cellKeyStr)
        : [...selection, cell];

      setSelection(nextSelection);
      setOperationsBooking(null);
      setDetailsBooking(null);
    },
    [selection],
  );

  const createAgentCommission = async (bookingData: {
    agentId: string;
    agentName: string;
    totalAmount: number;
    unitId: string;
    unitName: string;
    checkinDate: string;
    checkoutDate: string;
    guestFirstName: string;
    guestLastName: string;
    bookingId?: string;
  }) => {
    if (!bookingData.agentId) return;
    const agent = (agents as any[]).find(
      (a) => String(a.id) === String(bookingData.agentId),
    );
    if (!agent) return;
    const checkin = new Date(bookingData.checkinDate);
    const checkout = new Date(bookingData.checkoutDate);
    const nights = Math.max(
      1,
      Math.round(
        (checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
    const unit = (units as any[]).find(
      (u) => String(u.id) === String(bookingData.unitId),
    );
    const baseRate = toNumber(unit?.rate, 0);
    const commissionAmount = Math.max(
      0,
      bookingData.totalAmount - baseRate * nights,
    );
    if (commissionAmount <= 0) return;
    const guestName =
      `${bookingData.guestFirstName} ${bookingData.guestLastName}`.trim();
    if (!bookingData.bookingId) return;
    const commissionId = `agent-commission-${bookingData.bookingId}-${bookingData.agentId}`;
    const existing = (calendarResources.data["expenses"] as any[]).find(
      (e: any) => String(e.id) === commissionId,
    );
    if (existing) return;
    try {
      const payload = removeUndefinedDeep({
        id: commissionId,
        uid: user?.uid,
        title: `Commission - ${bookingData.agentName} - ${guestName}`,
        category: "Agent Commission",
        agentId: bookingData.agentId,
        agentName: bookingData.agentName,
        bookingId: bookingData.bookingId,
        amount: Math.round(commissionAmount * 100) / 100,
        date: bookingData.checkinDate,
        commissionStatus: "on hold",
        unitId: bookingData.unitId,
        unitName: bookingData.unitName,
        paymentMethod: "CASH",
        notes: `Auto-generated commission for ${guestName} (${nights} nights)`,
        createdAt: new Date().toISOString(),
      });
      await apiClient.post("/expense", payload, auth);
    } catch (err) {
      console.error("Failed to create agent commission:", err);
      toast({
        variant: "destructive",
        title: "Warning",
        description: `Booking saved but agent commission creation failed. Please create the commission manually.`,
      });
    }
  };

  const handleSaveSelection = async (
    event: React.FormEvent,
    submittedDraft: BookingDraft = bookingDraft,
  ) => {
    if (!canManageOperations(role)) return;
    event.preventDefault();
    if (selectedRanges.length === 0) {
      toast({ variant: "destructive", title: "No available dates selected" });
      return;
    }
    if (
      selection.some((cell) =>
        calendarBookingByCell.has(`${cell.unitId}__${cell.date}`),
      )
    ) {
      toast({
        variant: "destructive",
        title: "Booking conflict",
        description: "One or more selected dates are already occupied.",
      });
      clearSelection();
      return;
    }
    // Inquiry results can become stale. Recheck the exact proposed range,
    // including date-specific blocks, before any write is attempted.
    for (const range of selectedRanges) {
      const dates = eachDayOfInterval({
        start: new Date(`${range.checkinDate}T00:00:00`),
        end: addDays(new Date(`${range.checkoutDate}T00:00:00`), -1),
      });
      const unavailable = dates.some(
        (day) => !isCellAvailable(range.unit, day),
      );
      if (unavailable) {
        toast({
          variant: "destructive",
          title: "Booking conflict",
          description:
            "This unit is no longer available for the requested dates.",
        });
        setInquiryBookingRange(null);
        return;
      }
    }
    const hasGuestName =
      submittedDraft.guestFirstName.trim() ||
      submittedDraft.guestLastName.trim();
    if (!hasGuestName) {
      toast({ variant: "destructive", title: "Guest name required" });
      return;
    }
    setSaving(true);
    try {
      const today = todayDateInput();
      const bookingDate = toDateInput(submittedDraft.bookingDate) || today;
      const paymentStatus =
        submittedDraft.bookingPaymentStatus ||
        submittedDraft.paymentStatus ||
        "Unpaid";
      const depositStatus = submittedDraft.securityDepositStatus || "Unpaid";
      const batchResults = await Promise.allSettled(
        selectedRanges.map(async (range) => {
          const totalAmount = submittedDraft.isCustomAmount
            ? toNumber(submittedDraft.totalAmount, 0)
            : getRangeAutoAmount(range, submittedDraft);
          const payload = {
            uid: user?.uid,
            unitId: String(range.unit.id),
            unitName: getUnitLabel(range.unit),
            guestFirstName: submittedDraft.guestFirstName.trim(),
            guestLastName: submittedDraft.guestLastName.trim(),
            guestPhone: submittedDraft.guestPhone.trim(),
            guestEmail: submittedDraft.guestEmail.trim(),
            agentId: submittedDraft.agentId || "",
            agentName: submittedDraft.agentName || "",
            bookingSource: submittedDraft.bookingSource || "N/A",
            bookingLabel: getBookingSourceLabel(
              submittedDraft.bookingSource || "N/A",
            ),
            checkinDate: range.checkinDate,
            checkoutDate: range.checkoutDate,
            bookingDate,
            adults: Number(submittedDraft.adults || 0),
            children: Number(submittedDraft.children || 0),
            paymentStatus,
            bookingPaymentStatus: paymentStatus,
            notes: submittedDraft.notes.trim(),
            specialRequests: submittedDraft.notes.trim(),
            totalAmount,
            isCustomAmount: true,
            securityDepositStatus: depositStatus,
            securityDeposit: {
              ...(submittedDraft.securityDeposit || {}),
              status: depositStatus,
            },
            bookingPayment: {
              ...(submittedDraft.bookingPayment || {}),
              status: paymentStatus,
            },
            securityDepositReceipt: {
              ...(submittedDraft.securityDepositReceipt || {}),
              status: depositStatus,
            },
          };
          const bookingRes = await apiClient.post<any>(
            "/booking",
            payload,
            auth,
          );
          return {
            range,
            totalAmount,
            bookingId: bookingRes?.id || bookingRes?.data?.id || "",
          };
        }),
      );

      const { successful: createdBookings, failed: failedBookings } =
        summarizeBookingBatchResults(batchResults);

      if (createdBookings.length === 0) {
        const firstFailure =
          failedBookings[0]?.error || "Unknown booking error";
        throw new Error(firstFailure);
      }

      if (failedBookings.length > 0) {
        const failedSummary = failedBookings
          .slice(0, 3)
          .map((item) => item.error)
          .join("; ");
        toast({
          title: "Partial booking creation",
          description: `${createdBookings.length} booking(s) created successfully. ${failedBookings.length} failed: ${failedSummary}`,
        });
      }

      // Commission documents are independent of booking creation, so waiting
      // for one should not serialize every selected unit's booking request.
      await Promise.all(
        createdBookings.map(({ range, totalAmount, bookingId }) =>
          submittedDraft.agentId && bookingId
            ? createAgentCommission({
                agentId: submittedDraft.agentId,
                agentName: submittedDraft.agentName,
                totalAmount: Number(totalAmount ?? 0),
                unitId: String(range?.unit?.id ?? ""),
                unitName: getUnitLabel(range?.unit),
                checkinDate: range?.checkinDate || "",
                checkoutDate: range?.checkoutDate || "",
                guestFirstName: submittedDraft.guestFirstName.trim(),
                guestLastName: submittedDraft.guestLastName.trim(),
                bookingId,
              })
            : Promise.resolve(),
        ),
      );

      if (failedBookings.length > 0) {
        toast({
          title: "Bookings created with warnings",
          description: `${createdBookings.length} booking(s) saved; ${failedBookings.length} failed and were not created.`,
        });
      } else {
        toast({ title: "Booking created" });
      }
      setIsAddDialogOpen(false);
      clearSelection();
      setBookingDraft(makeDefaultBookingDraft());
      await calendarResources.refresh();
    } catch (saveError: any) {
      toast({
        variant: "destructive",
        title: "Failed to save booking",
        description: saveError?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDetailsBooking = async () => {
    if (!canManageOperations(role)) return;
    if (!detailsBooking?.id) return;
    setSaving(true);
    try {
      const payload = { ...detailsBooking };
      payload.bookingSource = payload.bookingSource || "N/A";
      payload.bookingLabel = getBookingSourceLabel(payload.bookingSource);
      const sanitizedPayload = removeUndefinedDeep(payload);
      await apiClient.put(
        `/booking/${detailsBooking.id}`,
        sanitizedPayload,
        auth,
      );
      if (detailsBooking.agentId) {
        await createAgentCommission({
          agentId: detailsBooking.agentId,
          agentName: detailsBooking.agentName || "",
          totalAmount: Number(detailsBooking.totalAmount),
          unitId: String(detailsBooking.unitId || ""),
          unitName: detailsBooking.unitName || "",
          checkinDate: toDateInput(detailsBooking.checkinDate) || "",
          checkoutDate: toDateInput(detailsBooking.checkoutDate) || "",
          guestFirstName: detailsBooking.guestFirstName || "",
          guestLastName: detailsBooking.guestLastName || "",
          bookingId: detailsBooking.id,
        });
      }
      setDetailsBooking(payload);
      await calendarResources.refresh();
      toast({ title: "Booking updated" });
    } catch (saveError: any) {
      toast({ variant: "destructive", title: "Failed to save booking" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDetailsSnapshot = async () => {
    if (!detailsBooking || !detailsSnapshotRef.current) return;
    setImageSaving(true);
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const canvas = await html2canvas(detailsSnapshotRef.current, {
        backgroundColor: "#0B0B0B",
        scale: 1,
        logging: false,
      });
      const { mkdir, writeFile, BaseDirectory } =
        await import("@tauri-apps/plugin-fs");
      const guestName =
        [detailsBooking.guestFirstName, detailsBooking.guestLastName]
          .filter(Boolean)
          .join("-")
          .replace(/[\\/:*?"<>|]+/g, "_") || "booking";
      const bookingDate =
        toDateInput(getBookingDateValue(detailsBooking)) || todayDateInput();
      const path = `Bookings/${bookingDate.replace(/-/g, "")}-${guestName}.png`;
      await mkdir("Bookings", {
        baseDir: BaseDirectory.Desktop,
        recursive: true,
      });
      await writeFile(path, await canvasToPngBytes(canvas), {
        baseDir: BaseDirectory.Desktop,
        create: true,
      });
      toast({
        title: "Booking image saved",
        description: `Saved to Desktop/${path}`,
      });
    } catch (error: any) {
      console.error("Booking image save failed", error);
      toast({
        variant: "destructive",
        title: "Image save failed",
        description:
          error?.message || "The booking image could not be created.",
      });
    } finally {
      setImageSaving(false);
    }
  };

  const handleCopyDetailsAuthorizationLetter = async () => {
    toast({ title: "Letter copied" });
  };

  const handleCancelDetailsBooking = async () => {
    if (!canManageOperations(role)) return;
    if (!detailsBooking?.id) return;
    setSaving(true);
    try {
      await apiClient.delete(`/booking/${detailsBooking.id}`, auth);
      calendarResources.removeBookingRelatedData(String(detailsBooking.id));
      setDetailsBooking(null);
      toast({ title: "Booking canceled" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
        <p className="text-muted-foreground font-medium">
          Syncing Business Overview...
        </p>
      </div>
    );
  }

  const isAug29BlockVisible = daysInMonth.some(
    (day) => format(day, "yyyy-MM-dd") === AUG29_BLOCK_DATE,
  );
  const isWinterClosureVisible = daysInMonth.some((day) =>
    isWinterClosureDate(format(day, "yyyy-MM-dd")),
  );
  const calendarLegend = Object.entries(bookingLabelStyles).map(
    ([label, color]) => ({ label, color }),
  );
  const selectedOperationsStatus = operationsBooking
    ? getOperationsStatus(operationsBooking, clockNow)
    : null;
  const operationsTimeline = [
    { key: "upcoming", label: "Upcoming" },
    { key: "checked-in", label: "Checked In" },
    { key: "due-for-checkout", label: "Due for Checkout" },
    { key: "checked-out", label: "Checked Out" },
  ];
  const selectedTimelineStage = selectedOperationsStatus
    ? operationsTimeline.findIndex(
        (item) => item.key === selectedOperationsStatus.key,
      )
    : -1;

  return (
    <div
      className={cn(
        "space-y-3 animate-in fade-in duration-500 pb-6",
        isFullScreen &&
          "fixed inset-0 z-50 flex h-screen flex-col overflow-hidden bg-[hsl(var(--bg-primary))] p-0 pb-0 animate-in fade-in zoom-in-95 duration-200",
      )}
    >
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {isFullScreen && (
        <div className="fixed top-4 right-4 z-[60]">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full bg-[hsl(var(--bg-surface))]/90 backdrop-blur-md border border-[var(--border)] shadow-lg"
            onClick={exitFullScreen}
            aria-label="Close full screen"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      <div
        className={cn(
          "rounded-[28px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-[0_20px_60px_-38px_rgba(15,23,42,0.35)] md:p-4",
          isFullScreen &&
            "shrink-0 rounded-none border-x-0 border-t-0 p-0 shadow-none",
        )}
        data-calendar-page
      >
        <div
          className={cn(
            "flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between",
            isFullScreen && "hidden",
          )}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] shadow-sm">
                <CalendarRange className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-[hsl(var(--accent))]">
                  Calendar
                </p>
                <h1 className="text-xl font-bold tracking-tight text-[hsl(var(--text-primary))]">
                  Occupancy Calendar
                </h1>
                <p className="text-sm text-[hsl(var(--text-secondary))]">
                  View and manage bookings, occupancy, and availability.
                </p>
              </div>
            </div>
          </div>
        </div>

        {isFullScreen ? (
          <div className="sticky top-0 z-50 flex flex-col gap-3 bg-[hsl(var(--bg-surface))] px-6 py-3 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full bg-[hsl(var(--bg-surface))] text-[hsl(var(--text-primary))]"
                  onClick={handlePrevMonth}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-[var(--border)] bg-[hsl(var(--bg-surface))] px-4 py-2 text-sm font-semibold text-[hsl(var(--text-primary))]"
                  onClick={handleToday}
                >
                  <CalendarRange className="h-4 w-4 text-[hsl(var(--accent))]" />
                  Today
                </Button>
                <div className="rounded-full border border-[var(--border)] bg-[hsl(var(--bg-surface))] px-4 py-2 text-sm font-semibold text-[hsl(var(--text-primary))]">
                  {format(viewDate, "MMMM yyyy")}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full bg-[hsl(var(--bg-surface))] text-[hsl(var(--text-primary))]"
                  onClick={handleNextMonth}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {housekeepingReadyCount > 0 && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    {housekeepingReadyCount} ready for housekeeping today
                  </div>
                )}

                <div className="inline-flex items-center gap-3 rounded-full bg-[hsl(var(--bg-surface))] px-3 py-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "rounded-full border-[var(--border)] bg-transparent text-[hsl(var(--text-primary))]",
                      isInquiryMode &&
                        "border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
                    )}
                    onClick={toggleInquiryMode}
                  >
                    <CalendarRange className="mr-1.5 h-4 w-4" />
                    Inquiry
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "rounded-full border-[var(--border)] bg-transparent text-[hsl(var(--text-primary))]",
                      isOffGrid &&
                        "border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
                    )}
                    onClick={toggleOffGrid}
                    aria-pressed={isOffGrid}
                  >
                    Off Grid
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-[var(--border)] bg-transparent text-[hsl(var(--text-primary))]"
                    onClick={() => setIsUnitLegendOpen((open) => !open)}
                  >
                    {isUnitLegendOpen
                      ? "Hide Unit Legend"
                      : `Unit Legend (${displayUnits.length})`}
                  </Button>

                  <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[hsl(var(--bg-surface))] px-2 py-1">
                    <Building2 className="h-4 w-4 text-[hsl(var(--text-secondary))]" />
                    <Select value={unitFilter} onValueChange={handleUnitFilter}>
                      <SelectTrigger className="h-8 min-w-[150px] rounded-full border-none bg-transparent px-0 text-sm font-semibold text-[hsl(var(--text-primary))] shadow-none">
                        <SelectValue placeholder="All properties" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl">
                        <SelectItem value="all">All Properties</SelectItem>
                        {(units as any[]).map((unit) => (
                          <SelectItem key={unit.id} value={String(unit.id)}>
                            {unit.unitNumber || unit.name || "Unnamed Unit"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[hsl(var(--bg-surface))] px-2 py-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full bg-transparent text-[hsl(var(--text-primary))]"
                      aria-label="Zoom out"
                      onClick={() =>
                        setCalendarZoom((value) =>
                          Math.max(0.5, Number((value - 0.1).toFixed(1))),
                        )
                      }
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <div className="min-w-[56px] text-center text-sm font-semibold text-[hsl(var(--text-primary))]">
                      {Math.round(calendarZoom * 100)}%
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full bg-transparent text-[hsl(var(--text-primary))]"
                      aria-label="Zoom in"
                      onClick={() =>
                        setCalendarZoom((value) =>
                          Math.min(2.0, Number((value + 0.1).toFixed(1))),
                        )
                      }
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full bg-transparent text-[hsl(var(--text-primary))]"
                      aria-label="Reset zoom"
                      onClick={() => setCalendarZoom(1)}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden shrink-0 text-right leading-tight text-[hsl(var(--text-secondary))] xl:block">
              <div className="text-sm font-semibold">
                {clockNow.toLocaleDateString(undefined, { weekday: "long" })} ·{" "}
                {formatOperationsTime(clockNow)}
              </div>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "mt-3 flex flex-col gap-2 rounded-[24px] border border-[var(--border)] bg-[hsl(var(--bg-primary))] p-2.5 md:flex-row md:items-center md:justify-between",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:opacity-90"
                onClick={handlePrevMonth}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-[var(--border)] bg-[hsl(var(--bg-surface))] px-3 py-2 text-sm font-semibold text-[hsl(var(--text-primary))]"
                onClick={handleToday}
              >
                <CalendarRange className="h-4 w-4 text-[hsl(var(--accent))]" />
                Today
              </Button>
              <div className="rounded-full border border-[var(--border)] bg-[hsl(var(--bg-surface))] px-3 py-2 text-sm font-semibold text-[hsl(var(--text-primary))]">
                {format(viewDate, "MMMM yyyy")}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "shrink-0 rounded-full border-[var(--border)] bg-[hsl(var(--bg-surface))] text-[hsl(var(--text-primary))]",
                  isInquiryMode &&
                    "border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
                )}
                onClick={toggleInquiryMode}
                title="Inquiry mode: select a date range to preview availability without creating a booking"
              >
                <CalendarRange className="mr-1.5 h-4 w-4" />
                Inquiry
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "shrink-0 rounded-full border-[var(--border)] bg-[hsl(var(--bg-surface))] text-[hsl(var(--text-primary))]",
                  isOffGrid &&
                    "border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
                )}
                onClick={toggleOffGrid}
                aria-pressed={isOffGrid}
                title="Off Grid: let booking bars extend along the timeline instead of snapping to date cells"
              >
                Off Grid
              </Button>
              <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[hsl(var(--bg-surface))] px-2.5 py-1.5">
                <Building2 className="h-4 w-4 text-[hsl(var(--text-secondary))]" />
                <Select value={unitFilter} onValueChange={handleUnitFilter}>
                  <SelectTrigger className="h-8 min-w-[150px] rounded-full border-none bg-transparent px-0 text-sm font-semibold text-[hsl(var(--text-primary))] shadow-none">
                    <SelectValue placeholder="All properties" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="all">All Properties</SelectItem>
                    {(units as any[]).map((unit) => (
                      <SelectItem key={unit.id} value={String(unit.id)}>
                        {unit.unitNumber || unit.name || "Unnamed Unit"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full border-[var(--border)] bg-[hsl(var(--bg-surface))] text-[hsl(var(--text-primary))]"
                onClick={() => setIsUnitLegendOpen((open) => !open)}
              >
                {isUnitLegendOpen
                  ? "Hide Unit Legend"
                  : `Unit Legend (${displayUnits.length})`}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-[var(--border)] bg-[hsl(var(--bg-surface))] text-[hsl(var(--text-primary))]"
                onClick={() =>
                  isFullScreen ? exitFullScreen() : setIsFullScreen(true)
                }
              >
                {isFullScreen ? (
                  <Minimize2 className="mr-1.5 h-4 w-4" />
                ) : (
                  <Maximize2 className="mr-1.5 h-4 w-4" />
                )}
                {isFullScreen ? "Exit Full Screen" : "Full Screen"}
              </Button>
              <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[hsl(var(--bg-surface))] p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  aria-label="Zoom out"
                  onClick={() =>
                    setCalendarZoom((value) =>
                      Math.max(0.5, Number((value - 0.1).toFixed(1))),
                    )
                  }
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="min-w-10 text-center text-xs font-semibold text-[hsl(var(--text-secondary))]">
                  {Math.round(calendarZoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  aria-label="Zoom in"
                  onClick={() =>
                    setCalendarZoom((value) =>
                      Math.min(2.0, Number((value + 0.1).toFixed(1))),
                    )
                  }
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  aria-label="Reset zoom"
                  onClick={() => setCalendarZoom(1)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className={cn(
          "grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_280px]",
          isFullScreen && "block",
        )}
      >
        <div className="min-w-0">
          <Card
            className={cn(
              "overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--bg-surface)] shadow-[0_24px_90px_-44px_rgba(15,23,42,0.4)]",
              isFullScreen &&
                "flex min-h-0 flex-1 flex-col rounded-none border-x-0 border-b-0 shadow-none",
            )}
            role="region"
            aria-label="Calendar"
            id="calendar-card"
          >
            {(!isFullScreen || isUnitLegendOpen) && (
              <div
                className={cn(
                  "border-b border-[var(--border)] bg-[hsl(var(--bg-primary))] px-3 py-2",
                  isFullScreen && "shrink-0 px-3 py-1.5",
                )}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.32em] text-[hsl(var(--text-secondary))]">
                      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[hsl(var(--accent))]" />
                      Unit Legend
                    </div>
                  </div>
                  {(() => {
                    const groupedUnits = new Map<string, typeof displayUnits>();
                    displayUnits.forEach((unit) => {
                      const type = (unit.type || "UNIT").toLowerCase();
                      const category = type.includes("park")
                        ? "Parking Units"
                        : "Residential Units";
                      if (!groupedUnits.has(category))
                        groupedUnits.set(category, []);
                      groupedUnits.get(category)!.push(unit);
                    });
                    const categories = Array.from(groupedUnits.entries());
                    return (
                      <div className="flex flex-col gap-2">
                        {categories.map(([category, categoryUnits]) => (
                          <div key={category}>
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[hsl(var(--text-secondary))]">
                              {category}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {categoryUnits.map((unit) => {
                                const unitColor =
                                  unitColorMap.get(String(unit.id)) ||
                                  "#94a3b8";
                                const unitLabel =
                                  unit.unitNumber ||
                                  unit.name ||
                                  "Unnamed Unit";
                                return (
                                  <div
                                    key={`legend-${unit.id}`}
                                    className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[hsl(var(--bg-surface))] px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--text-primary))]"
                                  >
                                    <span
                                      className="h-2.5 w-2.5 rounded-full"
                                      style={{ backgroundColor: unitColor }}
                                    />
                                    <span className="truncate">
                                      {unitLabel}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
            <ScrollArea
              className={cn(
                "w-full h-[calc(100vh-310px)]",
                isFullScreen && "min-h-0 flex-1 h-full",
              )}
            >
              <div
                ref={calendarScrollRef}
                data-calendar-mode={isOffGrid ? "off-grid" : "grid"}
                className={cn(
                  "select-none",
                  isFullScreen ? "min-w-0 w-full" : "min-w-[1200px]",
                )}
              >
                <div className="sticky top-0 z-30 flex border-b border-[var(--border)] bg-[hsl(var(--bg-surface))]">
                  <div
                    className="sticky left-0 z-40 flex w-[120px] shrink-0 items-center justify-center border-b border-r border-[var(--border)] bg-[hsl(var(--bg-surface))] px-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--text-secondary))] shadow-[2px_0_6px_-3px_rgba(15,23,42,0.25)]"
                    style={{ height: `${computedHeaderHeight}px` }}
                  >
                    Unit
                  </div>
                  {daysInMonth.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const selected = isSameDay(day, new Date());
                    const isBlockedHeader =
                      dateStr === AUG29_BLOCK_DATE ||
                      isWinterClosureDate(dateStr);
                    const dayOfWeek = day.getDay();
                    const isSunday = dayOfWeek === 0;
                    const isSaturday = dayOfWeek === 6;
                    return (
                      <div
                        key={dateStr}
                        data-calendar-day={dateStr}
                        className="relative flex shrink-0 flex-col items-center justify-center border-b border-r border-[var(--border)] bg-[hsl(var(--bg-surface))] px-1 text-center"
                        style={dayStyle}
                      >
                        <span
                          className={cn(
                            "text-[10px] font-bold uppercase tracking-[0.2em]",
                            isSunday && "text-red-500",
                            isSaturday && "text-blue-500",
                            !isSunday &&
                              !isSaturday &&
                              "text-[hsl(var(--text-secondary))]",
                          )}
                        >
                          {format(day, "EEE").toUpperCase()}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 flex h-6 w-6 items-center justify-center text-xs font-bold",
                            selected
                              ? "rounded-full bg-orange-500 text-white"
                              : "text-[hsl(var(--text-primary))]",
                          )}
                        >
                          {day.getDate()}
                        </span>
                        {isBlockedHeader && (
                          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-red-500 px-1.5 py-px text-[7px] font-bold uppercase tracking-wide text-white">
                            Blocked
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {displayUnits.map((unit, unitIndex) => {
                  const unitColor =
                    unitColorMap.get(String(unit.id)) || "#94a3b8";
                  const unitBars = bookingBarsByUnit.get(String(unit.id)) || [];
                  return (
                    <div
                      key={unit.id}
                      className="relative flex min-w-max border-b border-[var(--border)] last:border-b-0"
                    >
                      <div
                        className={cn(
                          "sticky left-0 z-20 flex w-[120px] shrink-0 flex-col items-center justify-center border-r border-[var(--border)] bg-[hsl(var(--bg-surface))] px-1.5 text-center shadow-[2px_0_6px_-3px_rgba(15,23,42,0.25)]",
                          isFullScreen && "px-2",
                        )}
                        style={{
                          height: `${computedCellHeight}px`,
                          borderLeft: `4px solid ${unitColor}`,
                        }}
                      >
                        <div className="flex w-full min-w-0 items-center justify-center gap-1">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: unitColor }}
                          />
                          <span
                            title={
                              unit.unitNumber || unit.name || "Unnamed Unit"
                            }
                            className="min-w-0 break-words text-[11px] font-bold leading-3 text-[hsl(var(--text-primary))]"
                          >
                            {unit.unitNumber || unit.name || "Unnamed Unit"}
                          </span>
                        </div>
                        <span className="mt-0.5 max-w-full truncate text-[8px] font-bold uppercase leading-none tracking-[0.16em] text-[hsl(var(--text-secondary))]">
                          {unit.type || "UNIT"}
                        </span>
                      </div>

                      <div
                        className="relative flex"
                        style={{
                          ["--day-width" as any]: dayStyle?.width || "144px",
                        }}
                      >
                        {daysInMonth.map((day, dayIndex) => {
                          const dateStr = format(day, "yyyy-MM-dd");
                          const cell = {
                            unitId: String(unit.id),
                            unitIndex,
                            date: dateStr,
                            dayIndex,
                          };
                          const bookingForCell = findBookingForCell(unit, day);
                          const isBooked = Boolean(bookingForCell);
                          const pillStatus = isBooked
                            ? getPillStatus(bookingForCell)
                            : null;
                          const paymentStatus = isBooked
                            ? getPaymentStatus(bookingForCell)
                            : null;
                          const isSelected = previewSelectedCellKeys.has(
                            cellKey(cell),
                          );
                          const isInInquiryRange =
                            inquiryRangeDateSet.has(dateStr);
                          const isInquiryStart = inquiryStartDate === dateStr;
                          const isInquiryEnd = inquiryEndDate === dateStr;
                          const isBeingRemoved =
                            dragAction === "remove" &&
                            dragCellKeys.has(cellKey(cell));
                          const isToday = isSameDay(day, new Date());
                          const isAug29Blocked =
                            !isBooked && isCalendarBlockedCell(unit, dateStr);
                          const bookingPreviewAgent = isBooked
                            ? (agents as any[]).find(
                                (agent) =>
                                  String(agent.id) ===
                                  String(
                                    bookingForCell?.agentId ||
                                      bookingForCell?.agent_id ||
                                      "",
                                  ),
                              )
                            : null;
                          const bookingPreviewUnit = isBooked
                            ? getBookingUnit(bookingForCell)
                            : null;
                          const bookingPreviewProperty = isBooked
                            ? bookingPreviewUnit?.propertyName ||
                              bookingPreviewUnit?.property ||
                              bookingPreviewUnit?.propertyLabel ||
                              bookingPreviewUnit?.building?.name ||
                              ""
                            : "";
                          const bookingPreviewCheckin =
                            bookingForCell?.checkinDate ||
                            bookingForCell?.checkIn ||
                            "";
                          const bookingPreviewCheckout =
                            bookingForCell?.checkoutDate ||
                            bookingForCell?.checkOut ||
                            "";
                          const bookingPreviewNights =
                            bookingPreviewCheckin && bookingPreviewCheckout
                              ? Math.max(
                                  1,
                                  Math.round(
                                    (new Date(
                                      bookingPreviewCheckout,
                                    ).getTime() -
                                      new Date(
                                        bookingPreviewCheckin,
                                      ).getTime()) /
                                      86400000,
                                  ),
                                )
                              : 0;
                          const bookingPreviewAmount = Number(
                            bookingForCell?.totalAmount ||
                              bookingForCell?.amount ||
                              0,
                          );
                          const barForCell = unitBars.find(
                            (bar: any) => bar.startIndex === dayIndex,
                          );

                          return (
                            <TooltipProvider
                              key={`${unit.id}-${dateStr}`}
                              delayDuration={0}
                              skipDelayDuration={0}
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    key={`${unit.id}-${dateStr}`}
                                    className={cn(
                                      "relative flex shrink-0 items-start justify-center border-r border-[var(--border)] p-0.5 text-left transition-all duration-150",
                                      isBooked
                                        ? "cursor-pointer hover:bg-[hsl(var(--secondary))]"
                                        : "cursor-crosshair hover:bg-[hsl(var(--secondary))]",
                                      isSelected &&
                                        "bg-orange-50 border-orange-300",
                                      isInInquiryRange &&
                                        "bg-[hsl(var(--accent))]/15",
                                      (isInquiryStart || isInquiryEnd) &&
                                        "bg-[hsl(var(--accent))]/25 ring-1 ring-inset ring-[hsl(var(--accent))]",
                                      isBeingRemoved &&
                                        "bg-red-50 border-red-300",
                                      isAug29Blocked &&
                                        "cursor-not-allowed bg-red-100 dark:bg-red-950/40",
                                      isFullScreen && "relative z-0",
                                    )}
                                    style={dayStyle}
                                    onMouseDown={(event) => {
                                      if (isInquiryMode) {
                                        event.preventDefault();
                                        handleInquiryDateSelect(dateStr);
                                        return;
                                      }
                                      if (!isBooked) {
                                        event.preventDefault();
                                        handleAvailableMouseDown(cell);
                                      } else {
                                        // Fast-path: select opened booking immediately on mouse down for instant feedback
                                        setOperationsBooking(bookingForCell);
                                        // Toggle multi-selection for bookings (operational review)
                                        try {
                                          const id = String(
                                            bookingForCell?.id ||
                                              bookingForCell?.bookingId ||
                                              "",
                                          );
                                          setSelectedBookings((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(id)) next.delete(id);
                                            else if (id) next.add(id);
                                            return next;
                                          });
                                        } catch (e) {
                                          // ignore
                                        }
                                      }
                                    }}
                                    onClick={() => {
                                      if (isInquiryMode) return;
                                      if (isBooked) {
                                        clearSelection();
                                        setOperationsBooking(bookingForCell);
                                      }
                                    }}
                                    onKeyDown={(event) => {
                                      if (
                                        event.key === "Enter" ||
                                        event.key === " "
                                      ) {
                                        event.preventDefault();
                                        if (isInquiryMode) {
                                          handleInquiryDateSelect(dateStr);
                                          return;
                                        }
                                        if (isBooked) {
                                          clearSelection();
                                          setOperationsBooking(bookingForCell);
                                          return;
                                        }
                                        if (isAug29Blocked) return;
                                        handleToggleSelection(cell);
                                      }
                                    }}
                                    onMouseEnter={() => {
                                      if (isInquiryMode || !dragAnchor) return;
                                      const currentDragTargetKey = dragTarget
                                        ? cellKey(dragTarget)
                                        : null;
                                      if (
                                        currentDragTargetKey === cellKey(cell)
                                      ) {
                                        return;
                                      }
                                      setDragTarget(cell);
                                    }}
                                    onDoubleClick={(event) => {
                                      if (isInquiryMode) {
                                        event.preventDefault();
                                        handleInquiryDateSelect(dateStr);
                                        return;
                                      }
                                      if (!isBooked) return;
                                      event.preventDefault();
                                      clearSelection();
                                      setOperationsBooking(bookingForCell);
                                    }}
                                  >
                                    {isSelected ? (
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <CalendarPlus className="h-5 w-5 text-[hsl(var(--accent))]/60 pointer-events-none" />
                                      </div>
                                    ) : null}
                                    {isInInquiryRange && (
                                      <div className="pointer-events-none absolute inset-x-1 top-1 h-0.5 rounded-full bg-[hsl(var(--accent))]" />
                                    )}
                                    {isAug29Blocked && (
                                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                        <span className="rotate-[-16deg] text-[9px] font-bold uppercase tracking-wide text-red-600 dark:text-red-300">
                                          Blocked
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                {isBooked &&
                                bookingForCell &&
                                isDesktopHover ? (
                                  <TooltipContent
                                    side="top"
                                    align="start"
                                    className="w-[248px] rounded-2xl border border-[var(--border)] bg-[hsl(var(--popover))] p-3 text-[hsl(var(--popover-foreground))] shadow-[0_20px_70px_-35px_rgba(15,23,42,0.6)] data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in data-[state=delayed-open]:zoom-in-95"
                                  >
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className="inline-flex h-2 w-2 shrink-0 rounded-full"
                                          style={{
                                            backgroundColor:
                                              pillStatus?.color || "#22c55e",
                                          }}
                                        />
                                        <p className="min-w-0 truncate text-sm font-semibold text-[hsl(var(--text-primary))]">
                                          {getBookingGuestName(bookingForCell)}
                                        </p>
                                        <span
                                          className={cn(
                                            "ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                            pillStatus?.key === "upcoming" &&
                                              "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
                                            pillStatus?.key === "checked-in" &&
                                              "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
                                            pillStatus?.key ===
                                              "due-for-checkout" &&
                                              "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
                                            pillStatus?.key === "checked-out" &&
                                              "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
                                          )}
                                        >
                                          {pillStatus?.label || "Upcoming"}
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-[78px_1fr] gap-x-2 gap-y-1 text-[11px]">
                                        <span className="font-semibold text-[hsl(var(--text-secondary))]">
                                          Booking ID
                                        </span>
                                        <span className="truncate text-[hsl(var(--text-primary))]">
                                          {bookingForCell.id || "N/A"}
                                        </span>

                                        {bookingPreviewProperty && (
                                          <>
                                            <span className="font-semibold text-[hsl(var(--text-secondary))]">
                                              Property
                                            </span>
                                            <span className="truncate text-[hsl(var(--text-primary))]">
                                              {bookingPreviewProperty}
                                            </span>
                                          </>
                                        )}

                                        <span className="font-semibold text-[hsl(var(--text-secondary))]">
                                          Unit
                                        </span>
                                        <span className="truncate text-[hsl(var(--text-primary))]">
                                          {getBookingUnitName(bookingForCell)}
                                        </span>

                                        <span className="font-semibold text-[hsl(var(--text-secondary))]">
                                          Check-in
                                        </span>
                                        <span className="truncate text-[hsl(var(--text-primary))]">
                                          {formatBookingCardDate(
                                            bookingPreviewCheckin,
                                          )}
                                        </span>

                                        <span className="font-semibold text-[hsl(var(--text-secondary))]">
                                          Check-out
                                        </span>
                                        <span className="truncate text-[hsl(var(--text-primary))]">
                                          {formatBookingCardDate(
                                            bookingPreviewCheckout,
                                          )}
                                        </span>

                                        <span className="font-semibold text-[hsl(var(--text-secondary))]">
                                          Payment
                                        </span>
                                        <span className="truncate text-[hsl(var(--text-primary))]">
                                          {paymentStatus?.label || "Unpaid"}
                                        </span>

                                        <span className="font-semibold text-[hsl(var(--text-secondary))]">
                                          Booking status
                                        </span>
                                        <span className="truncate text-[hsl(var(--text-primary))]">
                                          {pillStatus?.label || "Upcoming"}
                                        </span>

                                        <span className="font-semibold text-[hsl(var(--text-secondary))]">
                                          Nights
                                        </span>
                                        <span className="truncate text-[hsl(var(--text-primary))]">
                                          {bookingPreviewNights}
                                        </span>

                                        <span className="font-semibold text-[hsl(var(--text-secondary))]">
                                          Amount
                                        </span>
                                        <span className="truncate text-[hsl(var(--text-primary))]">
                                          {formatCurrency(bookingPreviewAmount)}
                                        </span>

                                        {bookingPreviewAgent && (
                                          <>
                                            <span className="font-semibold text-[hsl(var(--text-secondary))]">
                                              Agent
                                            </span>
                                            <span className="truncate text-[hsl(var(--text-primary))]">
                                              {getAgentLabel(
                                                bookingPreviewAgent,
                                              )}
                                            </span>
                                          </>
                                        )}
                                      </div>

                                      {(bookingForCell.notes ||
                                        bookingForCell.specialRequests) && (
                                        <div className="rounded-xl border border-[var(--border)] bg-[hsl(var(--bg-primary))] p-2">
                                          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[hsl(var(--text-secondary))]">
                                            Notes
                                          </p>
                                          <p className="text-[11px] leading-5 text-[hsl(var(--text-primary))]">
                                            {bookingForCell.notes ||
                                              bookingForCell.specialRequests}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </TooltipContent>
                                ) : null}
                              </Tooltip>
                            </TooltipProvider>
                          );
                        })}
                        {unitBars.map((bar: any) => {
                          const dayWidthValue = dayStyle?.width || "144px";
                          const dw =
                            typeof dayWidthValue === "string"
                              ? parseInt(dayWidthValue) || 144
                              : 144;
                          const barLeftDays = isOffGrid
                            ? (bar.fracStart ?? bar.startIndex)
                            : bar.startIndex;
                          const barWidthDays = isOffGrid
                            ? (bar.fracWidth ?? bar.span)
                            : bar.span;
                          return (
                            <div
                              key={`bar-${getCalendarBookingIdentity(bar.booking)}-${bar.startIndex}-${bar.endIndex}`}
                              className="pointer-events-none absolute z-10"
                              style={{
                                left: barLeftDays * dw,
                                width: barWidthDays * dw,
                                top:
                                  3 +
                                  (bar.lane || 0) *
                                    Math.max(
                                      15,
                                      Math.floor(
                                        (computedCellHeight - 6) /
                                          (bar.laneCount || 1),
                                      ),
                                    ),
                                height: Math.max(
                                  13,
                                  Math.floor(
                                    (computedCellHeight - 6) /
                                      (bar.laneCount || 1),
                                  ) - 2,
                                ),
                              }}
                            >
                              <ReservationBar
                                booking={bar.booking}
                                span={bar.span}
                                dayWidth={dayWidthValue}
                                unitColor={
                                  bookingLabelStyles[
                                    getBookingLabel(bar.booking)
                                  ]
                                }
                                paymentStatus={bar.paymentStatus}
                                pillStatus={bar.pillStatus}
                                bookingLabel={getBookingLabel(bar.booking)}
                                isFullScreen={isFullScreen}
                                calendarZoom={calendarZoom}
                                clippedStart={bar.clippedStart}
                                clippedEnd={bar.clippedEnd}
                                selectedBookingIds={Array.from(
                                  selectedBookings,
                                )}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--border)] bg-[hsl(var(--bg-primary))] px-3 py-2">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--text-secondary))]">
                Legend
              </span>
              {calendarLegend.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[hsl(var(--bg-surface))] px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--text-primary))]"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {!isFullScreen && (
          <aside
            className="space-y-3 xl:sticky xl:top-4 xl:self-start"
            aria-label="Calendar details"
          >
            <section className="rounded-2xl border border-[var(--border)] bg-[hsl(var(--bg-surface))] p-3 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wide text-[hsl(var(--text-primary))]">
                Inquiry
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="min-w-0 text-[9px] font-bold uppercase tracking-wide text-[hsl(var(--text-secondary))]">
                  Check-in
                  <input
                    type="date"
                    value={inquiryStartDate || ""}
                    onChange={(event) =>
                      updateInquiryDate("start", event.target.value)
                    }
                    className="mt-1 block h-8 w-full rounded-lg border border-[var(--border)] bg-[hsl(var(--bg-primary))] px-2 text-[10px] font-semibold text-[hsl(var(--text-primary))] outline-none focus:ring-1 focus:ring-[hsl(var(--accent))]"
                  />
                </label>
                <label className="min-w-0 text-[9px] font-bold uppercase tracking-wide text-[hsl(var(--text-secondary))]">
                  Check-out
                  <input
                    type="date"
                    min={inquiryStartDate || undefined}
                    value={inquiryEndDate || ""}
                    onChange={(event) =>
                      updateInquiryDate("end", event.target.value)
                    }
                    className="mt-1 block h-8 w-full rounded-lg border border-[var(--border)] bg-[hsl(var(--bg-primary))] px-2 text-[10px] font-semibold text-[hsl(var(--text-primary))] outline-none focus:ring-1 focus:ring-[hsl(var(--accent))]"
                  />
                </label>
              </div>
              {inquiryStartDate &&
                inquiryEndDate &&
                inquiryEndDate > inquiryStartDate && (
                  <p className="mt-2 text-center text-[10px] font-bold text-[hsl(var(--text-secondary))]">
                    {inquiryRangeDates.length} night
                    {inquiryRangeDates.length === 1 ? "" : "s"}
                  </p>
                )}
              <div className="mt-2 grid grid-cols-4 gap-1">
                {[
                  ["Today", 0],
                  ["Tomorrow", 1],
                  ["+3 Days", 3],
                  ["+7 Days", 7],
                ].map(([label, offset]) => (
                  <Button
                    key={String(label)}
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-md px-1 text-[9px]"
                    onClick={() => setInquiryQuickRange(Number(offset))}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <Button
                className="mt-2.5 w-full rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:opacity-90"
                size="sm"
                onClick={checkInquiryAvailability}
              >
                Check Availability
              </Button>
              {inquiryResults && inquiryResults.availableCount > 0 && (
                <div className="mt-3 border-t border-[var(--border)] pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--text-secondary))]">
                    Available units
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-[hsl(var(--text-primary))]">
                    {inquiryResults.availableCount} units available
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {inquiryResults.rows
                      .filter((row) => row.available)
                      .map((row) => (
                        <div
                          key={String(row.unit?.id)}
                          className="flex items-center gap-2 rounded-lg bg-[hsl(var(--bg-primary))] px-2 py-1.5"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                unitColorMap.get(String(row.unit?.id)) ||
                                "#16a34a",
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-bold text-[hsl(var(--text-primary))]">
                              {row.unit?.unitNumber || row.unit?.name}
                            </p>
                            <p className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                              {row.unit?.type || "Available"} · AVAILABLE
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 rounded-md px-2 text-[9px]"
                            onClick={() => startInquiryBooking(row.unit)}
                          >
                            Add Booking
                          </Button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {inquiryResults && inquiryResults.availableCount === 0 && (
                <div className="mt-3 border-t border-[var(--border)] pt-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--text-primary))]">
                    No units available
                  </p>
                  <p className="mt-1 text-[10px] text-[hsl(var(--text-secondary))]">
                    No units are available for {inquiryStartDate} –{" "}
                    {inquiryEndDate}.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 rounded-lg"
                    onClick={clearInquiryRange}
                  >
                    Change Dates
                  </Button>
                </div>
              )}
              {(isAug29BlockVisible || isWinterClosureVisible) && (
                <div className="mt-3 border-t border-[var(--border)] pt-3 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-red-600">
                    {isWinterClosureVisible
                      ? "Winter closure"
                      : "Aug 29 blocked"}
                  </p>
                  <p className="mt-1 text-[10px] font-medium text-[hsl(var(--text-secondary))]">
                    {isWinterClosureVisible
                      ? "Dec 1, 2026 – Jan 31, 2027"
                      : "Except Shore 3 and 447"}
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[var(--border)] bg-[hsl(var(--bg-surface))] p-3 shadow-sm">
              {operationsBooking ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-wide text-[hsl(var(--text-primary))]">
                      Booking details
                    </h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-full"
                      onClick={() => setOperationsBooking(null)}
                      aria-label="Clear selected booking"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {selectedOperationsStatus && (
                    <>
                      <span
                        className="mt-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold"
                        style={{
                          backgroundColor: `${selectedOperationsStatus.color}1a`,
                          color: selectedOperationsStatus.color,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            backgroundColor: selectedOperationsStatus.color,
                          }}
                        />
                        {selectedOperationsStatus.label}
                      </span>
                      <p className="mt-2 truncate text-sm font-bold text-[hsl(var(--text-primary))]">
                        {getBookingGuestName(operationsBooking)}
                      </p>
                      <div className="mt-3 space-y-2 rounded-xl border border-[var(--border)] p-2.5 text-[10px]">
                        <p className="font-bold uppercase tracking-[0.16em] text-[hsl(var(--text-secondary))]">
                          Booking information
                        </p>
                        <div>
                          <p className="text-[hsl(var(--text-secondary))]">
                            Unit
                          </p>
                          <p className="truncate font-semibold text-[hsl(var(--text-primary))]">
                            {getBookingUnitName(operationsBooking)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[hsl(var(--text-secondary))]">
                            Check-in
                          </p>
                          <p className="font-semibold text-[hsl(var(--text-primary))]">
                            {formatOperationsDate(
                              selectedOperationsStatus.checkinAt,
                            )}{" "}
                            ·{" "}
                            {formatOperationsTime(
                              selectedOperationsStatus.checkinAt,
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-[hsl(var(--text-secondary))]">
                            Check-out
                          </p>
                          <p className="font-semibold text-[hsl(var(--text-primary))]">
                            {formatOperationsDate(
                              selectedOperationsStatus.checkoutAt,
                            )}{" "}
                            ·{" "}
                            {formatOperationsTime(
                              selectedOperationsStatus.checkoutAt,
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[hsl(var(--bg-primary))] p-2.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[hsl(var(--text-primary))]">
                          <TimerReset className="h-3.5 w-3.5 text-[hsl(var(--accent))]" />{" "}
                          Time Remaining
                        </div>
                        <p className="mt-1 text-lg font-bold text-[hsl(var(--text-primary))]">
                          {formatTimeRemaining(
                            selectedOperationsStatus.key === "upcoming"
                              ? selectedOperationsStatus.checkinAt
                              : selectedOperationsStatus.checkoutAt,
                            clockNow,
                          )}
                        </p>
                        <p className="text-[10px] text-[hsl(var(--text-secondary))]">
                          {selectedOperationsStatus.key === "upcoming"
                            ? "until check-in"
                            : selectedOperationsStatus.key === "checked-out"
                              ? "Checkout completed"
                              : "until checkout"}
                        </p>
                      </div>
                      <div className="mt-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--text-secondary))]">
                          Status timeline
                        </p>
                        <div className="mt-2 space-y-1.5">
                          {operationsTimeline.map((item, index) => {
                            const complete = index <= selectedTimelineStage;
                            const current = index === selectedTimelineStage;
                            return (
                              <div
                                key={item.key}
                                className={cn(
                                  "flex items-center gap-2 text-[10px]",
                                  current
                                    ? "font-bold text-[hsl(var(--text-primary))]"
                                    : "text-[hsl(var(--text-secondary))]",
                                )}
                              >
                                <span
                                  className="flex h-4 w-4 items-center justify-center rounded-full"
                                  style={{
                                    color: complete
                                      ? selectedOperationsStatus.color
                                      : "#94a3b8",
                                    backgroundColor: complete
                                      ? `${selectedOperationsStatus.color}1a`
                                      : "transparent",
                                  }}
                                >
                                  {complete ? (
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  ) : (
                                    <Circle className="h-3 w-3" />
                                  )}
                                </span>
                                {item.label}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="mt-3 w-full rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:opacity-90"
                        onClick={() => setDetailsBooking(operationsBooking)}
                      >
                        View Booking Details
                      </Button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <h2 className="text-xs font-bold uppercase tracking-wide text-[hsl(var(--text-primary))]">
                    Booking details
                  </h2>
                  <div className="mt-3 flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[hsl(var(--bg-primary))] px-4 text-center">
                    <CalendarDays className="mb-2 h-4 w-4 text-[hsl(var(--text-secondary))]" />
                    <p className="text-[11px] font-semibold text-[hsl(var(--text-primary))]">
                      Select a booking
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-[hsl(var(--text-secondary))]">
                      Click a booking bar to view the guest, stay dates,
                      payment, and status.
                    </p>
                  </div>
                </>
              )}
            </section>
          </aside>
        )}
      </div>

      {(isInquiryMode
        ? inquiryRangeDates.length > 0
        : selection.length > 0) && (
        <div
          className={cn(
            "sticky bottom-4 z-40 mx-auto flex w-fit flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[hsl(var(--bg-surface))] px-4 py-2.5 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.4)]",
            isFullScreen && "mb-4",
          )}
        >
          <div className="flex w-full flex-wrap items-center justify-center gap-3">
            <span className="text-sm font-semibold text-[hsl(var(--text-primary))]">
              {isInquiryMode ? "Inquiry: " : ""}
              {isInquiryMode ? inquiryRangeDates.length : selection.length} date
              {(isInquiryMode ? inquiryRangeDates.length : selection.length) !==
              1
                ? "s"
                : ""}{" "}
              selected
            </span>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={isInquiryMode ? clearInquiryRange : clearSelection}
            >
              <X className="mr-1.5 h-4 w-4" />
              Clear Selection
            </Button>
            {canManageOperations(role) && !isInquiryMode && (
              <Button
                size="sm"
                className="rounded-full bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:opacity-90"
                disabled={selectedRanges.length === 0}
                onClick={() => {
                  if (selectedRanges.length === 0) return;
                  const firstRange = selectedRanges[0];
                  setBookingDraft(
                    (prev) =>
                      ({
                        ...prev,
                        bookingDate: todayDateInput(),
                        checkinDate: firstRange.checkinDate,
                        checkoutDate: firstRange.checkoutDate,
                      }) as any,
                  );
                  setIsAddDialogOpen(true);
                }}
              >
                <CalendarPlus className="mr-1.5 h-4 w-4" />
                Book Selected
              </Button>
            )}
          </div>
          {isInquiryMode && inquiryResults && (
            <div className="flex w-full flex-col gap-1.5 border-t border-[var(--border)] pt-2">
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  {inquiryResults.availableCount} available
                </span>
                <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  {inquiryResults.occupiedCount} occupied
                </span>
                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  {inquiryResults.blockedCount} blocked
                </span>
              </div>
              <div className="flex max-h-24 flex-wrap items-center justify-center gap-1.5 overflow-y-auto">
                {inquiryResults.rows.map((row) => (
                  <span
                    key={String(row.unit?.id)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      row.available
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300",
                    )}
                  >
                    {row.unit?.unitNumber || row.unit?.name || "Unit"}:{" "}
                    {row.available
                      ? "Available"
                      : row.blocked > 0
                        ? "Blocked"
                        : "Occupied"}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!isFullScreen && (
        <div className="rounded-2xl border border-[var(--border)] bg-[hsl(var(--bg-surface))] px-3 py-2.5 shadow-sm">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Checked In", operationsSummary["checked-in"], "#7c3aed"],
              [
                "Due for Checkout",
                operationsSummary["due-for-checkout"],
                "#f97316",
              ],
              ["Upcoming", operationsSummary.upcoming, "#2563eb"],
              ["Checked Out", operationsSummary["checked-out"], "#94a3b8"],
            ].map(([label, count, color]) => (
              <div
                key={String(label)}
                className="flex items-center gap-2.5 rounded-xl bg-[hsl(var(--bg-primary))] px-3 py-1.5"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: String(color) }}
                />
                <span className="text-xl font-bold text-[hsl(var(--text-primary))]">
                  {count}
                </span>
                <span className="text-xs font-semibold text-[hsl(var(--text-secondary))]">
                  {label}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-[hsl(var(--text-secondary))]">
            <span className="font-semibold text-[hsl(var(--text-primary))]">
              Real-Time Monitor: {formatOperationsTime(clockNow)} ·{" "}
              {clockNow.toLocaleDateString(undefined, {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs"
              onClick={() => setSystemNow(new Date())}
            >
              Refresh Now
            </Button>
          </div>
        </div>
      )}

      <AddBookingDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        selectedRanges={selectedRanges}
        bookingDraft={bookingDraft}
        agents={agents}
        saving={saving || imageSaving}
        onSave={handleSaveSelection}
        updateDraft={updateDraft}
        setBookingDraft={setBookingDraft}
        setDraftNested={setDraftNested}
        onSaveSnapshot={handleSaveCalendarSnapshot}
        onCopyLetters={handleCopyCalendarAuthorizationLetters}
        onClearSelection={() => {
          clearSelection();
          setIsAddDialogOpen(false);
        }}
        canGenerateArtifacts={canGenerateCalendarArtifacts()}
        calendarSnapshotRef={calendarSnapshotRef}
        getRangeAutoAmount={getRangeAutoAmount}
      />

      <BookingDetailsDialog
        open={Boolean(detailsBooking)}
        onOpenChange={(open) => {
          if (!open) setDetailsBooking(null);
        }}
        detailsBooking={detailsBooking}
        setDetailsBooking={setDetailsBooking}
        agents={agents}
        units={units}
        saving={saving || imageSaving}
        onSave={handleSaveDetailsBooking}
        onSaveSnapshot={handleSaveDetailsSnapshot}
        onCopyLetter={handleCopyDetailsAuthorizationLetter}
        onCancel={handleCancelDetailsBooking}
        setDetailsNested={setDetailsNested}
        detailsSnapshotRef={detailsSnapshotRef}
        onGenerateQuotation={() => handleGenerateBookingDocument("quotation")}
        onGenerateStatement={() => handleGenerateBookingDocument("statement")}
        documentLoading={documentLoading}
      />
    </div>
  );
}

function getResponsiveContent(
  booking: any,
  span: number,
  dayWidth: string | undefined,
  _isFullScreen: boolean,
  _calendarZoom: number,
  _paymentStatus: { label: string; color: string; key: string },
  _pillStatus: { label: string; color: string; key: string },
  _unitColor: string,
  displayGuestName: (b: any) => string,
) {
  const baseDayWidth =
    typeof dayWidth === "string" ? parseInt(dayWidth) || 144 : 144;
  // `dayWidth` is already the rendered (zoomed) width. This is used only to
  // choose a readable content density; it must not alter the bar itself.
  const width = (span || 1) * baseDayWidth;
  const guestName = displayGuestName(booking);
  const initials = guestName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const statusText = getBookingLabel(booking);

  if (width <= 90) {
    return (
      <div
        className="flex h-full w-full items-center justify-center px-0.5"
        aria-label={`${guestName}${statusText ? ` — ${statusText}` : ""}`}
      >
        <span className="text-[11px] font-bold leading-none text-white">
          {initials}
        </span>
      </div>
    );
  }

  if (width <= 150) {
    return (
      <div
        className="flex h-full w-full items-center overflow-hidden px-1.5"
        aria-label={`${guestName}${statusText ? ` — ${statusText}` : ""}`}
      >
        <UserRound className="mr-1.5 h-3.5 w-3.5 shrink-0 text-white/90" />
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left text-[11px] font-bold leading-tight text-white">
          {guestName}
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full items-center overflow-hidden px-1.5"
      aria-label={`${guestName}${statusText ? ` — ${statusText}` : ""}`}
    >
      <UserRound className="mr-1.5 h-4 w-4 shrink-0 text-white/90" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate whitespace-nowrap text-left text-[11px] font-bold text-white">
          {guestName}
        </p>
        {statusText && (
          <p className="mt-0.5 truncate whitespace-nowrap text-left text-[8px] font-semibold uppercase tracking-[0.04em] text-white/85">
            {statusText}
          </p>
        )}
      </div>
    </div>
  );
}

const ReservationBar = React.memo(function ReservationBar({
  booking,
  span,
  dayWidth,
  unitColor,
  paymentStatus,
  pillStatus,
  bookingLabel: _bookingLabel,
  isFullScreen,
  calendarZoom,
  clippedStart = false,
  clippedEnd = false,
  selectedBookingIds = [],
}: {
  booking: any;
  span: number;
  dayWidth: string | undefined;
  unitColor: string;
  paymentStatus: { label: string; color: string; key: string };
  pillStatus: { label: string; color: string; key: string };
  bookingLabel: BookingLabel;
  isFullScreen: boolean;
  calendarZoom: number;
  clippedStart?: boolean;
  clippedEnd?: boolean;
  selectedBookingIds?: string[];
}) {
  const barBackgroundColor = unitColor;
  const barBorderColor = darkenHexColor(unitColor, 0.18);

  const barBorderRadius = cn(
    !clippedStart && "rounded-l-lg",
    !clippedEnd && "rounded-r-lg",
  );

  const checkinStr =
    toDateInput(booking?.checkinDate) || toDateInput(booking?.checkIn) || "";
  const checkoutStr =
    toDateInput(booking?.checkoutDate) || toDateInput(booking?.checkOut) || "";
  const bookingNights =
    checkinStr && checkoutStr
      ? Math.max(
          1,
          Math.round(
            (new Date(checkoutStr).getTime() - new Date(checkinStr).getTime()) /
              86400000,
          ),
        )
      : span;
  const isLongStay = bookingNights >= 14;

  const ids = Array.isArray(selectedBookingIds) ? selectedBookingIds : [];
  const isSelected = ids.length > 0 && ids.includes(String(booking?.id || ""));

  return (
    <div
      className={cn(
        "pointer-events-none flex h-full w-full flex-col items-start justify-center gap-0 overflow-hidden rounded-md border px-1.5 py-1 text-white shadow-none",
        barBorderRadius,
        isLongStay && "ring-2 ring-offset-1 ring-white/70",
        isSelected && "ring-2 ring-orange-300",
      )}
      style={{
        backgroundColor: barBackgroundColor,
        borderLeft: `${isLongStay ? 6 : 4}px solid ${unitColor}`,
        borderTop: `1px solid ${barBorderColor}`,
        borderRight: `1px solid ${barBorderColor}`,
        borderBottom: `1px solid ${barBorderColor}`,
      }}
    >
      {isLongStay && (
        <span className="absolute right-1 top-0.5 rounded-full bg-white/25 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white">
          Long Stay
        </span>
      )}
      {getResponsiveContent(
        booking,
        span,
        dayWidth,
        isFullScreen,
        calendarZoom,
        paymentStatus,
        pillStatus,
        unitColor,
        (b: any) =>
          b?.guestName ||
          `${b?.guestFirstName || ""} ${b?.guestLastName || ""}`.trim() ||
          "Valued Guest",
      )}
    </div>
  );
});
