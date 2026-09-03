"use client";

import React, { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ImageDown,
  Clipboard,
  Loader2,
  CalendarPlus,
  Trash2,
  CalendarDays,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildBookingDepositSummary,
  getSecurityDepositDate,
  formatReadableDate,
} from "@/lib/utils-app";
import {
  bookingSourceOptions,
  getBookingSourceColor,
  getBookingSourceDisplayName,
  getBookingSourceLabel,
} from "@/lib/booking-source";


// Handles booking details and document generation.

interface BookingDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detailsBooking: any;
  setDetailsBooking: React.Dispatch<React.SetStateAction<any>>;
  agents: any[];
  units: any[];
  saving: boolean;
  onSave: () => void;
  onSaveSnapshot: () => void;
  onCopyLetter: () => void;
  onCancel: () => void;
  setDetailsNested: (path: string, value: any) => void;
  detailsSnapshotRef: React.RefObject<HTMLDivElement | null>;
  quotationSnapshotRef?: React.RefObject<HTMLDivElement | null>;
  soaSnapshotRef?: React.RefObject<HTMLDivElement | null>;
  onGenerateQuotation?: () => void;
  onGenerateStatement?: () => void;
  documentLoading?: "quotation" | "statement" | null;
  securityDeposits?: any[];
}

const toNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatCurrency = (value: any) =>
  `₱${toNumber(value, 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const toDateInput = (value?: string) => {
  if (!value) return "";
  return String(value).split("T")[0];
};

const padTwo = (value: number) => String(value).padStart(2, "0");

const todayDateInput = () => {
  const now = new Date();
  return `${now.getFullYear()}-${padTwo(now.getMonth() + 1)}-${padTwo(
    now.getDate(),
  )}`;
};

const getUnitLabel = (unit: any) =>
  unit?.name || unit?.unitNumber || unit?.unitName || "Unnamed unit";

const numberToWords = (amount: number) => {
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
};

// Temporary document numbering scheme; replace with server-side counter when available.
const buildDocumentNumber = (booking: any, prefix: string) => {
  const year = new Date().getFullYear();
  const seq = String(booking?.id || "0000")
    .slice(-4)
    .padStart(4, "0");
  return `${prefix}-${year}-${seq}`;
};

const PaymentOptionsBlock = () => (
  <div
    style={{
      marginBottom: "32px",
      marginTop: "40px",
      paddingTop: "24px",
      borderTop: "3px solid #1a1a1a",
      backgroundColor: "#f9f9f9",
      padding: "24px",
      borderRadius: "8px",
    }}
  >
    <div
      style={{
        fontSize: "16px",
        fontWeight: "900",
        marginBottom: "20px",
        letterSpacing: "2px",
        textTransform: "uppercase",
        color: "#000",
      }}
    >
      ► PAYMENT OPTIONS
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "40px",
        fontSize: "13px",
      }}
    >
      <div style={{ borderLeft: "4px solid #d4af37", paddingLeft: "16px" }}>
        <p
          style={{
            fontWeight: "900",
            fontSize: "14px",
            marginBottom: "8px",
            color: "#000",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          🏦 BDO BANK
        </p>
        <p style={{ fontSize: "13px", margin: "4px 0", fontWeight: "500" }}>
          <span style={{ fontWeight: "bold" }}>Account No.:</span>
        </p>
        <p
          style={{
            fontSize: "14px",
            margin: "0",
            fontFamily: "monospace",
            fontWeight: "bold",
            color: "#1a1a1a",
          }}
        >
          012700035484
        </p>
      </div>
      <div style={{ borderLeft: "4px solid #25d366", paddingLeft: "16px" }}>
        <p
          style={{
            fontWeight: "900",
            fontSize: "14px",
            marginBottom: "8px",
            color: "#000",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          📱 GCASH
        </p>
        <p style={{ fontSize: "13px", margin: "4px 0", fontWeight: "500" }}>
          <span style={{ fontWeight: "bold" }}>Number:</span>
        </p>
        <p
          style={{
            fontSize: "14px",
            margin: "4px 0",
            fontFamily: "monospace",
            fontWeight: "bold",
            color: "#1a1a1a",
          }}
        >
          0985 060 0545
        </p>
        <p style={{ fontSize: "12px", margin: "4px 0", fontStyle: "italic" }}>
          Account: Jo..N. P.
        </p>
      </div>
    </div>
  </div>
);

const SignatureBlock = () => (
  <div
    style={{
      fontSize: "13px",
      marginTop: "24px",
      paddingTop: "20px",
      borderTop: "2px solid #1a1a1a",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
    }}
  >
    <p
      style={{
        fontWeight: "900",
        fontSize: "13px",
        marginBottom: "16px",
        letterSpacing: "1px",
        textTransform: "uppercase",
        color: "#000",
      }}
    >
      ► AUTHORIZED REPRESENTATIVE
    </p>
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "0",
      }}
    >
      <img
        src="/rep_sig.png"
        alt="Authorized Representative Signature"
        style={{
          height: "220px",
          maxWidth: "420px",
          width: "100%",
          objectFit: "contain",
          display: "block",
          margin: "0",
          padding: 0,
          backgroundColor: "#f7f4ea",
          borderRadius: "4px",
          position: "relative",
          zIndex: 1,
        }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
          const parent = (e.target as HTMLImageElement).parentElement;
          if (parent) {
            const fallback = document.createElement("div");
            fallback.innerHTML = "✓ [Signature Applied]";
            fallback.style.color = "#999";
            fallback.style.fontSize = "12px";
            fallback.style.fontStyle = "italic";
            fallback.style.marginBottom = "10px";
            parent.insertBefore(fallback, parent.firstChild);
          }
        }}
      />
    </div>
  </div>
);

export function BookingDetailsDialog({
  open,
  onOpenChange,
  detailsBooking,
  setDetailsBooking,
  agents,
  units,
  saving,
  onSave,
  onSaveSnapshot,
  onCopyLetter,
  onCancel,
  setDetailsNested,
  detailsSnapshotRef,
  quotationSnapshotRef,
  soaSnapshotRef,
  onGenerateQuotation,
  onGenerateStatement,
  documentLoading,
  securityDeposits = [],
}: BookingDetailsDialogProps) {
  const getAgentLabel = (agent: any) =>
    agent?.name || agent?.fullName || agent?.agentName || "Unnamed Agent";
  const selectedSource = bookingSourceOptions.some(
    (source) =>
      source.value.toLowerCase() ===
      String(
        detailsBooking?.bookingSource ||
          detailsBooking?.source ||
          detailsBooking?.channel ||
          "",
      ).toLowerCase(),
  )
    ? getBookingSourceDisplayName(
        detailsBooking?.bookingSource ||
          detailsBooking?.source ||
          detailsBooking?.channel,
      )
    : "N/A";
  const selectedSourceColor = getBookingSourceColor(selectedSource);

  const toComparableUnitValues = (unit: any) =>
    [unit?.id, unit?.unitNumber, unit?.name]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());

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



  // Syncs security deposit data with canonical collection.
  const liveDepositSummary = useMemo(() => {
    if (!detailsBooking?.id || !Array.isArray(securityDeposits)) return null;
    const map = buildBookingDepositSummary(securityDeposits);
    return map.get(String(detailsBooking.id)) || null;
  }, [detailsBooking?.id, securityDeposits]);

  const getBookingUnit = (booking: any) =>
    findUnitForBooking(
      booking?.unitId ||
        booking?.unit_id ||
        booking?.unitName ||
        booking?.unitname,
    );

  const getBookingUnitName = (booking: any) => {
    const unit = getBookingUnit(booking);
    return unit?.name || booking?.unitName || booking?.unitname || "Unassigned";
  };

  const getBookingGuestName = (booking: any) => {
    const explicitGuestName = String(booking?.guestName || "").trim();
    const fullName =
      `${booking?.guestFirstName || ""} ${booking?.guestLastName || ""}`.trim();
    return explicitGuestName || fullName || "Valued Guest";
  };

  const getBookingDateValue = (booking: any) =>
    toDateInput(booking?.bookingDate) ||
    toDateInput(booking?.createdAt) ||
    todayDateInput();

  const getBookingWifiNetwork = (booking: any) => {
    const unit = getBookingUnit(booking);
    return (
      unit?.wifiNetwork || booking?.wifiNetwork || "Available upon arrival"
    );
  };

  const getBookingWifiPassword = (booking: any) => {
    const unit = getBookingUnit(booking);
    return (
      unit?.wifiPassword ||
      booking?.wifiPassword ||
      "Please ask our team upon check-in"
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

  const getDetailsDisplayedTotalAmount = () =>
    detailsBooking?.isCustomAmount
      ? toNumber(detailsBooking?.totalAmount)
      : getDetailsAutoAmount();

  const isPaidStatus = (status: any) => {
    const value = String(status || "")
      .trim()
      .toLowerCase();
    return value === "paid" || value === "received";
  };

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

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => !isOpen && onOpenChange(false)}
    >
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>View Details & Edit</DialogTitle>
          <DialogDescription>
            Review or edit the booking information.
          </DialogDescription>
        </DialogHeader>

        {detailsBooking && (
          <div className="space-y-4 pt-2">
            <div className="bg-white border rounded-xl p-5 shadow-sm mb-6 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {detailsBooking?.guestFirstName}{" "}
                    {detailsBooking?.guestLastName}
                  </h3>
                  <p className="text-sm text-gray-500 font-medium mt-1">
                    {getBookingUnitName(detailsBooking)}
                  </p>
                </div>
                <span
                  className={cn(
                    "px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider",
                    isPaidStatus(
                      detailsBooking?.paymentStatus ||
                        detailsBooking?.bookingPaymentStatus,
                    )
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700",
                  )}
                >
                  {isPaidStatus(
                    detailsBooking?.paymentStatus ||
                      detailsBooking?.bookingPaymentStatus,
                  )
                    ? "PAID"
                    : "UNPAID"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: selectedSourceColor }}
                />
                <span>Source: {selectedSource}</span>
              </div>
              <div className="h-px bg-gray-100 my-1" />
              <div className="grid grid-cols-2 gap-4 text-sm mt-1">
                <div>
                  <p className="text-gray-400 text-[10px] uppercase font-bold tracking-[0.2em] mb-1">
                    Check-In
                  </p>
                  <div className="flex items-center gap-2 font-medium text-gray-900">
                    <CalendarDays className="w-4 h-4 text-blue-500" />{" "}
                    {formatBookingCardDate(detailsBooking?.checkinDate)}
                  </div>
                </div>
                <div>
                  <p className="text-gray-400 text-[10px] uppercase font-bold tracking-[0.2em] mb-1">
                    Check-Out
                  </p>
                  <div className="flex items-center gap-2 font-medium text-gray-900">
                    <CalendarDays className="w-4 h-4 text-orange-500" />{" "}
                    {formatBookingCardDate(detailsBooking?.checkoutDate)}
                  </div>
                </div>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSave();
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>First Name</Label>
                  <Input
                    value={detailsBooking?.guestFirstName || ""}
                    onChange={(e) =>
                      setDetailsBooking({
                        ...detailsBooking,
                        guestFirstName: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Last Name</Label>
                  <Input
                    value={detailsBooking?.guestLastName || ""}
                    onChange={(e) =>
                      setDetailsBooking({
                        ...detailsBooking,
                        guestLastName: e.target.value,
                      })
                    }
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Booking Source</Label>
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: selectedSourceColor }}
                  />
                  <select
                    className="w-full h-10 border rounded-md py-0 pl-8 pr-3"
                    value={selectedSource}
                    onChange={(e) => {
                      const bookingSource = e.target.value;
                      setDetailsBooking({
                        ...detailsBooking,
                        bookingSource,
                        bookingLabel: getBookingSourceLabel(bookingSource),
                      });
                    }}
                  >
                    {bookingSourceOptions.map((source) => (
                      <option key={source.value} value={source.value}>
                        {source.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Agent</Label>
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: selectedSourceColor }}
                  />
                  <select
                    className="w-full h-10 border rounded-md py-0 pl-8 pr-3"
                    value={detailsBooking?.agentId || ""}
                    onChange={(e) => {
                      const agentId = e.target.value;
                      const selectedAgent = (agents as any[]).find(
                        (a: any) => String(a.id) === String(agentId),
                      );
                      setDetailsBooking({
                        ...detailsBooking,
                        agentId,
                        agentName: agentId ? getAgentLabel(selectedAgent) : "",
                        ...(agentId && selectedSource === "N/A"
                          ? { bookingSource: "Agent", bookingLabel: "AGENT" }
                          : {}),
                      });
                    }}
                  >
                    <option value="">No Agent</option>
                    {(agents as any[]).map((agent: any) => (
                      <option key={agent.id} value={String(agent.id)}>
                        {getAgentLabel(agent)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Unit</Label>
                  <select
                    className="w-full h-10 border rounded-md px-3"
                    value={
                      detailsBooking?.unitId || detailsBooking?.unit_id || ""
                    }
                    onChange={(e) => {
                      const nextUnit = (units as any[]).find(
                        (u: any) => String(u.id) === String(e.target.value),
                      );
                      setDetailsBooking({
                        ...detailsBooking,
                        unitId: e.target.value,
                        unit_id: e.target.value,
                        unitName: nextUnit
                          ? getUnitLabel(nextUnit)
                          : detailsBooking?.unitName,
                      });
                    }}
                    required
                  >
                    <option value="">Select Unit</option>
                    {(units as any[]).map((u: any) => (
                      <option key={u.id} value={String(u.id)}>
                        {u.name || u.unitNumber}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Booking Date</Label>
                  <Input
                    type="date"
                    value={toDateInput(detailsBooking?.bookingDate) || ""}
                    onChange={(e) =>
                      setDetailsBooking({
                        ...detailsBooking,
                        bookingDate: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Check-in</Label>
                  <Input
                    type="date"
                    value={toDateInput(detailsBooking?.checkinDate) || ""}
                    onChange={(e) =>
                      setDetailsBooking({
                        ...detailsBooking,
                        checkinDate: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Check-out</Label>
                  <Input
                    type="date"
                    value={toDateInput(detailsBooking?.checkoutDate) || ""}
                    onChange={(e) =>
                      setDetailsBooking({
                        ...detailsBooking,
                        checkoutDate: e.target.value,
                      })
                    }
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Adults</Label>
                  <Input
                    type="number"
                    min="1"
                    value={detailsBooking?.adults ?? 2}
                    onChange={(e) =>
                      setDetailsBooking({
                        ...detailsBooking,
                        adults: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Children</Label>
                  <Input
                    type="number"
                    min="0"
                    value={detailsBooking?.children ?? 0}
                    onChange={(e) =>
                      setDetailsBooking({
                        ...detailsBooking,
                        children: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea
                  value={detailsBooking?.notes || ""}
                  onChange={(e) =>
                    setDetailsBooking({
                      ...detailsBooking,
                      notes: e.target.value,
                      specialRequests: e.target.value,
                    })
                  }
                  placeholder="Guest notes, special requests, or internal remarks"
                  className="min-h-[90px]"
                />
              </div>

              <div className="rounded-xl border p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold">Pricing</p>
                    <p className="text-xs text-muted-foreground">
                      {getDetailsTotalNights()} night(s) • unit rate based
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Total Amount</Label>
                    <Input
                      type="number"
                      min="0"
                      value={
                        detailsBooking?.isCustomAmount
                          ? (detailsBooking?.totalAmount ?? 0)
                          : getDetailsDisplayedTotalAmount()
                      }
                      onChange={(e) =>
                        setDetailsBooking({
                          ...detailsBooking,
                          isCustomAmount: true,
                          totalAmount: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Nightly Rate</Label>
                    <Input
                      value={
                        getBookingUnit(detailsBooking)
                          ? formatCurrency(
                              getBookingUnit(detailsBooking)?.rate || 0,
                            )
                          : "-"
                      }
                      disabled
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border p-4 space-y-4">
                <p className="font-semibold">Booking Payment</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Payment Status</Label>
                    <select
                      className="w-full h-10 border rounded-md px-3"
                      value={
                        detailsBooking?.bookingPaymentStatus ||
                        detailsBooking?.paymentStatus ||
                        detailsBooking?.bookingPayment?.status ||
                        "Unpaid"
                      }
                      onChange={(e) =>
                        setDetailsBooking({
                          ...detailsBooking,
                          paymentStatus: e.target.value,
                          bookingPaymentStatus: e.target.value,
                          bookingPayment: {
                            ...(detailsBooking?.bookingPayment || {}),
                            status: e.target.value,
                            paymentStatus: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="Unpaid">Unpaid</option>
                      <option value="Partial">Partial</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Amount Received</Label>
                    <Input
                      type="number"
                      min="0"
                      value={detailsBooking?.bookingPayment?.amount ?? 0}
                      onChange={(e) =>
                        setDetailsNested(
                          "bookingPayment.amount",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Payment Date</Label>
                    <Input
                      type="date"
                      value={detailsBooking?.bookingPayment?.paidAt || ""}
                      onChange={(e) =>
                        setDetailsNested(
                          "bookingPayment.paidAt",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Method</Label>
                    <select
                      className="w-full h-10 border rounded-md px-3"
                      value={detailsBooking?.bookingPayment?.method || "CASH"}
                      onChange={(e) =>
                        setDetailsNested(
                          "bookingPayment.method",
                          e.target.value,
                        )
                      }
                    >
                      <option value="CASH">Cash</option>
                      <option value="GCASH">GCash</option>
                      <option value="BANK_TRANSFER">Bank</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border p-4 space-y-4">
                <p className="font-semibold">Security Deposit</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Deposit Status</Label>
                    <select
                      className="w-full h-10 border rounded-md px-3"
                      value={
                        liveDepositSummary?.depositStatus ||
                        detailsBooking?.securityDepositStatus ||
                        detailsBooking?.securityDeposit?.status ||
                        detailsBooking?.securityDepositReceipt?.status ||
                        "Unpaid"
                      }
                      onChange={(e) =>
                        setDetailsBooking({
                          ...detailsBooking,
                          securityDepositStatus: e.target.value,
                          securityDeposit: {
                            ...(detailsBooking?.securityDeposit || {}),
                            status: e.target.value,
                          },
                          securityDepositReceipt: {
                            ...(detailsBooking?.securityDepositReceipt || {}),
                            status: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="Unpaid">Unpaid</option>
                      <option value="Received">Received</option>
                      <option value="Refunded">Refunded</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Configured Amount</Label>
                    <Input
                      type="number"
                      min="0"
                      value={detailsBooking?.securityDeposit?.amount ?? 1000}
                      onChange={(e) =>
                        setDetailsNested(
                          "securityDeposit.amount",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Received Amount</Label>
                    <Input
                      type="number"
                      min="0"
                      value={
                        liveDepositSummary?.latestReceive?.amount ??
                        detailsBooking?.securityDepositReceipt?.amount ??
                        0
                      }
                      onChange={(e) =>
                        setDetailsNested(
                          "securityDepositReceipt.amount",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Received Date</Label>
                    <Input
                      type="date"
                      value={
                        (liveDepositSummary?.latestReceive?.paidAt ??
                          detailsBooking?.securityDepositReceipt?.paidAt) ||
                        ""
                      }
                      onChange={(e) =>
                        setDetailsNested(
                          "securityDepositReceipt.paidAt",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Received Method</Label>
                    <select
                      className="w-full h-10 border rounded-md px-3"
                      value={
                        liveDepositSummary?.latestReceive?.method ||
                        detailsBooking?.securityDepositReceipt?.method ||
                        "CASH"
                      }
                      onChange={(e) =>
                        setDetailsNested(
                          "securityDepositReceipt.method",
                          e.target.value,
                        )
                      }
                    >
                      <option value="CASH">Cash</option>
                      <option value="GCASH">GCash</option>
                      <option value="BANK_TRANSFER">Bank</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Received Reference</Label>
                    <Input
                      value={
                        liveDepositSummary?.latestReceive?.reference ||
                        detailsBooking?.securityDepositReceipt?.reference ||
                        ""
                      }
                      onChange={(e) =>
                        setDetailsNested(
                          "securityDepositReceipt.reference",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Complete Deposit History
                  </p>
                  {liveDepositSummary?.completeDepositHistory?.length ? (
                    <ul className="max-h-48 overflow-y-auto divide-y text-sm">
                      {liveDepositSummary.completeDepositHistory.map(
                        (record: any, idx: number) => (
                          <li
                            key={record?.id || idx}
                            className="flex items-center justify-between gap-2 py-1.5"
                          >
                            <span className="font-medium capitalize">
                              {record?.type || "receive"}
                            </span>
                            <span className="text-muted-foreground">
                              {formatReadableDate(
                                getSecurityDepositDate(record),
                              )}
                            </span>
                            <span className="font-semibold">
                              {formatCurrency(Number(record?.amount) || 0)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {record?.status || "Paid"}
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No security deposit records found in Firestore for this
                      booking.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onSaveSnapshot}
                  disabled={saving || !detailsBooking}
                >
                  <ImageDown className="mr-2 h-4 w-4" /> Save Image
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCopyLetter}
                  disabled={saving || !detailsBooking}
                >
                  <Clipboard className="mr-2 h-4 w-4" /> Copy Letter
                </Button>
                {onGenerateQuotation && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onGenerateQuotation}
                    disabled={
                      saving || !!documentLoading || !detailsBooking?.id
                    }
                  >
                    {documentLoading === "quotation" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="mr-2 h-4 w-4" />
                    )}{" "}
                    Generate Quotation
                  </Button>
                )}
                {onGenerateStatement && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onGenerateStatement}
                    disabled={
                      saving || !!documentLoading || !detailsBooking?.id
                    }
                  >
                    {documentLoading === "statement" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="mr-2 h-4 w-4" />
                    )}{" "}
                    Generate SOA
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={onCancel}
                  disabled={saving || !detailsBooking?.id}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Cancel Booking
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="gradient-btn text-white"
                >
                  {saving ? (
                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  ) : (
                    <CalendarPlus className="mr-2 h-4 w-4" />
                  )}{" "}
                  Save Edit
                </Button>
              </div>

              <div
                aria-hidden="true"
                className="pointer-events-none fixed left-[-10000px] top-0 opacity-100"
              >
                <div
                  ref={detailsSnapshotRef}
                  className="overflow-hidden rounded-[36px] border-4 border-[#EFD45C] bg-[#0B0B0B] text-[#F7F4EA]"
                  style={{
                    width: 1080,
                    minHeight: 1480,
                    fontFamily: "system-ui, -apple-system, sans-serif",
                  }}
                >
                  <div className="bg-[#EFD45C] px-[72px] pb-10 pt-12 text-[#0B0B0B] rounded-t-[32px]">
                    <div className="flex items-center gap-5">
                      <img
                        src="/manila-prime-staycation-logo.png"
                        alt="Manila Prime Staycation"
                        className="w-[72px] h-[72px] rounded-full border-[5px] border-black object-cover"
                      />
                      <div className="text-left">
                        <h2 className="text-[30px] font-black text-black leading-tight tracking-tight uppercase">
                          Manila Prime
                        </h2>
                        <p className="text-[24px] font-extrabold text-black leading-none uppercase tracking-widest mt-0.5">
                          Staycation
                        </p>
                      </div>
                    </div>
                    <h1 className="text-center text-[44px] font-black text-black leading-tight tracking-tight mt-10">
                      Welcome to Manila Prime Staycation
                    </h1>
                  </div>

                  <div className="px-[72px] pb-14 pt-12 text-left">
                    <h2 className="text-[38px] font-black text-white leading-none">
                      Dear {getBookingGuestName(detailsBooking)},
                    </h2>
                    <p className="text-[24px] text-[#A3A3A3] leading-relaxed mt-4">
                      Thank you for booking with us. We are delighted to host
                      you and hope you enjoy a smooth, comfortable, and relaxing
                      stay.
                    </p>

                    <div className="mt-10 rounded-[28px] border border-[#2B2B2B] bg-[#111111] px-10 py-9">
                      <p className="text-[28px] font-black text-[#EFD45C] tracking-wide mb-6">
                        Booking Details
                      </p>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-[#222] pb-4">
                          <span className="text-[24px] font-bold text-white w-1/3">
                            Guest Name
                          </span>
                          <span className="text-[24px] text-[#E5E5E5] w-2/3">
                            {getBookingGuestName(detailsBooking)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center border-b border-[#222] pb-4">
                          <span className="text-[24px] font-bold text-white w-1/3">
                            Unit
                          </span>
                          <span className="text-[24px] text-[#E5E5E5] w-2/3">
                            {getBookingUnitName(detailsBooking)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center border-b border-[#222] pb-4">
                          <span className="text-[24px] font-bold text-white w-1/3">
                            Booking Date
                          </span>
                          <span className="text-[24px] text-[#E5E5E5] w-2/3">
                            {formatBookingCardDate(
                              getBookingDateValue(detailsBooking),
                            )}
                          </span>
                        </div>

                        <div className="flex justify-between items-center border-b border-[#222] pb-4">
                          <span className="text-[24px] font-bold text-white w-1/3">
                            Check-in
                          </span>
                          <span className="text-[24px] text-[#E5E5E5] w-2/3">
                            {formatBookingCardDate(detailsBooking?.checkinDate)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center pb-2">
                          <span className="text-[24px] font-bold text-white w-1/3">
                            Check-out
                          </span>
                          <span className="text-[24px] text-[#E5E5E5] w-2/3">
                            {formatBookingCardDate(
                              detailsBooking?.checkoutDate,
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 rounded-[28px] border border-[#2B2B2B] bg-[#111111] px-10 py-9">
                      <p className="text-[28px] font-black text-[#EFD45C] tracking-wide mb-6">
                        Wi-Fi Access
                      </p>

                      <div className="space-y-4">
                        <div className="flex justify-between items-start border-b border-[#222] pb-4">
                          <span className="text-[24px] font-bold text-white w-1/3 mt-1">
                            Network
                          </span>
                          <span className="text-[28px] font-extrabold text-[#EFD45C] w-2/3 leading-tight">
                            {getBookingWifiNetwork(detailsBooking)}
                          </span>
                        </div>

                        <div className="flex justify-between items-start pb-2">
                          <span className="text-[24px] font-bold text-white w-1/3 mt-1">
                            Password
                          </span>
                          <span className="text-[28px] font-extrabold text-[#EFD45C] w-2/3 leading-tight">
                            {getBookingWifiPassword(detailsBooking)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 rounded-[24px] border border-[#2B2B2B] px-8 py-6 text-center">
                      <p className="text-[22px] text-[#A3A3A3] leading-relaxed">
                        Please keep this card for your arrival. Should you need
                        any assistance before check-in, our team will be happy
                        to help.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* QUOTATION SNAPSHOT */}
              <div
                aria-hidden="true"
                className="pointer-events-none fixed left-[-10000px] top-0 opacity-100"
              >
                <div
                  ref={quotationSnapshotRef}
                  style={{
                    width: 1000,
                    minHeight: 1400,
                    fontFamily: "Georgia, serif",
                    padding: "48px 56px",
                    backgroundColor: "white",
                    color: "black",
                  }}
                >

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "24px",
                      borderBottom: "2px solid black",
                      paddingBottom: "24px",
                      marginBottom: "32px",
                    }}
                  >
                    <div
                      style={{
                        width: "80px",
                        height: "80px",
                        flexShrink: 0,
                        overflow: "hidden",
                        borderRadius: "8px",
                        border: "2px solid black",
                      }}
                    >
                      <img
                        src="/manila-prime-staycation-logo.png"
                        alt="Logo"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: "18px",
                          fontWeight: "bold",
                          margin: "0",
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                        }}
                      >
                        Manila Prime Staycation
                      </p>
                      <p
                        style={{
                          fontSize: "12px",
                          fontStyle: "italic",
                          color: "#666",
                          margin: "4px 0 0 0",
                        }}
                      >
                        Property Management &amp; Maintenance Services
                      </p>
                    </div>
                  </div>

                  <h1
                    style={{
                      textAlign: "center",
                      fontSize: "28px",
                      fontWeight: "900",
                      textTransform: "uppercase",
                      letterSpacing: "3px",
                      margin: "0 0 32px 0",
                      paddingBottom: "16px",
                      borderBottom: "2px solid #d4af37",
                      color: "#1a1a1a",
                    }}
                  >
                    📋 QUOTATION
                  </h1>


                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                      fontSize: "13px",
                      marginBottom: "24px",
                    }}
                  >
                    <div>
                      <p style={{ margin: "0 0 4px 0" }}>
                        <span style={{ fontWeight: "bold" }}>Billed To:</span>
                      </p>
                      <p
                        style={{
                          margin: "0",
                          fontSize: "14px",
                          fontWeight: "500",
                        }}
                      >
                        {getBookingGuestName(detailsBooking)}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: "0 0 4px 0" }}>
                        <span style={{ fontWeight: "bold" }}>
                          Quotation No.:
                        </span>{" "}
                        {buildDocumentNumber(detailsBooking, "MPS")}
                      </p>
                      <p style={{ margin: "0" }}>
                        <span style={{ fontWeight: "bold" }}>Date:</span>{" "}
                        {formatBookingCardDate(todayDateInput())}
                      </p>
                    </div>
                  </div>


                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      marginBottom: "16px",
                      fontSize: "12px",
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: "2px solid black" }}>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "8px 4px",
                            fontWeight: "bold",
                            fontSize: "13px",
                          }}
                        >
                          Room No.
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "8px 4px",
                            fontWeight: "bold",
                            fontSize: "13px",
                          }}
                        >
                          Check-in
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "8px 4px",
                            fontWeight: "bold",
                            fontSize: "13px",
                          }}
                        >
                          Check-out
                        </th>
                        <th
                          style={{
                            textAlign: "center",
                            padding: "8px 4px",
                            fontWeight: "bold",
                            fontSize: "13px",
                          }}
                        >
                          Pax
                        </th>
                        <th
                          style={{
                            textAlign: "center",
                            padding: "8px 4px",
                            fontWeight: "bold",
                            fontSize: "13px",
                          }}
                        >
                          Nights
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "8px 4px",
                            fontWeight: "bold",
                            fontSize: "13px",
                          }}
                        >
                          Rate (Unit)
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "8px 4px",
                            fontWeight: "bold",
                            fontSize: "13px",
                          }}
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid #ccc" }}>
                        <td style={{ padding: "10px 4px", textAlign: "left" }}>
                          {getBookingUnitName(detailsBooking)}
                        </td>
                        <td style={{ padding: "10px 4px", textAlign: "left" }}>
                          {formatBookingCardDate(detailsBooking?.checkinDate)}
                        </td>
                        <td style={{ padding: "10px 4px", textAlign: "left" }}>
                          {formatBookingCardDate(detailsBooking?.checkoutDate)}
                        </td>
                        <td
                          style={{ padding: "10px 4px", textAlign: "center" }}
                        >
                          {toNumber(detailsBooking?.adults, 2) +
                            toNumber(detailsBooking?.children, 0)}
                        </td>
                        <td
                          style={{ padding: "10px 4px", textAlign: "center" }}
                        >
                          {getDetailsTotalNights()}
                        </td>
                        <td style={{ padding: "10px 4px", textAlign: "right" }}>
                          {formatCurrency(
                            toNumber(getBookingUnit(detailsBooking)?.rate, 0),
                          )}
                        </td>
                        <td style={{ padding: "10px 4px", textAlign: "right" }}>
                          {formatCurrency(getDetailsDisplayedTotalAmount())}
                        </td>
                      </tr>
                    </tbody>
                  </table>


                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      borderTop: "2px solid black",
                      paddingTop: "12px",
                      marginBottom: "16px",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "15px",
                        fontWeight: "bold",
                        margin: "0",
                      }}
                    >
                      TOTAL AMOUNT DUE&nbsp;&nbsp;
                      {formatCurrency(getDetailsDisplayedTotalAmount())}
                    </p>
                  </div>


                  <p
                    style={{
                      fontSize: "12px",
                      margin: "8px 0",
                      fontWeight: "500",
                    }}
                  >
                    <span style={{ fontWeight: "bold" }}>Amount in Words:</span>{" "}
                    {numberToWords(getDetailsDisplayedTotalAmount())}
                  </p>
                  <p style={{ fontSize: "12px", margin: "4px 0 8px 0" }}>
                    <span style={{ fontWeight: "bold" }}>Rate Basis:</span> The
                    rate shown above is based on the nightly rate of the booked
                    unit.
                  </p>
                  <p style={{ fontSize: "12px", margin: "8px 0 16px 0" }}>
                    <span style={{ fontWeight: "bold" }}>Terms:</span> Payment
                    due upon receipt of this Quotation.
                  </p>

                  <PaymentOptionsBlock />
                  <SignatureBlock />
                </div>
              </div>

              {/* SOA SNAPSHOT */}
              <div
                aria-hidden="true"
                className="pointer-events-none fixed left-[-10000px] top-0 opacity-100"
              >
                <div
                  ref={soaSnapshotRef}
                  style={{
                    width: 1000,
                    minHeight: 1400,
                    fontFamily: "Georgia, serif",
                    padding: "48px 56px",
                    backgroundColor: "white",
                    color: "black",
                  }}
                >

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "24px",
                      borderBottom: "2px solid black",
                      paddingBottom: "24px",
                      marginBottom: "32px",
                    }}
                  >
                    <div
                      style={{
                        width: "80px",
                        height: "80px",
                        flexShrink: 0,
                        overflow: "hidden",
                        borderRadius: "8px",
                        border: "2px solid black",
                      }}
                    >
                      <img
                        src="/manila-prime-staycation-logo.png"
                        alt="Logo"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: "18px",
                          fontWeight: "bold",
                          margin: "0",
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                        }}
                      >
                        Manila Prime Staycation
                      </p>
                      <p
                        style={{
                          fontSize: "12px",
                          fontStyle: "italic",
                          color: "#666",
                          margin: "4px 0 0 0",
                        }}
                      >
                        Property Management &amp; Maintenance Services
                      </p>
                    </div>
                  </div>

                  <h1
                    style={{
                      textAlign: "center",
                      fontSize: "28px",
                      fontWeight: "900",
                      textTransform: "uppercase",
                      letterSpacing: "3px",
                      margin: "0 0 32px 0",
                      paddingBottom: "16px",
                      borderBottom: "2px solid #d4af37",
                      color: "#1a1a1a",
                    }}
                  >
                    📊 STATEMENT OF ACCOUNT
                  </h1>


                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                      fontSize: "13px",
                      marginBottom: "24px",
                    }}
                  >
                    <div>
                      <p style={{ margin: "0 0 8px 0" }}>
                        <span style={{ fontWeight: "bold" }}>SOA No.:</span>{" "}
                        <span style={{ fontWeight: "500" }}>
                          {buildDocumentNumber(detailsBooking, "MPS")}
                        </span>
                      </p>
                      <p style={{ margin: "0 0 8px 0" }}>
                        <span style={{ fontWeight: "bold" }}>Date:</span>{" "}
                        {formatBookingCardDate(todayDateInput())}
                      </p>
                    </div>
                    <div>
                      <p style={{ margin: "0 0 8px 0" }}>
                        <span style={{ fontWeight: "bold" }}>Billed To:</span>{" "}
                        <span style={{ fontWeight: "500" }}>
                          {getBookingGuestName(detailsBooking)}
                        </span>
                      </p>
                    </div>
                  </div>


                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px",
                      fontSize: "13px",
                      marginBottom: "24px",
                      paddingBottom: "16px",
                      borderBottom: "1px solid #ddd",
                    }}
                  >
                    <div>
                      <p style={{ margin: "0 0 4px 0" }}>
                        <span style={{ fontWeight: "bold" }}>Project:</span>
                      </p>
                      <p
                        style={{
                          margin: "0",
                          fontSize: "14px",
                          fontWeight: "500",
                        }}
                      >
                        {getBookingUnitName(detailsBooking)}
                      </p>
                    </div>
                    <div>
                      <p style={{ margin: "0 0 4px 0" }}>
                        <span style={{ fontWeight: "bold" }}>Location:</span>
                      </p>
                      <p
                        style={{
                          margin: "0",
                          fontSize: "14px",
                          fontWeight: "500",
                        }}
                      >
                        {getBookingUnit(detailsBooking)?.address ||
                          getBookingUnit(detailsBooking)?.location ||
                          "Not specified"}
                      </p>
                    </div>
                  </div>


                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      marginBottom: "16px",
                      fontSize: "12px",
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: "2px solid black" }}>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "8px 4px",
                            fontWeight: "bold",
                            fontSize: "13px",
                            width: "70%",
                          }}
                        >
                          Description
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "8px 4px",
                            fontWeight: "bold",
                            fontSize: "13px",
                            width: "30%",
                          }}
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid #ccc" }}>
                        <td style={{ padding: "10px 4px", textAlign: "left" }}>
                          Staycation — {getDetailsTotalNights()} night(s) @{" "}
                          {formatCurrency(
                            toNumber(getBookingUnit(detailsBooking)?.rate, 0),
                          )}{" "}
                          (booked unit rate)
                        </td>
                        <td
                          style={{
                            padding: "10px 4px",
                            textAlign: "right",
                            fontWeight: "500",
                          }}
                        >
                          {formatCurrency(getDetailsDisplayedTotalAmount())}
                        </td>
                      </tr>
                      {getDetailsTotalNights() > 7 && (
                        <tr style={{ borderBottom: "1px solid #ccc" }}>
                          <td
                            style={{
                              padding: "10px 4px",
                              textAlign: "left",
                              fontStyle: "italic",
                            }}
                          >
                            Extended Stay Discount
                          </td>
                          <td
                            style={{ padding: "10px 4px", textAlign: "right" }}
                          >
                            —
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>


                  <div
                    style={{
                      borderTop: "2px solid black",
                      paddingTop: "12px",
                      marginBottom: "16px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "13px",
                        marginBottom: "8px",
                      }}
                    >
                      <span style={{ fontWeight: "bold" }}>
                        Received Payment:
                      </span>
                      <span style={{ fontWeight: "500" }}>
                        {formatCurrency(
                          toNumber(detailsBooking?.bookingPayment?.amount, 0),
                        )}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "15px",
                        fontWeight: "bold",
                      }}
                    >
                      <span>Balance Due:</span>
                      <span>
                        {formatCurrency(
                          Math.max(
                            0,
                            getDetailsDisplayedTotalAmount() -
                              toNumber(
                                detailsBooking?.bookingPayment?.amount,
                                0,
                              ),
                          ),
                        )}
                      </span>
                    </div>
                  </div>


                  <p
                    style={{
                      fontSize: "12px",
                      margin: "8px 0",
                      fontWeight: "500",
                    }}
                  >
                    <span style={{ fontWeight: "bold" }}>Amount in Words:</span>{" "}
                    {numberToWords(getDetailsDisplayedTotalAmount())}
                  </p>
                  <p style={{ fontSize: "12px", margin: "8px 0 16px 0" }}>
                    <span style={{ fontWeight: "bold" }}>Terms:</span> Payment
                    due upon receipt of this Statement of Account.
                  </p>

                  <PaymentOptionsBlock />
                  <SignatureBlock />
                </div>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
