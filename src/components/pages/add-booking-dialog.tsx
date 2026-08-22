"use client";

import React from "react";
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
import { ImageDown, Clipboard, Loader2, CalendarPlus, X } from "lucide-react";

// Keep the booking form separate from the calendar orchestration component.

export type BookingDraft = {
  guestFirstName: string;
  guestLastName: string;
  guestPhone: string;
  guestEmail: string;
  agentId: string;
  agentName: string;
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

export type UnitDateRange = {
  unit: any;
  checkinDate: string;
  checkoutDate: string;
  nights: number;
};

interface AddBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRanges: UnitDateRange[];
  bookingDraft: BookingDraft;
  agents: any[];
  saving: boolean;
  onSave: (event: React.FormEvent) => void;
  updateDraft: (field: keyof BookingDraft, value: any) => void;
  setBookingDraft: React.Dispatch<React.SetStateAction<BookingDraft>>;
  setDraftNested: (path: string, value: any) => void;
  onSaveSnapshot: () => void;
  onCopyLetters: () => void;
  onClearSelection: () => void;
  canGenerateArtifacts: boolean;
  calendarSnapshotRef: React.RefObject<HTMLDivElement | null>;
  getRangeAutoAmount: (range: UnitDateRange, draft: BookingDraft) => number;
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

const getUnitLabel = (unit: any) =>
  unit?.name || unit?.unitNumber || unit?.unitName || "Unnamed unit";

export function AddBookingDialog({
  open,
  onOpenChange,
  selectedRanges,
  bookingDraft,
  agents,
  saving,
  onSave,
  updateDraft,
  setBookingDraft,
  setDraftNested,
  onSaveSnapshot,
  onCopyLetters,
  onClearSelection,
  canGenerateArtifacts,
  calendarSnapshotRef,
  getRangeAutoAmount,
}: AddBookingDialogProps) {
  const getAgentLabel = (agent: any) =>
    agent?.name || agent?.fullName || agent?.agentName || "Unnamed Agent";

  const displayDraftGuestName = () => {
    const draft = bookingDraft as any;
    const explicitGuestName = String(draft.guestName || "").trim();
    const fullName =
      `${draft.guestFirstName || ""} ${draft.guestLastName || ""}`.trim();
    return explicitGuestName || fullName || "GUEST";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Booking from Calendar</DialogTitle>
          <DialogDescription>Selected Calendar Dates</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSave} className="space-y-4 pt-4">
          <div className="rounded-xl border bg-amber-50/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">
                Selected Calendar Dates
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClearSelection}
                disabled={selectedRanges.length === 0}
              >
                Clear Selection
              </Button>
            </div>
            {selectedRanges.map((range) => (
              <div
                key={`${range.unit.id}-${range.checkinDate}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 border"
              >
                <div>
                  <p className="font-bold text-gray-900">
                    {getUnitLabel(range.unit)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {range.checkinDate} → {range.checkoutDate}
                  </p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                  {range.nights} night(s)
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>First Name</Label>
              <Input
                value={bookingDraft.guestFirstName || ""}
                onChange={(e) => updateDraft("guestFirstName", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Last Name</Label>
              <Input
                value={bookingDraft.guestLastName || ""}
                onChange={(e) => updateDraft("guestLastName", e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Agent</Label>
            <select
              className="w-full h-10 border rounded-md px-3"
              value={bookingDraft.agentId || ""}
              onChange={(e) => {
                const agentId = e.target.value;
                const selectedAgent = (agents as any[]).find(
                  (a: any) => String(a.id) === String(agentId),
                );
                setBookingDraft({
                  ...bookingDraft,
                  agentId,
                  agentName: agentId ? getAgentLabel(selectedAgent) : "",
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Adults</Label>
              <Input
                type="number"
                min="1"
                value={bookingDraft.adults ?? 2}
                onChange={(e) => updateDraft("adults", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Children</Label>
              <Input
                type="number"
                min="0"
                value={bookingDraft.children ?? 0}
                onChange={(e) => updateDraft("children", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea
              value={bookingDraft.notes || ""}
              onChange={(e) => updateDraft("notes", e.target.value)}
              className="min-h-[90px]"
            />
          </div>

          <div className="rounded-xl border p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold">Pricing</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Total Amount</Label>
                <Input
                  type="number"
                  min="0"
                  value={
                    bookingDraft.isCustomAmount
                      ? (bookingDraft.totalAmount ?? 0)
                      : selectedRanges.reduce(
                          (sum, range) =>
                            sum + getRangeAutoAmount(range, bookingDraft),
                          0,
                        )
                  }
                  onChange={(e) => {
                    updateDraft("isCustomAmount", true);
                    updateDraft("totalAmount", e.target.value);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label>Nightly Rate</Label>
                <Input
                  value={
                    selectedRanges.length === 1
                      ? formatCurrency(selectedRanges[0].unit?.rate || 0)
                      : "Multiple units"
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
                  value={bookingDraft.bookingPaymentStatus || "Unpaid"}
                  onChange={(e) =>
                    setBookingDraft({
                      ...bookingDraft,
                      paymentStatus: e.target.value,
                      bookingPaymentStatus: e.target.value,
                      bookingPayment: {
                        ...(bookingDraft.bookingPayment || {}),
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
                  value={bookingDraft.bookingPayment?.amount ?? 0}
                  onChange={(e) =>
                    setDraftNested("bookingPayment.amount", e.target.value)
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Payment Date</Label>
                <Input
                  type="date"
                  value={bookingDraft.bookingPayment?.paidAt || ""}
                  onChange={(e) =>
                    setDraftNested("bookingPayment.paidAt", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Method</Label>
                <select
                  className="w-full h-10 border rounded-md px-3"
                  value={bookingDraft.bookingPayment?.method || "CASH"}
                  onChange={(e) =>
                    setDraftNested("bookingPayment.method", e.target.value)
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
                  value={bookingDraft.securityDepositStatus || "Unpaid"}
                  onChange={(e) =>
                    setBookingDraft({
                      ...bookingDraft,
                      securityDepositStatus: e.target.value,
                      securityDeposit: {
                        ...(bookingDraft.securityDeposit || {}),
                        status: e.target.value,
                      },
                      securityDepositReceipt: {
                        ...(bookingDraft.securityDepositReceipt || {}),
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
                  value={bookingDraft.securityDeposit?.amount ?? 1000}
                  onChange={(e) =>
                    setDraftNested("securityDeposit.amount", e.target.value)
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
                  value={bookingDraft.securityDepositReceipt?.amount ?? 0}
                  onChange={(e) =>
                    setDraftNested(
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
                  value={bookingDraft.securityDepositReceipt?.paidAt || ""}
                  onChange={(e) =>
                    setDraftNested(
                      "securityDepositReceipt.paidAt",
                      e.target.value,
                    )
                  }
                />
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-5">
            <Button
              type="button"
              variant="outline"
              onClick={onSaveSnapshot}
              disabled={saving || selectedRanges.length === 0}
            >
              <ImageDown className="h-4 w-4 mr-2" />
              Image
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onCopyLetters}
              disabled={saving || selectedRanges.length === 0}
            >
              <Clipboard className="h-4 w-4 mr-2" />
              Letter
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Add more dates
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
              disabled={saving || selectedRanges.length === 0}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CalendarPlus className="h-4 w-4 mr-2" />
              )}
              {saving ? "Saving..." : "Save these"}
            </Button>
          </div>
        </form>

        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-[-10000px] top-0 opacity-100"
        >
          <div
            ref={calendarSnapshotRef}
            className="overflow-hidden rounded-[36px] border-2 border-[#EFD45C] bg-[#141414] text-[#F7F4EA]"
            style={{ width: 1080, minHeight: 1480 }}
          >
            <div className="rounded-t-[34px] bg-[#EFD45C] px-14 pb-10 pt-10 text-[#0B0B0B]">
              <h2 className="mt-10 text-center text-[44px] font-bold leading-tight">
                Welcome to Manila Prime
              </h2>
            </div>
            <div className="px-[94px] pb-[54px] pt-[42px]">
              <p className="text-[36px] font-bold leading-none">
                Dear {displayDraftGuestName()},
              </p>
              <div className="mt-8 rounded-[28px] border border-[#2B2B2B] bg-[#111111] px-7 pb-7 pt-6">
                <p className="text-[30px] font-bold text-[#EFD45C]">
                  Booking Details
                </p>
                <p className="text-[27px] leading-8 text-[#F7F4EA] mt-4">
                  Unit:{" "}
                  {selectedRanges.length === 1
                    ? getUnitLabel(selectedRanges[0].unit)
                    : `${selectedRanges.length} units`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
