"use client";

import { useState, useEffect, useMemo, useRef, type FormEvent } from "react";
import { useUser, useAuth } from "@/firebase";
import { apiClient } from "@/lib/api-client";
import { useAppResources } from "@/lib/app-data-store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreVertical,
  Loader2,
  Save,
  Plus,
  ImageDown,
  Clipboard,
  Trash2,
  X,
  FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  formatCurrency,
  buildBookingDepositSummary,
  todayLocalDateInput,
  tomorrowLocalDateInput,
} from "@/lib/utils-app";
import { cn } from "@/lib/utils";
import { useDialogCleanup } from "@/hooks/use-dialog-cleanup";
import html2canvas from "html2canvas";
import { BookingDetailsDialog } from "./booking-details-dialog";
import { useUserRole } from "@/hooks/use-user-role";
import { canManageOperations } from "@/auth/roles";

function dataUrlToUint8Array(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDateInput(value?: string) {
  if (!value) return "";
  return String(value).split("T")[0];
}

function numberToWords(amount: number) {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const chunk = (n: number): string => {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100)
      return `${tens[Math.floor(n / 10)]}${n % 10 ? " " + ones[n % 10] : ""}`;
    return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? " " + chunk(n % 100) : ""}`;
  };
  const whole = Math.floor(Math.max(0, amount));
  const cents = Math.round((Math.max(0, amount) - whole) * 100);
  if (whole === 0 && cents === 0) return "Zero Pesos Only";
  const parts: string[] = [];
  const millions = Math.floor(whole / 1_000_000);
  const thousands = Math.floor((whole % 1_000_000) / 1000);
  const rest = whole % 1000;
  if (millions) parts.push(`${chunk(millions)} Million`);
  if (thousands) parts.push(`${chunk(thousands)} Thousand`);
  if (rest) parts.push(chunk(rest));
  const pesos = `${parts.join(" ")} Pesos`.trim();
  return cents ? `${pesos} and ${cents}/100` : `${pesos} Only`;
}

function buildDocumentNumber(booking: any, prefix: string) {
  const year = new Date().getFullYear();
  const seq = String(booking?.id || "0000")
    .slice(-4)
    .padStart(4, "0");
  return `${prefix}-${year}-${seq}`;
}

function PaymentOptionsBlock() {
  return (
    <div className="mb-8 bg-gradient-to-r from-gray-50 to-gray-100 p-6 rounded-lg border-l-4 border-amber-500 shadow-sm">
      <p className="text-[14px] font-black mb-5 flex items-center gap-2">
        <span className="text-amber-600">💳</span> PAYMENT OPTIONS
      </p>
      <div className="grid grid-cols-2 gap-8 text-[13px]">
        <div className="bg-white p-4 rounded-md border-l-4 border-amber-600 shadow-xs">
          <p className="font-bold text-[14px] mb-3 text-amber-700">
            🏦 BDO BANK
          </p>
          <div className="space-y-1">
            <p className="text-gray-600">
              <span className="font-bold">Account No.:</span>
            </p>
            <p className="font-mono font-bold text-[14px] text-gray-900">
              012700035484
            </p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-md border-l-4 border-green-500 shadow-xs">
          <p className="font-bold text-[14px] mb-3 text-green-700">📱 GCASH</p>
          <div className="space-y-1">
            <p className="text-gray-600">
              <span className="font-bold">Number:</span>
            </p>
            <p className="font-mono font-bold text-[14px] text-gray-900">
              0985 060 0545
            </p>
            <p className="text-[12px] text-gray-500 italic mt-2">
              Account: Jo..N. P.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignatureBlock() {
  return (
    <div className="text-[13px]">
      <p className="font-bold mb-4">Prepared By:</p>
      <div className="p-0 relative overflow-visible">
        <img
          src="/representative-signature.png"
          alt="Signature"
          className="relative z-30 h-[340px] max-w-[520px] w-full object-contain bg-transparent"
        />
        <div className="relative -mt-52 z-10">
          <p className="font-bold underline mt-0">Rey Arjay R. Patiag</p>
          <p className="mt-0">Authorized Representative</p>
        </div>
      </div>
    </div>
  );
}

export default function BookingsClient() {
  const { user } = useUser();
  const { role } = useUserRole();
  const auth = useAuth();
  const { toast } = useToast();

  const bookingsResources = useAppResources([
    "bookings",
    "units",
    "security-deposits",
  ]);
  const bookings = bookingsResources.data["bookings"] ?? [];
  const units = bookingsResources.data["units"] ?? [];
  const securityDeposits = bookingsResources.data["security-deposits"] ?? [];
  const loading = bookingsResources.loading;

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUnitId, setFilterUnitId] = useState("all");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<any>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [documentLoading, setDocumentLoading] = useState<
    "quotation" | "statement" | null
  >(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  const bookingSummaryCardRef = useRef<HTMLDivElement | null>(null);
  const quotationSnapshotRef = useRef<HTMLDivElement | null>(null);
  const soaSnapshotRef = useRef<HTMLDivElement | null>(null);

  useDialogCleanup(isDialogOpen);

  useEffect(() => {
    let cancelled = false;
    const loadAgents = async () => {
      setAgentsLoading(true);
      try {
        const data = await apiClient.get<any[]>("/agents", auth);
        if (!cancelled) setAgents(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!cancelled) setAgents([]);
      } finally {
        if (!cancelled) setAgentsLoading(false);
      }
    };
    loadAgents();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const unitsById = useMemo(() => {
    const map = new Map<string, any>();
    units.forEach((u) => map.set(String(u.id).trim().toLowerCase(), u));
    return map;
  }, [units]);

  const findUnitForBooking = (rawUnitId: any) => {
    if (!rawUnitId) return null;
    return unitsById.get(String(rawUnitId).trim().toLowerCase()) || null;
  };

  const securityDepositSummaryByBooking = useMemo(
    () => buildBookingDepositSummary(securityDeposits),
    [securityDeposits],
  );

  const bookingsWithDeposits = useMemo(
    () =>
      bookings.map((booking) => ({
        ...booking,
        securityDepositSummary:
          securityDepositSummaryByBooking.get(String(booking.id)) || null,
      })),
    [bookings, securityDepositSummaryByBooking],
  );

  const getBookingDateValue = (booking: any) =>
    booking?.bookingDate ||
    booking?.createdAt ||
    booking?.checkinDate ||
    new Date().toISOString();

  const selectedUnit = useMemo(
    () => findUnitForBooking(editingBooking?.unitId || editingBooking?.unit_id),
    [editingBooking?.unitId, editingBooking?.unit_id, unitsById],
  );

  const totalNights = useMemo(() => {
    const checkin = editingBooking?.checkinDate
      ? new Date(editingBooking.checkinDate)
      : null;
    const checkout = editingBooking?.checkoutDate
      ? new Date(editingBooking.checkoutDate)
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
  }, [editingBooking?.checkinDate, editingBooking?.checkoutDate]);

  const autoCalculatedAmount = useMemo(() => {
    if (!selectedUnit) return toNumber(editingBooking?.totalAmount);
    const adults = toNumber(editingBooking?.adults, 2);
    const children = toNumber(editingBooking?.children, 0);
    const baseOccupancy = toNumber(
      selectedUnit?.capacity ?? selectedUnit?.baseOccupancy,
      0,
    );
    const extraGuests = Math.max(0, adults + children - baseOccupancy);
    const nightlyRate = toNumber(selectedUnit?.rate, 0);
    const extraGuestFee = toNumber(selectedUnit?.extraGuestFee, 0);
    return Math.max(
      0,
      totalNights * (nightlyRate + extraGuests * extraGuestFee),
    );
  }, [
    selectedUnit,
    editingBooking?.adults,
    editingBooking?.children,
    totalNights,
    editingBooking?.totalAmount,
  ]);

  const displayedTotalAmount = editingBooking?.isCustomAmount
    ? toNumber(editingBooking?.totalAmount)
    : autoCalculatedAmount;

  // --- Image / Content Builders ---
  const sanitizePathSegment = (value: string | undefined, fallback: string) => {
    return (value || fallback)
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "-");
  };

  const buildBookingImageRelativePath = (booking: any) => {
    const date = toDateInput(getBookingDateValue(booking)).replace(/-/g, "");
    const unitName = sanitizePathSegment(
      findUnitForBooking(booking?.unitId)?.name || booking?.unitName,
      "Unit",
    );
    const identifier = sanitizePathSegment(
      booking?.id || `${booking?.guestFirstName}-${booking?.guestLastName}`,
      "booking",
    );
    return `ManilaPrime/Bookings/${date}_${unitName}_${identifier}.png`;
  };

  const buildQuotationImageRelativePath = (booking: any) => {
    const identifier = sanitizePathSegment(
      booking?.id || `${booking?.guestFirstName}-${booking?.guestLastName}`,
      "booking",
    );
    return `ManilaPrime/Quotations/${buildDocumentNumber(booking, "MPS")}_${identifier}.png`;
  };

  const buildSoaImageRelativePath = (booking: any) => {
    const identifier = sanitizePathSegment(
      booking?.id || `${booking?.guestFirstName}-${booking?.guestLastName}`,
      "booking",
    );
    return `ManilaPrime/SOA/${buildDocumentNumber(booking, "MPS")}_${identifier}.png`;
  };

  const formatBookingCardDate = (value: string | undefined) => {
    if (!value) return "-";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? toDateInput(value)
      : parsed.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
  };

  const getBookingGuestName = (booking: any) =>
    `${booking?.guestFirstName || ""} ${booking?.guestLastName || ""}`.trim() ||
    booking?.guestName ||
    "Valued Guest";
  const getBookingUnitName = (booking: any) =>
    findUnitForBooking(booking?.unitId)?.name ||
    booking?.unitName ||
    "Unassigned";
  const getBookingWifiNetwork = (booking: any) =>
    findUnitForBooking(booking?.unitId)?.wifiNetwork ||
    booking?.wifiNetwork ||
    "Available upon arrival";
  const getBookingWifiPassword = (booking: any) =>
    findUnitForBooking(booking?.unitId)?.wifiPassword ||
    booking?.wifiPassword ||
    "Please ask our team upon check-in";

  const handleCopyAuthorizationLetter = async () => {
    if (!editingBooking) return;
    const text = `Dear Admin,\n\nI'm Rey Arjay Rojo Patiag, SPA of the said unit, please allow my GUEST\nto enter and stay in the said unit from ${toDateInput(editingBooking?.checkinDate)} to ${toDateInput(editingBooking?.checkoutDate)}\n\nUNIT: ${getBookingUnitName(editingBooking)}\n\nGUEST:\n${getBookingGuestName(editingBooking)}\n\nThank you very much!`;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Letter copied", description: "Ready to paste." });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: e.message,
      });
    }
  };

  const handleSaveBookingImage = async () => {
    if (!editingBooking || !bookingSummaryCardRef.current) return;
    try {
      const canvas = await html2canvas(bookingSummaryCardRef.current, {
        backgroundColor: "#0B0B0B",
        scale: 2,
      });
      const relativePath = buildBookingImageRelativePath(editingBooking);
      const { mkdir, writeFile, BaseDirectory } =
        await import("@tauri-apps/plugin-fs");
      await mkdir("ManilaPrime/Bookings", {
        baseDir: BaseDirectory.Desktop,
        recursive: true,
      });
      await writeFile(
        relativePath,
        dataUrlToUint8Array(canvas.toDataURL("image/png")),
        { baseDir: BaseDirectory.Desktop },
      );
      toast({
        title: "Image saved",
        description: `Saved to Desktop/${relativePath}`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Image save failed",
        description: error.message,
      });
    }
  };

  const handleGenerateQuotation = async () => {
    if (!editingBooking || !quotationSnapshotRef.current) return;
    setDocumentLoading("quotation");
    try {
      const canvas = await html2canvas(quotationSnapshotRef.current, {
        backgroundColor: "#FFFFFF",
        scale: 2,
      });
      const relativePath = buildQuotationImageRelativePath(editingBooking);
      const { mkdir, writeFile, BaseDirectory } =
        await import("@tauri-apps/plugin-fs");
      await mkdir("ManilaPrime/Quotations", {
        baseDir: BaseDirectory.Desktop,
        recursive: true,
      });
      await writeFile(
        relativePath,
        dataUrlToUint8Array(canvas.toDataURL("image/png")),
        { baseDir: BaseDirectory.Desktop },
      );
      toast({
        title: "Quotation saved",
        description: `Saved to Desktop/${relativePath}`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Quotation save failed",
        description: error.message,
      });
    } finally {
      setDocumentLoading(null);
    }
  };

  const handleGenerateStatement = async () => {
    if (!editingBooking || !soaSnapshotRef.current) return;
    setDocumentLoading("statement");
    try {
      const canvas = await html2canvas(soaSnapshotRef.current, {
        backgroundColor: "#FFFFFF",
        scale: 2,
      });
      const relativePath = buildSoaImageRelativePath(editingBooking);
      const { mkdir, writeFile, BaseDirectory } =
        await import("@tauri-apps/plugin-fs");
      await mkdir("ManilaPrime/SOA", {
        baseDir: BaseDirectory.Desktop,
        recursive: true,
      });
      await writeFile(
        relativePath,
        dataUrlToUint8Array(canvas.toDataURL("image/png")),
        { baseDir: BaseDirectory.Desktop },
      );
      toast({
        title: "Statement saved",
        description: `Saved to Desktop/${relativePath}`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Statement save failed",
        description: error.message,
      });
    } finally {
      setDocumentLoading(null);
    }
  };

  const makeDefaultBooking = () => {
    const today = todayLocalDateInput();
    const tomorrow = tomorrowLocalDateInput();
    return {
      paymentStatus: "Unpaid",
      bookingDate: today,
      checkinDate: today,
      checkoutDate: tomorrow,
      adults: 2,
      children: 0,
      agentId: "",
      agentName: "",
      isCustomAmount: false,
      totalAmount: 0,
      securityDeposit: { amount: 1000, status: "Unpaid" },
      bookingPayment: {
        amount: 0,
        paidAt: today,
        method: "CASH",
        reference: "",
        notes: "",
      },
      securityDepositReceipt: {
        amount: 0,
        paidAt: today,
        method: "CASH",
        reference: "",
        notes: "",
        refundAmount: 0,
        refundPaidAt: today,
        refundMethod: "CASH",
        refundReference: "",
        refundNotes: "",
      },
    };
  };

  const normalizeBookingForEdit = (booking: any) => {
    const depositSummary = booking?.securityDepositSummary;
    const receiveRecord = depositSummary?.latestReceive || {};
    const refundRecord = depositSummary?.latestRefund || {};
    const depositStatus = depositSummary?.status || "Unpaid";

    return {
      ...makeDefaultBooking(),
      ...booking,
      bookingDate: toDateInput(booking?.bookingDate || booking?.createdAt),
      checkinDate: toDateInput(booking?.checkinDate),
      checkoutDate: toDateInput(booking?.checkoutDate),
      adults: toNumber(booking?.adults, 2),
      children: toNumber(booking?.children, 0),
      isCustomAmount: Boolean(booking?.isCustomAmount),
      totalAmount: toNumber(booking?.totalAmount),
      paymentStatus: booking?.paymentStatus || "Unpaid",
      bookingPaymentStatus: booking?.paymentStatus || "Unpaid",
      securityDepositStatus: depositStatus,
      securityDeposit: {
        amount: toNumber(receiveRecord?.amount ?? 1000, 1000),
        status: depositStatus,
      },
      bookingPayment: {
        amount: toNumber(booking?.bookingPayment?.amount, 0),
        paidAt: toDateInput(booking?.bookingPayment?.paidAt),
        method: booking?.bookingPayment?.method || "CASH",
        reference: booking?.bookingPayment?.reference || "",
        notes: booking?.bookingPayment?.notes || "",
        status: booking?.paymentStatus || "Unpaid",
        paymentStatus: booking?.paymentStatus || "Unpaid",
      },
      securityDepositReceipt: {
        amount: toNumber(receiveRecord?.amount ?? 0, 0),
        paidAt: toDateInput(receiveRecord?.paidAt),
        method: receiveRecord?.method || "CASH",
        reference: receiveRecord?.reference || "",
        notes: receiveRecord?.notes || "",
        status: depositStatus,
        refundAmount: toNumber(refundRecord?.amount ?? 0, 0),
        refundPaidAt: toDateInput(refundRecord?.paidAt),
        refundMethod: refundRecord?.method || "CASH",
        refundReference: refundRecord?.reference || "",
      },
    };
  };

  const setNested = (path: string, value: any) => {
    setEditingBooking((prev: any) => {
      const next = { ...(prev || {}) };
      const parts = path.split(".");
      let cursor = next;
      for (let i = 0; i < parts.length - 1; i++) {
        cursor[parts[i]] = { ...(cursor[parts[i]] || {}) };
        cursor = cursor[parts[i]];
      }
      cursor[parts[parts.length - 1]] = value;
      return next;
    });
  };

  // --- API INTERACTIONS ---
  // PERFORMANCE FIX: We removed redundant db calls. 1 API call does everything via the backend.
  const handleSaveBooking = async (e?: FormEvent) => {
    if (!canManageOperations(role)) return;
    e?.preventDefault();
    setFormLoading(true);
    try {
      const paymentStatus = editingBooking?.paymentStatus || "Unpaid";
      const depositStatus = editingBooking?.securityDepositStatus || "Unpaid";
      const selectedAgent = agents.find(
        (a: any) => String(a.id) === String(editingBooking?.agentId || ""),
      );
      // Since the input is always editable, if the user hasn't edited it manually (isCustomAmount = false),
      // we still want to send the displayed auto-calculated amount as a custom amount to lock it in.
      const finalTotalAmount = editingBooking?.isCustomAmount
        ? toNumber(editingBooking?.totalAmount)
        : autoCalculatedAmount;

      const payload = {
        ...editingBooking,
        uid: user?.uid,
        isCustomAmount: true,
        agentName: selectedAgent?.name || "",
        totalAmount: finalTotalAmount,
        paymentStatus,
        bookingPaymentStatus: paymentStatus,
        securityDepositStatus: depositStatus,
        securityDeposit: {
          amount: toNumber(editingBooking?.securityDeposit?.amount, 1000),
          status: depositStatus,
        },
        bookingPayment: {
          ...editingBooking.bookingPayment,
          status: paymentStatus,
          paymentStatus,
        },
        securityDepositReceipt: {
          ...editingBooking.securityDepositReceipt,
          status: depositStatus,
        },
      };

      let savedBookingId = editingBooking?.id || "";
      if (editingBooking?.id) {
        await apiClient.put(`/booking/${editingBooking.id}`, payload, auth);
        toast({ title: "Success", description: "Booking updated." });
      } else {
        const res = await apiClient.post<any>("/booking", payload, auth);
        savedBookingId = res?.id || res?.data?.id || "";
        toast({ title: "Success", description: "New booking created." });
      }

      // Auto-create agent commission expense
      if (editingBooking?.agentId && selectedAgent) {
        const checkin = new Date(editingBooking.checkinDate);
        const checkout = new Date(editingBooking.checkoutDate);
        const nights = Math.max(
          1,
          Math.round(
            (checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24),
          ),
        );
        const baseRate = toNumber(selectedUnit?.rate, 0);

        const commissionAmount = Math.max(
          0,
          finalTotalAmount - baseRate * nights,
        );

        if (commissionAmount > 0) {
          const guestName =
            `${editingBooking.guestFirstName || ""} ${editingBooking.guestLastName || ""}`.trim();
          try {
            // Deterministic ID to prevent duplicates on retry/resubmit
            const commissionId = `agent-commission-${savedBookingId}-${editingBooking.agentId}`;
            await apiClient.post(
              "/expense",
              {
                id: commissionId,
                uid: user?.uid,
                title: `Commission - ${selectedAgent.name} - ${guestName}`,
                category: "Agent Commission",
                agentId: editingBooking.agentId,
                agentName: selectedAgent.name || "",
                bookingId: savedBookingId,
                amount: Math.round(commissionAmount * 100) / 100,
                date: editingBooking.checkinDate,
                commissionStatus: "on hold",
                unitId: editingBooking.unitId || "",
                unitName: selectedUnit?.name || "",
                paymentMethod: "CASH",
                notes: `Auto-generated commission for ${guestName} (${nights} nights)`,
                createdAt: new Date().toISOString(),
              },
              auth,
            );
          } catch (err) {
            console.error("Failed to create agent commission:", err);
          }
        }
      }

      setIsDialogOpen(false);
      // Realtime Firestore listeners already propagate the new booking and the
      // auto-generated ledger records to this and every other page the moment
      // they are written. A forced full re-fetch would both block the save
      // spinner on 3 GETs AND suppress those realtime updates for 5s, so we only
      // invalidate the dependent caches for other pages and let realtime sync.
      bookingsResources.invalidate(["booking-payments", "security-deposits"]);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteBooking = async (booking: any) => {
    if (!canManageOperations(role)) return;
    if (
      !confirm(
        `Delete booking for ${booking?.guestFirstName}? This will remove it permanently.`,
      )
    )
      return;
    setFormLoading(true);
    try {
      await apiClient.delete(`/booking/${booking.id}`, auth);
      toast({
        title: "Deleted",
        description: "The booking and ledgers were removed.",
      });
      if (editingBooking?.id === booking.id) {
        setIsDialogOpen(false);
        setEditingBooking(null);
      }
      await bookingsResources.refresh();
      // Invalidate payment/deposit caches so Payments page shows fresh data
      bookingsResources.invalidate(["booking-payments", "security-deposits"]);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: error?.message,
      });
    } finally {
      setFormLoading(false);
    }
  };

  // --- RENDERING ---
  const filteredAndSortedBookings = useMemo(() => {
    const filtered = bookingsWithDeposits.filter((b) => {
      const s = searchTerm.toLowerCase();
      const u = findUnitForBooking(b.unitId)?.name?.toLowerCase() || "";
      const matchesSearch =
        (b.guestFirstName || "").toLowerCase().includes(s) ||
        (b.guestLastName || "").toLowerCase().includes(s) ||
        u.includes(s);
      const matchesUnit =
        filterUnitId === "all" || String(b.unitId) === filterUnitId;
      const matchesStatus =
        filterPaymentStatus === "all" ||
        (b.paymentStatus || "Unpaid").toLowerCase() === filterPaymentStatus;

      let matchesDate = true;
      if (b.checkinDate) {
        const d = b.checkinDate.split("T")[0];
        if (startDate && d < startDate) matchesDate = false;
        if (endDate && d > endDate) matchesDate = false;
      }
      return matchesSearch && matchesUnit && matchesStatus && matchesDate;
    });

    const today = todayLocalDateInput();
    const upcoming = filtered
      .filter((b) => (b.checkinDate || "") >= today)
      .sort((a, b) => (a.checkinDate || "").localeCompare(b.checkinDate || ""));
    const past = filtered
      .filter((b) => (b.checkinDate || "") < today)
      .sort((a, b) => (b.checkinDate || "").localeCompare(a.checkinDate || ""));
    return [...upcoming, ...past];
  }, [
    bookingsWithDeposits,
    searchTerm,
    unitsById,
    filterUnitId,
    filterPaymentStatus,
    startDate,
    endDate,
  ]);

  const getStatusColor = (status: string) => {
    switch ((status || "").toLowerCase()) {
      case "paid":
        return "bg-green-500 text-white border-none";
      case "partial":
        return "bg-blue-500 text-white border-none";
      case "received":
        return "bg-orange-500 text-white border-none";
      case "refunded":
        return "bg-slate-600 text-white border-none";
      case "unpaid":
        return "bg-red-500 text-white border-none";
      default:
        return "bg-gray-100";
    }
  };

  if (loading)
    return (
      <div className="flex justify-center min-h-[40vh] items-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 text-left">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Bookings</h1>
          <p className="text-muted-foreground">
            Manage your staycation reservations
          </p>
        </div>
        <Button
          className="gradient-btn text-white"
          disabled={!canManageOperations(role)}
          onClick={() => {
            setEditingBooking(makeDefaultBooking());
            setIsDialogOpen(true);
          }}
        >
          {canManageOperations(role) && (
            <>
              <Plus className="h-4 w-4 mr-2" /> New Booking
            </>
          )}
        </Button>
      </div>

      <div className="bg-white p-4 rounded-xl border shadow-sm space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">
              Search
            </Label>
            <Input
              placeholder="Guest name or unit..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-36 space-y-1">
            <Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">
              Unit
            </Label>
            <select
              className="w-full px-3 h-10 border rounded-md text-sm"
              value={filterUnitId}
              onChange={(e) => setFilterUnitId(e.target.value)}
            >
              <option value="all">All Units</option>
              {units.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name || u.unitNumber}
                </option>
              ))}
            </select>
          </div>
          <div className="w-36 space-y-1">
            <Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">
              Status
            </Label>
            <select
              className="w-full px-3 h-10 border rounded-md text-sm"
              value={filterPaymentStatus}
              onChange={(e) => setFilterPaymentStatus(e.target.value)}
            >
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
          <div className="w-40 space-y-1">
            <Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">
              From
            </Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="w-40 space-y-1">
            <Label className="text-xs text-gray-500 font-bold uppercase tracking-wider">
              To
            </Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          {(searchTerm ||
            filterUnitId !== "all" ||
            filterPaymentStatus !== "all" ||
            startDate ||
            endDate) && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearchTerm("");
                setFilterUnitId("all");
                setFilterPaymentStatus("all");
                setStartDate("");
                setEndDate("");
              }}
              className="text-red-600"
            >
              <X className="h-4 w-4 mr-2" /> Clear
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-md overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead className="font-bold">Check-in</TableHead>
              <TableHead className="font-bold">Guest</TableHead>
              <TableHead className="font-bold">Unit</TableHead>
              <TableHead className="font-bold">Status</TableHead>
              <TableHead className="text-right font-bold">Total</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedBookings.map((booking) => (
              <TableRow
                key={booking.id}
                className={cn(
                  (booking.checkinDate || "") < todayLocalDateInput() &&
                    "bg-gray-50/50 opacity-80 hover:opacity-100",
                )}
              >
                <TableCell className="font-bold">
                  {booking.checkinDate?.split("T")[0]}
                </TableCell>
                <TableCell className="font-bold">
                  {booking.guestFirstName} {booking.guestLastName}
                </TableCell>
                <TableCell>
                  {findUnitForBooking(booking.unitId)?.name || "N/A"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge className={getStatusColor(booking.paymentStatus)}>
                      {booking.paymentStatus || "Unpaid"}
                    </Badge>
                    <Badge
                      className={getStatusColor(
                        securityDepositSummaryByBooking.get(String(booking.id))
                          ?.status || "Unpaid",
                      )}
                    >
                      Deposit:{" "}
                      {securityDepositSummaryByBooking.get(String(booking.id))
                        ?.status || "Unpaid"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right font-bold">
                  {formatCurrency(booking.totalAmount)}
                </TableCell>
                <TableCell>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setEditingBooking(normalizeBookingForEdit(booking));
                          setIsDialogOpen(true);
                        }}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600"
                        onSelect={(e) => {
                          e.preventDefault();
                          handleDeleteBooking(booking);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <BookingDetailsDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingBooking(null);
          }
        }}
        detailsBooking={editingBooking}
        setDetailsBooking={setEditingBooking}
        agents={agents}
        units={units}
        saving={formLoading}
        onSave={() => handleSaveBooking()}
        onSaveSnapshot={handleSaveBookingImage}
        onCopyLetter={handleCopyAuthorizationLetter}
        onCancel={() => {
          if (editingBooking?.id) {
            handleDeleteBooking(editingBooking);
          } else {
            setIsDialogOpen(false);
            setEditingBooking(null);
          }
        }}
        setDetailsNested={setNested}
        securityDeposits={securityDeposits}
        detailsSnapshotRef={bookingSummaryCardRef}
        quotationSnapshotRef={quotationSnapshotRef}
        soaSnapshotRef={soaSnapshotRef}
        onGenerateQuotation={handleGenerateQuotation}
        onGenerateStatement={handleGenerateStatement}
        documentLoading={documentLoading}
      />
    </div>
  );
}
