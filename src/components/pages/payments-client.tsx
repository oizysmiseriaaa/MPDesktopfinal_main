"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useUser, useAuth } from "@/firebase";
import { apiClient } from "@/lib/api-client";
import { useAppResources, useAppDataStore } from "@/lib/app-data-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Plus,
  Trash2,
  Undo2,
  MoreVertical,
  Edit2,
  DollarSign,
  AlertCircle,
  ShieldCheck,
  CheckCircle,
  RotateCcw,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/use-user-role";
import { canManageOperations } from "@/auth/roles";
import {
  formatCurrency,
  parseLocalOnly,
  getSecurityDepositDate,
  formatReadableDateTime,
  summarizeSecurityDeposits,
  filterSecurityDeposits,
  looksLikeFirestoreId,
  todayLocalDateInput,
} from "@/lib/utils-app";
import { useDateStore } from "@/lib/date-store";
import { useDialogCleanup } from "@/hooks/use-dialog-cleanup";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function PaymentsClient() {
  const { role } = useUserRole();
  const { user } = useUser();
  const auth = useAuth();
  const { toast } = useToast();
  const { month, year } = useDateStore();

  const paymentsResources = useAppResources([
    "booking-payments",
    "security-deposits",
    "bookings",
    "units",
  ]);
  const bookingPayments = paymentsResources.data["booking-payments"] ?? [];
  const securityDeposits = paymentsResources.data["security-deposits"] ?? [];
  const bookings = paymentsResources.data["bookings"] ?? [];
  const units = paymentsResources.data["units"] ?? [];
  const loading = paymentsResources.loading;
  const [formLoading, setFormLoading] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");
  const [isCollectionOpen, setIsCollectionOpen] = useState(false);
  const [isCollectionEditMode, setIsCollectionEditMode] = useState(false);
  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"payments" | "deposits">(
    "payments",
  );

  // Sorting / search / pagination state for the transactions table.
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useDialogCleanup(isCollectionOpen || isRefundOpen);

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  const depositBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    securityDeposits.forEach((d) => {
      const bId = String(d.bookingId);
      const amt = Number(d.amount) || 0;
      if (!balances[bId]) balances[bId] = 0;
      if (d.type === "receive") balances[bId] += amt;
      else if (d.type === "refund") balances[bId] -= amt;
    });
    return balances;
  }, [securityDeposits]);

  // The Security Deposit Ledger is a transaction log: every document from the
  // security-deposits collection must appear as its own row (no month skipping).
  const depositLedger = useMemo(
    () => securityDeposits.map((d) => ({ ...d, _type: "deposit" as const })),
    [securityDeposits],
  );

  const mergedLedger = useMemo(() => {
    const payments = bookingPayments.map((p) => ({
      ...p,
      _type: "payment" as const,
      ledgerDate: p.paidAt || p.date || "",
    }));
    return payments
      .filter((item) => item.ledgerDate?.startsWith(monthKey))
      .sort(
        (a, b) =>
          new Date(b.ledgerDate).getTime() - new Date(a.ledgerDate).getTime(),
      );
  }, [bookingPayments, monthKey]);

  const filteredLedger = useMemo(() => {
    if (activeTab === "payments") return mergedLedger;
    if (activeTab === "deposits") return depositLedger;
    return [...mergedLedger, ...depositLedger];
  }, [mergedLedger, depositLedger, activeTab]);

  // Derive a human-readable transaction type for the compact table.
  const getTransactionType = (item: any) => {
    const type = String(
      item.type || item.transactionType || item._type || "",
    ).toLowerCase();
    if (type.includes("refund") || item.status?.toLowerCase() === "refunded") {
      return "Refunded";
    }
    if (
      type.includes("adjust") ||
      type.includes("correction") ||
      type.includes("additional")
    ) {
      return "Adjustment";
    }
    if (item._type === "payment" || type.includes("income")) {
      return "Received";
    }
    if (type === "receive") {
      return "Received";
    }
    return "Deposit";
  };

  // Resolve the booking/listing source so the Payment Method column can show a
  // platform logo (Airbnb / Booking.com / Facebook) when available.
  const normalizeSourceReference = (item: any, booking: any) => {
    const rawReference = String(
      item.reference ||
        booking?.source ||
        booking?.bookingSource ||
        item.source ||
        "",
    ).trim();
    const value = rawReference.toLowerCase();
    // Don't surface a raw Firestore/Auth ID as the "reference".
    if (looksLikeFirestoreId(rawReference)) {
      return { label: "Unknown", icon: "" };
    }
    if (value.includes("airbnb"))
      return { label: "Airbnb", icon: "/images/airbnb_logo.png" };
    if (value.includes("booking"))
      return { label: "Booking.com", icon: "/images/booking_logo.png" };
    if (value.includes("facebook"))
      return { label: "Facebook Page", icon: "/images/facebook_logo.png" };
    return { label: rawReference || "Unknown", icon: "" };
  };

  // Enrich each row with display helpers used by sorting + rendering.
  const displayRows = useMemo(() => {
    const rows = filteredLedger.map((item) => {
      const booking = bookings.find(
        (b) => String(b.id) === String(item.bookingId),
      );
      const unit = units.find(
        (u) => String(u.id) === String(item.unitId || booking?.unitId),
      );
      const unitNumber =
        unit?.unitNumber ||
        item.unitName ||
        booking?.unitName ||
        unit?.name ||
        "N/A";
      const guestName =
        item.guestName ||
        (booking
          ? `${booking.guestFirstName || ""} ${booking.guestLastName || ""}`.trim()
          : "") ||
        "N/A";
      const method = item.method || item.paymentMethod || "CASH";
      const source = normalizeSourceReference(item, booking);
      const txnType = getTransactionType(item);
      const isIncome = item._type === "payment";
      const isRefund =
        item.type === "refund" || item.status?.toLowerCase() === "refunded";
      const date =
        getSecurityDepositDate(item) ||
        item.paidAt ||
        item.date ||
        item.ledgerDate ||
        "";
      const dateDisplay = formatReadableDateTime(date);
      return {
        item,
        txnType,
        date,
        dateLabel:
          dateDisplay.date !== "—"
            ? `${dateDisplay.date}${dateDisplay.time ? " • " + dateDisplay.time : ""}`
            : "—",
        guestName,
        unitNumber,
        method,
        source,
        isIncome,
        isRefund,
        amount: Number(item.amount) || 0,
        status: String(
          item.status || (isIncome ? "Paid" : isRefund ? "Refunded" : "Paid"),
        ),
      };
    });

    // Search filter across guest, unit, method, and transaction type.
    const needle = searchTerm.trim().toLowerCase();
    const searched = needle
      ? rows.filter(
          (r) =>
            r.guestName.toLowerCase().includes(needle) ||
            r.unitNumber.toLowerCase().includes(needle) ||
            r.method.toLowerCase().includes(needle) ||
            r.txnType.toLowerCase().includes(needle) ||
            r.status.toLowerCase().includes(needle),
        )
      : rows;

    // Sorting on all columns.
    const sorted = [...searched];
    if (sortKey) {
      sorted.sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case "type":
            cmp = a.txnType.localeCompare(b.txnType);
            break;
          case "date":
            cmp = (a.date || "").localeCompare(b.date || "");
            break;
          case "guest":
            cmp = a.guestName.localeCompare(b.guestName);
            break;
          case "unit":
            cmp = a.unitNumber.localeCompare(b.unitNumber);
            break;
          case "method":
            cmp = a.method.localeCompare(b.method);
            break;
          case "status":
            cmp = a.status.localeCompare(b.status);
            break;
          case "amount":
            cmp = a.amount - b.amount;
            break;
          default:
            cmp = 0;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return sorted;
  }, [filteredLedger, searchTerm, sortKey, sortDir, bookings, units]);

  // Pagination metadata over the sorted/searchable rows.
  const totalRows = displayRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = useMemo(
    () => displayRows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [displayRows, safePage],
  );

  const paymentStats = useMemo(() => {
    // Collected: booking-payments with status 'Paid' for the month
    const collected = bookingPayments
      .filter(
        (p) =>
          p.paidAt?.startsWith(monthKey) && p.status?.toLowerCase() === "paid",
      )
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const getOverlapNights = (b: any) => {
      const checkinStr = b.checkinDate || b.checkIn;
      const checkoutStr = b.checkoutDate || b.checkOut;
      if (!checkinStr || !checkoutStr) return 0;

      const checkin = parseLocalOnly(checkinStr);
      const checkout = parseLocalOnly(checkoutStr);
      if (!checkin || !checkout) return 0;

      const targetMonthStart = new Date(year, month, 1);
      const nextMonthStart = new Date(year, month + 1, 1);

      const overlapStart = new Date(
        Math.max(targetMonthStart.getTime(), checkin.getTime()),
      );
      const overlapEnd = new Date(
        Math.min(nextMonthStart.getTime(), checkout.getTime()),
      );

      const overlapNights = Math.round(
        (overlapEnd.getTime() - overlapStart.getTime()) / 86400000,
      );
      return overlapNights > 0 ? overlapNights : 0;
    };

    // Uncollected stay-date-based: sum of prorated unpaid balances of current month's bookings
    const uncollected = bookings.reduce((sum, b) => {
      const overlapNights = getOverlapNights(b);
      if (overlapNights <= 0) return sum;

      const checkin = parseLocalOnly(b.checkinDate || b.checkIn);
      const checkout = parseLocalOnly(b.checkoutDate || b.checkOut);
      if (!checkin || !checkout) return sum;

      const totalNights = Math.max(
        1,
        Math.round((checkout.getTime() - checkin.getTime()) / 86400000),
      );

      const bookingPaid = bookingPayments
        .filter(
          (p) =>
            String(p.bookingId) === String(b.id) &&
            p.status?.toLowerCase() === "paid",
        )
        .reduce((sumP, p) => sumP + (Number(p.amount) || 0), 0);

      const totalAmount = Number(b.totalAmount) || 0;
      const unpaidBalance = Math.max(0, totalAmount - bookingPaid);
      const proratedUnpaid = unpaidBalance * (overlapNights / totalNights);
      return sum + proratedUnpaid;
    }, 0);

    // Deposits Collected / Refunded: reuse the shared calculation pipeline
    // so the ledger and stats always agree with Reports and Analytics.
    const monthDepositSummary = summarizeSecurityDeposits(
      filterSecurityDeposits(securityDeposits, { month, year }),
    );
    const depositsCollected = monthDepositSummary.collected;
    const depositsRefunded = monthDepositSummary.refunded;

    return { collected, uncollected, depositsCollected, depositsRefunded };
  }, [bookingPayments, securityDeposits, bookings, monthKey, month, year]);

  const getBookingLabel = (booking: any) => {
    const guestName =
      `${booking?.guestFirstName || ""} ${booking?.guestLastName || ""}`.trim() ||
      booking?.guestName ||
      "Guest";
    const bookingUnit =
      booking?.unitName ||
      units.find((u) => String(u.id) === String(booking?.unitId))?.name ||
      booking?.unitNumber ||
      "Unknown Unit";
    return `${guestName} • ${bookingUnit}`;
  };

  const getStatusMeta = (item: any) => {
    const status = String(item.status || "").toLowerCase();
    if (status === "refunded") {
      return {
        label: "Refunded",
        icon: RotateCcw,
        className: "bg-rose-100 text-rose-700",
      };
    }
    if (status === "unpaid") {
      return {
        label: "Unpaid",
        icon: AlertTriangle,
        className: "bg-amber-100 text-amber-700",
      };
    }
    if (status === "partial") {
      return {
        label: "Partial",
        icon: AlertTriangle,
        className: "bg-sky-100 text-sky-700",
      };
    }
    return {
      label: "Paid",
      icon: CheckCircle,
      className: "bg-emerald-100 text-emerald-700",
    };
  };

  const isDuplicateTransaction = (candidate: any) => {
    const type = candidate._type === "deposit" ? "deposit" : "payment";
    const compareItems =
      type === "payment" ? bookingPayments : securityDeposits;
    const candidateAmount =
      Number(
        candidate.amount ??
          (type === "payment"
            ? candidate.paymentAmount
            : candidate.depositAmount),
      ) || 0;
    return compareItems.some((entry: any) => {
      if (candidate.id && String(entry.id) === String(candidate.id))
        return false;
      return (
        String(entry.bookingId) === String(candidate.bookingId) &&
        String(entry.unitId) === String(candidate.unitId) &&
        String(entry.method || "").toLowerCase() ===
          String(candidate.method || "").toLowerCase() &&
        Math.abs((Number(entry.amount) || 0) - candidateAmount) < 0.01 &&
        String(entry.paidAt || "").split("T")[0] ===
          String(candidate.paidAt || "").split("T")[0]
      );
    });
  };

  const updateResourceItem = (
    resourceName: "booking-payments" | "security-deposits",
    item: any,
  ) => {
    useAppDataStore.setState((state) => ({
      data: {
        ...state.data,
        [resourceName]: (state.data[resourceName] ?? []).map((entry: any) =>
          String(entry.id) === String(item.id) ? item : entry,
        ),
      },
    }));
  };

  const addResourceItem = (
    resourceName: "booking-payments" | "security-deposits",
    item: any,
  ) => {
    useAppDataStore.setState((state) => ({
      data: {
        ...state.data,
        [resourceName]: [...(state.data[resourceName] ?? []), item],
      },
    }));
  };

  const removeResourceItem = (
    resourceName: "booking-payments" | "security-deposits",
    item: any,
  ) => {
    useAppDataStore.setState((state) => ({
      data: {
        ...state.data,
        [resourceName]: (state.data[resourceName] ?? []).filter(
          (entry: any) => String(entry.id) !== String(item.id),
        ),
      },
    }));
  };

  const selectBooking = (bookingId: string) => {
    const booking = bookings.find((b: any) => String(b.id) === bookingId);
    if (!booking) {
      setEditingEntry((prev: any) => ({
        ...prev,
        bookingId,
        guestName: "",
        unitId: "",
        unitName: "",
      }));
      return;
    }

    const unit = units.find(
      (u: any) => String(u.id) === String(booking.unitId),
    );
    setEditingEntry((prev: any) => ({
      ...prev,
      bookingId,
      guestName:
        `${booking?.guestFirstName || ""} ${booking?.guestLastName || ""}`.trim() ||
        booking?.guestName ||
        "",
      unitId: booking.unitId || unit?.id || "",
      unitName: booking.unitName || unit?.name || unit?.unitNumber || "",
      paymentAmount:
        prev?.paymentAmount && Number(prev.paymentAmount) > 0
          ? prev.paymentAmount
          : booking.totalAmount || prev?.paymentAmount || "",
      depositAmount:
        prev?.depositAmount && Number(prev.depositAmount) > 0
          ? prev.depositAmount
          : booking?.securityDeposit?.amount || prev?.depositAmount || "",
    }));
  };

  const openCollectionModal = (entry: any = null, editMode = false) => {
    if (entry) {
      const edited = {
        ...entry,
        paymentAmount: entry._type === "payment" ? entry.amount : 0,
        depositAmount: entry._type === "deposit" ? entry.amount : 0,
        status: entry.status || (entry._type === "deposit" ? "Paid" : "Paid"),
      };
      setEditingEntry(edited);
      setIsCollectionEditMode(editMode);
    } else {
      setEditingEntry({
        paidAt: todayLocalDateInput(),
        paymentAmount: "",
        depositAmount: "",
        method: "CASH",
        status: "Paid",
        notes: "",
        reference: "",
      });
      setIsCollectionEditMode(false);
    }
    setIsCollectionOpen(true);
  };

  const getBookingOptions = useMemo(() => {
    const normalizedSearch = bookingSearch.trim().toLowerCase();
    return bookings.filter((booking: any) => {
      const label = getBookingLabel(booking).toLowerCase();
      return (
        !normalizedSearch ||
        label.includes(normalizedSearch) ||
        String(booking.id).includes(normalizedSearch)
      );
    });
  }, [bookings, bookingSearch]);

  const handleSaveCollection = async (e: React.FormEvent) => {
    if (!canManageOperations(role)) return;
    e.preventDefault();
    if (formLoading) return;
    if (!editingEntry?.bookingId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Select a booking.",
      });
      return;
    }

    const payAmt = Number(editingEntry.paymentAmount) || 0;
    const depAmt = Number(editingEntry.depositAmount) || 0;
    if (payAmt <= 0 && depAmt <= 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Enter an amount.",
      });
      return;
    }

    const targetBooking = bookings.find(
      (b: any) => String(b.id) === String(editingEntry.bookingId),
    );
    const targetUnitName =
      targetBooking?.unitName ||
      units.find((u: any) => String(u.id) === String(targetBooking?.unitId))
        ?.name ||
      "Unknown Unit";
    const targetUnitId = targetBooking?.unitId || "";
    const commonData = {
      uid: user?.uid,
      bookingId: editingEntry.bookingId,
      unitId: targetUnitId,
      unitName: targetUnitName,
      guestName:
        `${targetBooking?.guestFirstName || ""} ${targetBooking?.guestLastName || ""}`.trim(),
      paidAt: editingEntry.paidAt || todayLocalDateInput(),
      method: editingEntry.method || "CASH",
      notes: editingEntry.notes || "Manual entry from ledger.",
      reference: editingEntry.reference || "",
      status: editingEntry.status || "Paid",
    };

    if (editingEntry?.id) {
      const resourceName =
        editingEntry._type === "payment"
          ? "booking-payments"
          : "security-deposits";
      const endpoint =
        editingEntry._type === "payment"
          ? `/booking-payment/${editingEntry.id}`
          : `/security-deposit/${editingEntry.id}`;
      if (isDuplicateTransaction(editingEntry)) {
        toast({
          variant: "destructive",
          title: "Duplicate",
          description: "This transaction already exists.",
        });
        return;
      }
      setFormLoading(true);
      try {
        const updatedPayload = {
          ...editingEntry,
          ...commonData,
          amount: editingEntry._type === "payment" ? payAmt : depAmt,
          type: editingEntry.type,
          updatedAt: new Date().toISOString(),
        };
        const updatedItem = await apiClient.put(endpoint, updatedPayload, auth);
        updateResourceItem(resourceName, {
          ...editingEntry,
          ...updatedPayload,
          ...(updatedItem && typeof updatedItem === "object"
            ? updatedItem
            : {}),
          id: editingEntry.id,
          _type: editingEntry._type,
        });
        toast({ title: "Success", description: "Transaction updated." });
        setIsCollectionOpen(false);
        await paymentsResources.refresh([resourceName]);
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: error.message,
        });
      } finally {
        setFormLoading(false);
      }
      return;
    }

    const duplicatePayment =
      payAmt > 0 &&
      isDuplicateTransaction({
        ...editingEntry,
        _type: "payment",
        amount: payAmt,
        type: "income",
      });
    const duplicateDeposit =
      depAmt > 0 &&
      isDuplicateTransaction({
        ...editingEntry,
        _type: "deposit",
        amount: depAmt,
        type: "receive",
      });
    if (duplicatePayment || duplicateDeposit) {
      toast({
        variant: "destructive",
        title: "Duplicate",
        description: "Matching transaction already exists.",
      });
      return;
    }

    setFormLoading(true);
    try {
      let paymentResponse: any = null;
      let depositResponse: any = null;

      if (payAmt > 0) {
        paymentResponse = await apiClient.post(
          "/booking-payment",
          { amount: payAmt, type: "income", ...commonData },
          auth,
        );
        addResourceItem(
          "booking-payments",
          paymentResponse || {
            ...commonData,
            amount: payAmt,
            type: "income",
            _type: "payment",
            id: `temp-${Date.now()}-${Math.random()}`,
          },
        );
      }
      if (depAmt > 0) {
        depositResponse = await apiClient.post(
          "/security-deposit",
          { amount: depAmt, type: "receive", ...commonData },
          auth,
        );
        addResourceItem(
          "security-deposits",
          depositResponse || {
            ...commonData,
            amount: depAmt,
            type: "receive",
            _type: "deposit",
            id: `temp-${Date.now()}-${Math.random()}`,
          },
        );
      }

      toast({ title: "Success", description: "Collection recorded." });
      setIsCollectionOpen(false);
      await paymentsResources.refresh([
        "booking-payments",
        "security-deposits",
      ]);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: error.message,
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleSaveRefund = async (e: React.FormEvent) => {
    if (!canManageOperations(role)) return;
    e.preventDefault();
    if (!editingEntry?.bookingId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Select a booking.",
      });
      return;
    }
    const refAmt = parseFloat(editingEntry.refundAmount || 0);
    const balance = depositBalances[editingEntry.bookingId] || 0;
    if (refAmt <= 0 || refAmt > balance) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Invalid amount or exceeds available balance.",
      });
      return;
    }

    const targetBooking = bookings.find(
      (b) => String(b.id) === String(editingEntry.bookingId),
    );
    const targetUnitName =
      targetBooking?.unitName ||
      units.find((u) => String(u.id) === String(targetBooking?.unitId))?.name ||
      "Unknown Unit";

    if (formLoading) return;
    setFormLoading(true);
    try {
      await apiClient.post(
        "/security-deposit",
        {
          uid: user?.uid,
          bookingId: editingEntry.bookingId,
          unitId: targetBooking?.unitId || "",
          unitName: targetUnitName,
          guestName:
            `${targetBooking?.guestFirstName || ""} ${targetBooking?.guestLastName || ""}`.trim(),
          type: "refund",
          amount: refAmt,
          paidAt: editingEntry.paidAt || todayLocalDateInput(),
          method: editingEntry.method || "CASH",
          notes: editingEntry.notes || "Manual refund from ledger.",
          reference: editingEntry.reference || "",
          status: "Refunded",
        },
        auth,
      );
      toast({ title: "Success", description: "Deposit refunded." });
      setIsRefundOpen(false);
      await paymentsResources.refresh(["security-deposits"]);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: error.message,
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (item: any) => {
    if (!canManageOperations(role)) return;
    if (!confirm("Permanently remove this entry from the ledger?")) return;
    const endpoint =
      item._type === "payment"
        ? `/booking-payment/${item.id}`
        : `/security-deposit/${item.id}`;
    try {
      await apiClient.delete(endpoint, auth);
      toast({ title: "Deleted", description: "Entry removed." });
      await paymentsResources.refresh([
        item._type === "payment" ? "booking-payments" : "security-deposits",
      ]);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error.message,
      });
    }
  };

  // Toggle sorting on a column. Clicking the same column flips direction;
  // clicking a new column starts descending (newest first).
  const handleSort = (key: string) => {
    setPage(1);
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // Render the Payment Method cell. When the booking source matches a known
  // OTA (Airbnb / Booking.com / Facebook), show its logo alongside the method.
  const renderMethodLabel = (row: {
    source: { label: string; icon: string };
    method: string;
  }) => {
    if (row.source.icon) {
      return (
        <span className="inline-flex items-center gap-1.5">
          <img
            src={row.source.icon}
            alt={row.source.label}
            className="h-4 w-4 rounded-sm object-contain"
          />
          <span className="text-xs font-medium">{row.source.label}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
        {row.method === "GCASH" ? (
          <span className="text-[10px] font-bold uppercase text-emerald-600">
            GCash
          </span>
        ) : row.method ? (
          <span className="capitalize">{row.method.toLowerCase()}</span>
        ) : (
          "CASH"
        )}
      </span>
    );
  };

  if (loading && !mergedLedger.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="animate-spin text-amber-500" />
        <p className="text-sm text-muted-foreground italic">
          Syncing Ledger...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 space-y-6 animate-in fade-in duration-500 pb-20 text-left">
      <div className="flex flex-col gap-3 justify-between sm:flex-row sm:items-end">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Payments Ledger
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {monthKey}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            variant="outline"
            className="h-12 min-w-[120px] text-red-600 dark:text-red-300 border-red-200 dark:border-red-700 focus-visible:ring-2 focus-visible:ring-red-500/30"
            onClick={() => {
              setEditingEntry({
                paidAt: todayLocalDateInput(),
                refundAmount: 0,
                method: "CASH",
              });
              setIsRefundOpen(true);
            }}
          >
            <Undo2 className="h-4 w-4 mr-2" /> Refund
          </Button>
          <Button
            className="gradient-btn h-12 min-w-[120px] text-white focus-visible:ring-2 focus-visible:ring-primary/30"
            disabled={!canManageOperations(role)}
            onClick={() => {
              setEditingEntry({
                paidAt: todayLocalDateInput(),
                paymentAmount: 0,
                depositAmount: 0,
                method: "CASH",
              });
              setIsCollectionOpen(true);
            }}
          >
            {canManageOperations(role) && (
              <>
                <Plus className="h-4 w-4 mr-2" /> Collection
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border border-border bg-card shadow-sm rounded-3xl p-5">
          <div className="flex items-start">
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40">
              <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              Collected Payments
            </p>
            <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">
              {formatCurrency(paymentStats.collected)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Paid revenue this month
            </p>
          </div>
        </Card>
        <Card className="border border-border bg-card shadow-sm rounded-3xl p-5">
          <div className="flex items-start">
            <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/25">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-300" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              Uncollected Payments
            </p>
            <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">
              {formatCurrency(paymentStats.uncollected)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Unpaid + unrecorded revenue
            </p>
          </div>
        </Card>
        <Card className="border border-border bg-card shadow-sm rounded-3xl p-5">
          <div className="flex items-start">
            <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/25">
              <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-300" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              Deposits Collected
            </p>
            <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">
              {formatCurrency(paymentStats.depositsCollected)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Security deposits received
            </p>
          </div>
        </Card>
        <Card className="border border-border bg-card shadow-sm rounded-3xl p-5">
          <div className="flex items-start">
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/25">
              <Undo2 className="h-5 w-5 text-amber-600 dark:text-amber-300" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              Deposits Refunded
            </p>
            <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">
              {formatCurrency(paymentStats.depositsRefunded)}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Security deposits returned
            </p>
          </div>
        </Card>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(val: any) => setActiveTab(val)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 max-w-sm">
          <TabsTrigger value="payments">Booking Payments</TabsTrigger>
          <TabsTrigger value="deposits">Security Deposits</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search + table toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Search guest, unit, method, status..."
            className="h-10 rounded-2xl border-border bg-background pl-9 pr-9 text-sm text-foreground shadow-sm"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setPage(1);
              }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {totalRows} record{totalRows === 1 ? "" : "s"}
          {activeTab === "payments"
            ? " (booking payments)"
            : " (security deposits)"}
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-border bg-card shadow-sm">
        <Table className="min-w-[820px]">
          <TableHeader className="bg-muted/80 dark:bg-slate-800/90">
            <TableRow>
              <SortableHead
                label="Transaction Type"
                sortKey="type"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Date"
                sortKey="date"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Guest"
                sortKey="guest"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Unit"
                sortKey="unit"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Payment Method"
                sortKey="method"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Status"
                sortKey="status"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <TableHead className="text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
                <button
                  type="button"
                  onClick={() => handleSort("amount")}
                  className="inline-flex items-center gap-1 uppercase tracking-[0.18em] hover:text-foreground"
                >
                  Amount
                  <SortIcon
                    activeKey={sortKey}
                    currentKey="amount"
                    dir={sortDir}
                  />
                </button>
              </TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRows.map((row) => {
              const { item } = row;
              const statusMeta = getStatusMeta(item);
              const methodLabel = renderMethodLabel(row);
              return (
                <TableRow
                  key={item.id}
                  className="cursor-pointer transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  onDoubleClick={() => openCollectionModal(item, true)}
                >
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase",
                        row.isRefund
                          ? "bg-rose-100 text-rose-700"
                          : row.txnType === "Adjustment"
                            ? "bg-sky-100 text-sky-700"
                            : row.isIncome
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-blue-100 text-blue-700",
                      )}
                    >
                      {row.txnType}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">
                    {row.dateLabel}
                  </TableCell>
                  <TableCell className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                    {row.guestName}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {row.unitNumber}
                  </TableCell>
                  <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                    {methodLabel}
                  </TableCell>
                  <TableCell className="text-slate-700 dark:text-slate-300">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase",
                        statusMeta.className,
                      )}
                    >
                      <statusMeta.icon className="h-3.5 w-3.5" />
                      {statusMeta.label}
                    </span>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-black",
                      row.isIncome
                        ? "text-green-600 dark:text-green-300"
                        : row.isRefund
                          ? "text-red-600 dark:text-red-300"
                          : "text-slate-700 dark:text-slate-200",
                    )}
                  >
                    {row.isRefund ? "-" : ""}
                    {formatCurrency(row.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${row.guestName || "record"}`}
                          className="focus-visible:ring-2 focus-visible:ring-primary/30"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            openCollectionModal(item, true);
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(item)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
            {paginatedRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-32 text-center text-sm text-slate-500 dark:text-slate-400 italic"
                >
                  No{" "}
                  {activeTab === "payments"
                    ? "booking payment"
                    : "security deposit"}{" "}
                  records found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <div className="text-xs text-muted-foreground">
              Page {safePage} of {totalPages} • {totalRows} records
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="gap-1"
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* NEW COLLECTION MODAL */}
      <Dialog
        open={isCollectionOpen}
        onOpenChange={(open) => {
          setIsCollectionOpen(open);
          if (!open) {
            document.body.style.pointerEvents = "";
            window.setTimeout(() => {
              document.body.style.pointerEvents = "";
            }, 0);
          }
        }}
      >
        <DialogContent
          className="w-full max-w-[min(100vw-2rem,450px)] max-h-[calc(100vh-3rem)] overflow-hidden rounded-3xl border border-border bg-card p-0 shadow-2xl text-left"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader className="border-b border-border bg-muted/80 px-6 py-6 dark:bg-slate-900">
            <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {isCollectionEditMode
                ? editingEntry?._type === "deposit"
                  ? "Edit Deposit"
                  : "Edit Payment"
                : "Record Collection"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveCollection} className="space-y-5 p-6">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Guest Reservation
              </Label>
              <Input
                placeholder="Search reservation"
                value={bookingSearch}
                onChange={(e) => setBookingSearch(e.target.value)}
                className="rounded-2xl h-11 bg-background text-foreground placeholder:text-muted-foreground border border-border ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary/30"
              />
              <select
                className="w-full h-40 rounded-2xl border border-border bg-background px-3 text-sm text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary/30"
                value={editingEntry?.bookingId || ""}
                onChange={(e) => {
                  setEditingEntry({
                    ...editingEntry,
                    bookingId: e.target.value,
                  });
                  selectBooking(e.target.value);
                }}
                required
              >
                <option value="">Select Reservation</option>
                {getBookingOptions.map((b: any) => (
                  <option key={b.id} value={String(b.id)}>
                    {getBookingLabel(b)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Rent (₱)
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={editingEntry?.paymentAmount || ""}
                  onChange={(e) =>
                    setEditingEntry({
                      ...editingEntry,
                      paymentAmount: e.target.value,
                    })
                  }
                  className="rounded-2xl h-11 bg-background text-foreground placeholder:text-muted-foreground border border-border ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Security (₱)
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={editingEntry?.depositAmount || ""}
                  onChange={(e) =>
                    setEditingEntry({
                      ...editingEntry,
                      depositAmount: e.target.value,
                    })
                  }
                  className="rounded-2xl h-11 bg-background text-foreground placeholder:text-muted-foreground border border-border ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Payment Date
                </Label>
                <Input
                  type="date"
                  value={editingEntry?.paidAt?.split("T")[0] || ""}
                  onChange={(e) =>
                    setEditingEntry({ ...editingEntry, paidAt: e.target.value })
                  }
                  required
                  className="rounded-2xl h-11 bg-background text-foreground border border-border ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Method
                </Label>
                <select
                  className="w-full h-11 rounded-2xl border border-border bg-background px-3 text-sm text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary/30"
                  value={editingEntry?.method || "CASH"}
                  onChange={(e) =>
                    setEditingEntry({ ...editingEntry, method: e.target.value })
                  }
                >
                  <option value="CASH">Cash</option>
                  <option value="GCASH">GCash</option>
                  <option value="BANK_TRANSFER">Bank</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Notes & Reference
              </Label>
              <Textarea
                value={editingEntry?.notes || ""}
                onChange={(e) =>
                  setEditingEntry({ ...editingEntry, notes: e.target.value })
                }
                className="rounded-2xl bg-background text-foreground placeholder:text-muted-foreground border border-border ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary/30 min-h-[80px]"
                placeholder="Optional notes or reference numbers..."
              />
            </div>
            <Button
              type="submit"
              disabled={formLoading}
              className="w-full h-12 rounded-2xl bg-primary text-white font-semibold shadow-lg focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {formLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Plus className="mr-2 h-5 w-5" />
              )}{" "}
              Confirm Entry
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* REFUND MODAL */}
      <Dialog
        open={isRefundOpen}
        onOpenChange={(open) => {
          setIsRefundOpen(open);
          if (!open) {
            document.body.style.pointerEvents = "";
            window.setTimeout(() => {
              document.body.style.pointerEvents = "";
            }, 0);
          }
        }}
      >
        <DialogContent
          className="w-full max-w-[min(100vw-2rem,450px)] max-h-[calc(100vh-3rem)] overflow-hidden rounded-3xl border border-border bg-card p-0 shadow-2xl text-left"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader className="border-b border-border bg-red-50/80 px-6 py-6 dark:bg-slate-900">
            <DialogTitle className="text-xl font-semibold tracking-tight text-red-700 dark:text-red-300">
              Issue Deposit Refund
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveRefund} className="space-y-5 p-6">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Guest Reservation
              </Label>
              <select
                className="w-full h-11 rounded-2xl border border-border bg-background px-3 text-sm text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary/30"
                value={editingEntry?.bookingId || ""}
                onChange={(e) =>
                  setEditingEntry({
                    ...editingEntry,
                    bookingId: e.target.value,
                  })
                }
                required
              >
                <option value="">Select Reservation</option>
                {bookings.map((b) => {
                  const bal = depositBalances[String(b.id)] || 0;
                  if (bal <= 0) return null;
                  return (
                    <option key={b.id} value={String(b.id)}>
                      {b.guestFirstName} {b.guestLastName} (Avail:{" "}
                      {formatCurrency(bal)})
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Refund Amt (₱)
                </Label>
                <Input
                  type="number"
                  min="1"
                  max={
                    editingEntry?.bookingId
                      ? depositBalances[editingEntry.bookingId]
                      : 99999
                  }
                  value={editingEntry?.refundAmount || ""}
                  onChange={(e) =>
                    setEditingEntry({
                      ...editingEntry,
                      refundAmount: e.target.value,
                    })
                  }
                  required
                  className="rounded-2xl h-11 bg-background text-foreground placeholder:text-muted-foreground border border-border ring-1 ring-inset ring-red-200 focus:ring-2 focus:ring-red-500/30"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Refund Date
                </Label>
                <Input
                  type="date"
                  value={editingEntry?.paidAt?.split("T")[0] || ""}
                  onChange={(e) =>
                    setEditingEntry({ ...editingEntry, paidAt: e.target.value })
                  }
                  required
                  className="rounded-2xl h-11 bg-background text-foreground border border-border ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Method
              </Label>
              <select
                className="w-full h-11 rounded-2xl border border-border bg-background px-3 text-sm text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary/30"
                value={editingEntry?.method || "CASH"}
                onChange={(e) =>
                  setEditingEntry({ ...editingEntry, method: e.target.value })
                }
              >
                <option value="CASH">Cash</option>
                <option value="GCASH">GCash</option>
                <option value="BANK_TRANSFER">Bank</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Notes & Reference
              </Label>
              <Textarea
                value={editingEntry?.notes || ""}
                onChange={(e) =>
                  setEditingEntry({ ...editingEntry, notes: e.target.value })
                }
                className="rounded-2xl bg-background text-foreground placeholder:text-muted-foreground border border-border ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary/30 min-h-[80px]"
                placeholder="Optional notes or reference numbers..."
              />
            </div>
            <Button
              type="submit"
              disabled={formLoading}
              className="w-full h-12 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-semibold focus-visible:ring-2 focus-visible:ring-red-500/30"
            >
              {formLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Undo2 className="mr-2 h-5 w-5" />
              )}{" "}
              Process Refund
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sortable column header + sort indicator for the transactions table  */
/* ------------------------------------------------------------------ */

function SortIcon({
  activeKey,
  currentKey,
  dir,
}: {
  activeKey: string | null;
  currentKey: string;
  dir: "asc" | "desc";
}) {
  if (activeKey !== currentKey) {
    return <ArrowUpDown className="h-3 w-3 opacity-50" />;
  }
  return dir === "asc" ? (
    <ArrowUp className="h-3 w-3" />
  ) : (
    <ArrowDown className="h-3 w-3" />
  );
}

function SortableHead({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: string;
  activeKey: string | null;
  dir: "asc" | "desc";
  onSort: (key: string) => void;
}) {
  return (
    <TableHead className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 uppercase tracking-[0.18em] hover:text-foreground"
      >
        {label}
        <SortIcon activeKey={activeKey} currentKey={sortKey} dir={dir} />
      </button>
    </TableHead>
  );
}
