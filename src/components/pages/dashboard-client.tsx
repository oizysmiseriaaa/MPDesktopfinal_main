"use client";

import React, {
  useMemo,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useUser, useAuth } from "@/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDateStore } from "@/lib/date-store";
import {
  calculateProratedRevenue,
  calculateProratedBaseRevenue,
  formatCurrency,
  parseLocalOnly,
  summarizeSecurityDeposits,
  todayLocalDateInput,
} from "@/lib/utils-app";
import { apiClient } from "@/lib/api-client";
import { useAppResources } from "@/lib/app-data-store";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  DollarSign,
  BedDouble,
  Wallet,
  TrendingUp,
  FileText,
  Bell,
  Bot,
  ChevronRight,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Loader2,
  Lightbulb,
  Building2,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/hooks/use-toast";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import Link from "next/link";

export function shouldAttemptAutomaticInsight(
  hasData: boolean,
  isLoading: boolean,
  hasInsight: boolean,
  key: string,
  attempted: Set<string>,
) {
  if (!hasData || isLoading || hasInsight || attempted.has(key)) return false;
  attempted.add(key);
  return true;
}

const CHANNEL_CATEGORIES = [
  "Direct",
  "Facebook",
  "Airbnb",
  "Booking.com",
  "Staff / Referral",
  "Other",
] as const;

const PAYMENT_STATUS_TOKENS = [
  "awaiting payment",
  "fully paid",
  "n/a",
  "reserve",
];

export function normalizeChannelSource(
  rawSource: string | undefined | null,
): (typeof CHANNEL_CATEGORIES)[number] {
  const source = (rawSource || "").trim();
  if (!source) return "Direct";

  const tokens = source
    .split("|")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  const bookingTokens = tokens.filter(
    (token) => !PAYMENT_STATUS_TOKENS.includes(token),
  );
  const candidates = bookingTokens.length > 0 ? bookingTokens : tokens;

  if (candidates.some((token) => token.includes("airbnb"))) return "Airbnb";
  if (candidates.some((token) => token.includes("facebook"))) return "Facebook";
  if (candidates.some((token) => token.includes("booking"))) return "Booking.com";
  if (candidates.some((token) => token === "staff" || token === "referral")) {
    return "Staff / Referral";
  }
  if (candidates.some((token) => token === "direct")) return "Direct";
  return "Other";
}

export default function DashboardClient() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const { toast } = useToast();
  const { month, year } = useDateStore();

  const dashboardResources = useAppResources([
    "units",
    "bookings",
    "expenses",
    "booking-payments",
    "security-deposits",
    "reminders",
    "investors",
  ]);
  const apiData = useMemo(
    () => ({
      units: dashboardResources.data["units"] ?? [],
      bookings: dashboardResources.data["bookings"] ?? [],
      expenses: dashboardResources.data["expenses"] ?? [],
      bookingPayments: dashboardResources.data["booking-payments"] ?? [],
      securityDeposits: dashboardResources.data["security-deposits"] ?? [],
      reminders: dashboardResources.data["reminders"] ?? [],
      investors: dashboardResources.data["investors"] ?? [],
    }),
    [dashboardResources.data],
  );
  const apiLoading = dashboardResources.loading || isUserLoading;
  const error = dashboardResources.error;

  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const automaticInsightAttemptedRef = useRef(new Set<string>());

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  // Period-aware overlap calculator — used by stats & channel sources
  const getOverlapNights = useCallback(
    (b: any) => {
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
    },
    [month, year],
  );

  const stats = useMemo(() => {
    const { units, bookings, expenses, bookingPayments, securityDeposits } =
      apiData;

    const currentMonthBookings = bookings.filter(
      (b) => getOverlapNights(b) > 0,
    );
    const revenue = bookings.reduce(
      (sum, b) => sum + calculateProratedRevenue(b, month, year),
      0,
    );
    const previousMonthDate = new Date(year, month - 1, 1);
    const previousMonthRevenue = bookings.reduce(
      (sum, b) =>
        sum +
        calculateProratedRevenue(
          b,
          previousMonthDate.getMonth(),
          previousMonthDate.getFullYear(),
        ),
      0,
    );
    const grossIncome = bookings.reduce(
      (sum, b) => sum + calculateProratedBaseRevenue(b, month, year),
      0,
    );
    const totalExpenses = expenses
      .filter((e) => e.date?.startsWith(monthKey) && e.category !== "Agent Commission")
      .reduce((sum, e) => sum + Number(e.calculatedTotal || e.amount || 0), 0);
    const collected = bookingPayments
      .filter((p) => p.paidAt?.startsWith(monthKey))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // Calculate Pending Payments (uncollected) stay-date-based: sum of prorated unpaid balances of current month's bookings
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

    const income = grossIncome - totalExpenses;
    const ownerShare = income / 6;
    const grossCompanyShare = (income * 5) / 6;

    // Calculate Total Investor Payout
    let totalInvestorShare = 0;
    const investors = apiData.investors;
    investors.forEach((investor) => {
      const assignedUnitIds = investor.unitIds?.map(String) || [];
      let iGrossIncome = 0,
        iExpense = 0;
      assignedUnitIds.forEach((uId: string) => {
        const uGrossIncome = bookings
          .filter((b) => String(b.unitId || b.unit_id) === uId)
          .reduce(
            (sum, b) => sum + calculateProratedBaseRevenue(b, month, year),
            0,
          );
        const uExpense = expenses
          .filter(
            (e) =>
              e.date?.startsWith(monthKey) &&
              e.unitIds?.map(String).includes(uId) &&
              e.category !== "Agent Commission",
          )
          .reduce((sum, e) => {
            const total = Number(e.calculatedTotal || e.amount || 0);
            return sum + total / (e.unitIds?.length || 1);
          }, 0);
        iGrossIncome += uGrossIncome;
        iExpense += uExpense;
      });
      const netProfit = iGrossIncome - iExpense;
      const invCompanyShare = netProfit * (5 / 6);
      const iShare = Math.max(
        0,
        invCompanyShare * (Number(investor.sharePercentage || 0) / 100),
      );
      totalInvestorShare += iShare;
    });

    const netCompanyShare = grossCompanyShare - totalInvestorShare;

    const summary = summarizeSecurityDeposits(securityDeposits);
    const depositStats = securityDeposits.reduce(
      (acc, deposit) => {
        const status = String(deposit.status || "").toLowerCase();
        const amount = Number(
          deposit.amount || deposit.receivedAmount || deposit.totalAmount || 0,
        );

        if (status === "unpaid") {
          acc.unpaid += amount;
        }
        return acc;
      },
      { received: summary.collected, refunded: summary.refunded, unpaid: 0 },
    );

    const activeUnitIds = new Set(
      bookings
        .filter((b) => calculateProratedRevenue(b, month, year) > 0)
        .map((b) => String(b.unitId || b.unit_id)),
    );

    const activeCount = activeUnitIds.size;
    const occupancyRate =
      units.length > 0 ? Math.round((activeCount / units.length) * 100) : 0;

    // Issue B: Filter pending bookings count to only include unpaid bookings overlapping the selected month
    const pendingBookingsCount = bookings.filter((b) => {
      const isUnpaid = b.paymentStatus?.toLowerCase() === "unpaid";
      return isUnpaid && getOverlapNights(b) > 0;
    }).length;

    return {
      totalUnits: units.length,
      totalBookings: currentMonthBookings.length,
      revenue,
      income,
      ownerShare,
      grossCompanyShare,
      netCompanyShare,
      totalInvestorShare,
      collected,
      uncollected,
      expenses: totalExpenses,
      activeCount,
      occupancyRate,
      pendingBookingsCount,
      depositReceived: depositStats.received,
      depositRefunded: depositStats.refunded,
      depositUnpaid: depositStats.unpaid,
      previousMonthRevenue,
      revenueChangePercent:
        previousMonthRevenue === 0
          ? revenue === 0
            ? 0
            : 100
          : ((revenue - previousMonthRevenue) / previousMonthRevenue) * 100,
    };
  }, [apiData, month, year, monthKey]);

  // Derived Data for Lists
  const upcomingCheckins = useMemo(() => {
    const today = todayLocalDateInput();
    return apiData.bookings
      .filter((b) => (b.checkinDate || b.checkIn || "") >= today)
      .sort((a, b) =>
        (a.checkinDate || a.checkIn || "").localeCompare(
          b.checkinDate || b.checkIn || "",
        ),
      )
      .slice(0, 3);
  }, [apiData]);

  const recentBookings = useMemo(() => {
    return [...apiData.bookings]
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      )
      .slice(0, 3);
  }, [apiData]);

  const revenueTrendData = useMemo(() => {
    if (!apiData.bookings.length || !stats) return [];

    const previousMonthDate = new Date(year, month - 1, 1);
    const currentMonthDate = new Date(year, month, 1);

    return [
      {
        name: previousMonthDate.toLocaleString("default", { month: "short" }),
        value: apiData.bookings.reduce(
          (sum, booking) =>
            sum +
            calculateProratedRevenue(
              booking,
              previousMonthDate.getMonth(),
              previousMonthDate.getFullYear(),
            ),
          0,
        ),
      },
      {
        name: currentMonthDate.toLocaleString("default", { month: "short" }),
        value: stats.revenue,
      },
    ];
  }, [apiData.bookings, month, year, stats]);

  const channelSourceData = useMemo(() => {
    const sourceCounts: Record<string, number> = {};
    apiData.bookings.forEach((booking) => {
      const source = normalizeChannelSource(booking.source);
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    });

    const total = Object.values(sourceCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    if (total === 0) {
      return [];
    }

    return Object.entries(sourceCounts)
      .map(([name, count]) => ({
        name,
        count,
        percent: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }, [apiData.bookings]);

  const channelColors: Record<string, string> = {
    Direct: "bg-amber-500",
    "Direct Booking": "bg-amber-500",
    Facebook: "bg-emerald-500",
    Airbnb: "bg-sky-500",
    "Booking.com": "bg-blue-600",
    "Staff / Referral": "bg-violet-500",
    Other: "bg-rose-500",
  };

  const housekeepingTasks = useMemo(() => {
    if (!apiData.reminders.length) return [];
    return apiData.reminders
      .filter((item) => {
        const text =
          `${item.title || ""} ${item.subject || ""} ${item.notes || ""}`.toLowerCase();
        return (
          text.includes("housekeeping") ||
          text.includes("clean") ||
          text.includes("checkout")
        );
      })
      .slice(0, 2);
  }, [apiData.reminders]);

  const formatRelativeTime = (value?: string) => {
    if (!value) return "just now";
    const targetTime = new Date(value).getTime();
    if (Number.isNaN(targetTime)) return "just now";

    const diffMinutes = Math.max(
      1,
      Math.round((Date.now() - targetTime) / 60000),
    );
    if (diffMinutes < 60)
      return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24)
      return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

    const diffDays = Math.round(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  };

  const recentActivity = useMemo(() => {
    const items: Array<{ title: string; detail: string; time: string }> = [];

    apiData.bookings.slice(0, 4).forEach((booking) => {
      const guest = booking.guestName || booking.guestFirstName || "Guest";
      items.push({
        title: "New booking created",
        detail: `${guest} • ${booking.checkinDate || booking.checkIn || "—"} to ${booking.checkoutDate || booking.checkOut || "—"}`,
        time:
          booking.createdAt ||
          booking.bookingDate ||
          booking.checkinDate ||
          booking.checkIn ||
          new Date().toISOString(),
      });
    });

    apiData.bookingPayments.slice(0, 3).forEach((payment) => {
      const amount = formatCurrency(Number(payment.amount || 0));
      items.push({
        title: "Payment received",
        detail: `${amount} • Booking ${payment.bookingId || "reference"}`,
        time: payment.paidAt || payment.createdAt || new Date().toISOString(),
      });
    });

    apiData.reminders
      .filter((item) => String(item.status || "").toLowerCase() === "completed")
      .slice(0, 2)
      .forEach((reminder) => {
        items.push({
          title: "Reminder completed",
          detail: `${reminder.title || reminder.subject || "Reminder"} • ${reminder.unitName || reminder.unitId || "General"}`,
          time:
            reminder.completedAt ||
            reminder.updatedAt ||
            reminder.date ||
            new Date().toISOString(),
        });
      });

    apiData.securityDeposits.slice(0, 2).forEach((deposit) => {
      items.push({
        title: "Deposit recorded",
        detail: `${deposit.unitName || deposit.unitId || "Deposit"} • ${formatCurrency(Number(deposit.amount || 0))}`,
        time:
          deposit.createdAt || deposit.updatedAt || new Date().toISOString(),
      });
    });

    return items
      .sort(
        (left, right) =>
          new Date(right.time).getTime() - new Date(left.time).getTime(),
      )
      .slice(0, 6);
  }, [
    apiData.bookings,
    apiData.bookingPayments,
    apiData.reminders,
    apiData.securityDeposits,
  ]);

  const businessInsights = useMemo(() => {
    if (!stats) return [];

    const averageStay = apiData.bookings.length
      ? Math.round(
          apiData.bookings.reduce((sum, booking) => {
            const checkin = parseLocalOnly(
              booking.checkinDate || booking.checkIn || "",
            );
            const checkout = parseLocalOnly(
              booking.checkoutDate || booking.checkOut || "",
            );
            if (!checkin || !checkout) return sum;
            const nights = Math.max(
              1,
              Math.round((checkout.getTime() - checkin.getTime()) / 86400000),
            );
            return sum + nights;
          }, 0) / apiData.bookings.length,
        )
      : 0;

    const topChannel = channelSourceData[0]?.name || "No channel data";
    const revenueTrend =
      revenueTrendData[revenueTrendData.length - 1]?.value || 0;

    return [
      {
        label: "Occupancy trend",
        value: `${stats.occupancyRate}%`,
        subtitle: "Current month occupancy",
      },
      {
        label: "Revenue trend",
        value: formatCurrency(revenueTrend),
        subtitle: "Latest period in the chart",
      },
      {
        label: "Average stay",
        value: `${averageStay} nights`,
        subtitle: "Across active booking records",
      },
      {
        label: "Booking source trend",
        value: topChannel,
        subtitle: "Top source by current booking volume",
      },
      {
        label: "Collections",
        value: formatCurrency(stats.collected),
        subtitle: `${formatCurrency(stats.uncollected)} still outstanding`,
      },
    ];
  }, [apiData.bookings, channelSourceData, revenueTrendData, stats]);

  const handleGenerateInsight = async () => {
    if (!stats) return;
    setIsAiLoading(true);
    try {
      const { summary } = await apiClient.post<{ summary: string }>(
        "/ai/report-summary",
        {
          reportData: {
            ...stats,
            revenue: stats.revenue,
            income: stats.income,
            period: monthKey,
          },
        },
        auth,
      );
      setAiInsight(summary);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not generate report summary.";
      console.error("AI Insight Error:", e);
      toast({
        title: "AI Insight Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    const attemptKey = `${user?.uid || "anonymous"}:${monthKey}`;
    if (
      shouldAttemptAutomaticInsight(
        Boolean(stats),
        isAiLoading,
        Boolean(aiInsight),
        attemptKey,
        automaticInsightAttemptedRef.current,
      )
    ) {
      void handleGenerateInsight();
    }
  }, [stats, aiInsight, isAiLoading, monthKey, user?.uid]);

  if (isUserLoading || apiLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="animate-spin text-amber-500 h-10 w-10" />
      </div>
    );
  }

  if (error || !stats) {
    const errorMessage =
      typeof error === "string" && error
        ? error
        : "Unable to load dashboard data. Please try again.";

    return (
      <div className="mx-auto max-w-[1600px] space-y-4 pb-8 text-foreground">
        <Card className="rounded-[22px] border border-border bg-card shadow-card">
          <CardContent className="flex flex-col items-center justify-center gap-4 p-8 text-center">
            <AlertCircle className="h-10 w-10 text-amber-500" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Dashboard Unavailable
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {errorMessage}
              </p>
            </div>
            <Button
              onClick={async () => {
                setIsRetrying(true);
                try {
                  await dashboardResources.refresh();
                } finally {
                  setIsRetrying(false);
                }
              }}
              disabled={isRetrying}
              className="gap-2"
            >
              <Loader2 className={cn("h-4 w-4", isRetrying && "animate-spin")} />
              {isRetrying ? "Retrying..." : "Retry"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Chart Data
  const paymentChartData = [
    { name: "Fully Paid", value: stats.collected, color: "#16a34a" },
    { name: "Partial/Unpaid", value: stats.uncollected, color: "#ef4444" },
  ];
  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-8 text-foreground">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatCurrency(stats.revenue)}
          hint={new Date(year, month).toLocaleString("default", {
            month: "long",
            year: "numeric",
          })}
          icon={DollarSign}
          iconClassName="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Income"
          value={formatCurrency(stats.income)}
          hint="Revenue minus expenses"
          icon={TrendingUp}
          iconClassName="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Gross Company Share"
          value={formatCurrency(stats.grossCompanyShare)}
          hint="5/6 of income"
          icon={Building2}
          iconClassName="bg-sky-50 text-sky-600"
        />
        <StatCard
          label="Net Company Share"
          value={formatCurrency(stats.netCompanyShare)}
          hint="After investor payouts"
          icon={Crown}
          iconClassName="bg-cyan-50 text-cyan-600"
        />
        <StatCard
          label="Owner's Share"
          value={formatCurrency(stats.ownerShare)}
          hint="1/6 of income"
          icon={Wallet}
          iconClassName="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Total Bookings"
          value={String(stats.totalBookings)}
          hint="Current month bookings"
          icon={CalendarDays}
          iconClassName="bg-slate-50 text-slate-700"
        />
        <StatCard
          label="Occupied Units"
          value={`${stats.activeCount}/${stats.totalUnits}`}
          hint={`${stats.occupancyRate}% occupancy`}
          icon={BedDouble}
          iconClassName="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          label="Pending Payments"
          value={formatCurrency(stats.uncollected)}
          hint={`${stats.pendingBookingsCount} unpaid active bookings`}
          icon={AlertCircle}
          iconClassName="bg-rose-50 text-rose-600"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.9fr)]">
        <Card className="rounded-[22px] border border-border bg-card shadow-card">
          <CardContent className="p-4 md:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">
                  Quick actions
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Move faster across the operational flow.
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              <QuickAction
                icon={<CalendarDays className="h-4 w-4 text-sky-600" />}
                label="New Booking"
                bg="bg-sky-50"
                href="/bookings/"
              />
              <QuickAction
                icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
                label="Payments"
                bg="bg-emerald-50"
                href="/payments/"
              />
              <QuickAction
                icon={<Bell className="h-4 w-4 text-amber-600" />}
                label="Reminders"
                bg="bg-amber-50"
                href="/reminders/"
              />
              <QuickAction
                icon={<CalendarDays className="h-4 w-4 text-violet-600" />}
                label="Calendar"
                bg="bg-violet-50"
                href="/calendar/"
              />
              <QuickAction
                icon={<FileText className="h-4 w-4 text-slate-600" />}
                label="Reports"
                bg="bg-slate-100"
                href="/analytics/"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[22px] border border-amber-200 bg-gradient-to-br from-amber-500/10 via-card to-orange-500/10 shadow-card">
          <CardContent className="flex h-full items-center justify-between gap-4 p-4 md:p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-background p-3 shadow-sm">
                <Bot className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  AI Assistant
                </h4>
                <p className="text-xs text-muted-foreground">
                  Generate an instant operational summary.
                </p>
              </div>
            </div>
            <Link
              href="/ai-assistant/"
              className="flex items-center gap-1 text-xs font-semibold text-amber-700"
            >
              Open <ChevronRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="rounded-[22px] border border-border bg-card shadow-card">
          <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
            <CardTitle className="text-base font-semibold text-foreground">
              Upcoming Check-ins
            </CardTitle>
            <Link
              href="/bookings/"
              className="text-xs font-semibold text-amber-700"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            {upcomingCheckins.length > 0 ? (
              upcomingCheckins.map((booking) => (
                <div
                  key={
                    booking.id || `${booking.guestName}-${booking.checkinDate}`
                  }
                  className="flex items-center justify-between gap-3 rounded-2xl bg-secondary p-3 ring-1 ring-border"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-xs font-semibold text-slate-950">
                      {(booking.guestName || "GU").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {booking.guestName || "Unknown Guest"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Unit: {booking.unitName || "Unassigned"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {booking.checkinDate || booking.checkIn}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {booking.checkInTime ||
                        booking.checkinTime ||
                        "Time not set"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-secondary px-4 py-8 text-center text-sm text-muted-foreground ring-1 ring-border">
                No upcoming check-ins.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[22px] border border-border bg-card shadow-card">
          <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
            <CardTitle className="text-base font-semibold text-foreground">
              Recent Bookings
            </CardTitle>
            <Link
              href="/bookings/"
              className="text-xs font-semibold text-amber-700"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            {recentBookings.length > 0 ? (
              recentBookings.map((booking) => {
                const statusTone =
                  booking.paymentStatus === "paid"
                    ? "bg-emerald-50 text-emerald-700"
                    : booking.paymentStatus === "partial"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-rose-50 text-rose-700";
                return (
                  <div
                    key={
                      booking.id ||
                      `${booking.guestName}-${booking.checkinDate}`
                    }
                    className="flex items-center justify-between gap-3 rounded-2xl bg-secondary p-3 ring-1 ring-border"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {booking.guestName || "Unknown Guest"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Unit: {booking.unitId || "Unassigned"} •{" "}
                        {booking.bookingDate ||
                          booking.createdAt ||
                          booking.checkinDate ||
                          booking.checkIn}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase",
                          statusTone,
                        )}
                      >
                        {booking.paymentStatus || "Unpaid"}
                      </span>
                      <p className="w-20 text-right text-sm font-semibold text-foreground">
                        {formatCurrency(
                          calculateProratedRevenue(booking, month, year),
                        )}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl bg-secondary px-4 py-8 text-center text-sm text-muted-foreground ring-1 ring-border">
                No recent bookings.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[22px] border border-border bg-card shadow-card">
          <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
            <CardTitle className="text-base font-semibold text-foreground">
              Payment Summary
            </CardTitle>
            <Link
              href="/payments/"
              className="text-xs font-semibold text-amber-700"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="relative h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={72}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {paymentChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-semibold text-foreground">
                  {formatCurrency(stats.collected)}
                </span>
                <span className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                  Collected
                </span>
              </div>
            </div>
            <div className="space-y-3 rounded-2xl bg-secondary p-3 ring-1 ring-border">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground">Collected</span>
                </div>
                <span className="font-semibold text-foreground">
                  {formatCurrency(stats.collected)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  <span className="text-muted-foreground">Outstanding</span>
                </div>
                <span className="font-semibold text-foreground">
                  {formatCurrency(stats.uncollected)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-[22px] border border-border bg-card shadow-card">
          <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
            <CardTitle className="text-base font-semibold text-foreground">
              Revenue Overview
            </CardTitle>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
              This month
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-3xl font-bold text-foreground">
                {formatCurrency(stats.revenue)}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                  stats.revenueChangePercent > 0
                    ? "bg-emerald-50 text-emerald-700"
                    : stats.revenueChangePercent < 0
                      ? "bg-rose-50 text-rose-700"
                      : "bg-secondary text-muted-foreground",
                )}
              >
                {stats.revenueChangePercent > 0 ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : stats.revenueChangePercent < 0 ? (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" />
                )}
                {Math.abs(stats.revenueChangePercent).toFixed(0)}% vs last month
              </span>
            </div>
            <div className="mt-4 h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueTrendData}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: "hsl(var(--text-secondary))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "hsl(var(--text-secondary))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(value as number)}
                    contentStyle={{
                      borderRadius: 16,
                      borderColor: "hsl(var(--border))",
                      backgroundColor: "hsl(var(--popover))",
                      color: "hsl(var(--popover-foreground))",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={{ r: 3, strokeWidth: 0, fill: "#f59e0b" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[22px] border border-border bg-card shadow-card">
          <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
            <CardTitle className="text-base font-semibold text-foreground">
              Deposits
            </CardTitle>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
              Live deposit data
            </span>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-secondary p-3 ring-1 ring-border text-center">
                <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  Received
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatCurrency(stats.depositReceived)}
                </p>
              </div>
              <div className="rounded-2xl bg-secondary p-3 ring-1 ring-border text-center">
                <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  Refunded
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatCurrency(stats.depositRefunded)}
                </p>
              </div>
              <div className="rounded-2xl bg-secondary p-3 ring-1 ring-border text-center">
                <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  Unpaid
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatCurrency(stats.depositUnpaid)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[22px] border border-border bg-card shadow-card">
          <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
            <CardTitle className="text-base font-semibold text-foreground">
              Channel Sources
            </CardTitle>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
              Live booking origin
            </span>
          </CardHeader>
          <CardContent className="space-y-10 p-10 pt-0">
            {channelSourceData.length > 0 ? (
              channelSourceData.map((source) => (
                <ChannelRow
                  key={source.name}
                  name={source.name}
                  count={source.count}
                  percent={source.percent}
                  color={channelColors[source.name] || "bg-slate-500"}
                />
              ))
            ) : (
              <div className="rounded-2xl bg-secondary px-4 py-8 text-center text-sm text-muted-foreground ring-1 ring-border">
                No booking data available for this period.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-[22px] border border-border bg-card shadow-card">
          <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
            <CardTitle className="text-base font-semibold text-foreground">
              Recent Activity
            </CardTitle>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
              Live records
            </span>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            {recentActivity.map((item) => (
              <div
                key={`${item.title}-${item.time}-${item.detail}`}
                className="rounded-2xl bg-secondary p-3 ring-1 ring-border"
              >
                <p className="text-sm font-semibold text-foreground">
                  {item.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.detail}
                </p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {formatRelativeTime(item.time)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Link href="/reminders/" className="block h-full">
          <Card className="h-full rounded-[22px] border border-border bg-card shadow-card transition hover:-translate-y-0.5 hover:border-amber-300">
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
              <CardTitle className="text-base font-semibold text-foreground">
                Housekeeping Tasks
              </CardTitle>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
                View all
              </span>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
              {housekeepingTasks.length > 0 ? (
                housekeepingTasks.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl bg-secondary p-3 ring-1 ring-border"
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {item.title || item.subject || "Housekeeping task"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.dueDate || item.date || "No date assigned"}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-secondary px-4 py-8 text-center text-sm text-muted-foreground ring-1 ring-border">
                  No housekeeping records found.
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        <Card className="rounded-[22px] border border-amber-200 bg-gradient-to-br from-amber-500/10 via-card to-orange-500/10 shadow-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Lightbulb className="h-5 w-5 text-amber-600" /> Business Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid gap-3">
              {businessInsights.map((insight) => (
                <InsightStat
                  key={insight.label}
                  label={insight.label}
                  value={insight.value}
                  subtitle={insight.subtitle}
                />
              ))}
            </div>
            {isAiLoading ? (
              <div className="mt-4 flex flex-col items-center justify-center py-4">
                <Loader2 className="mb-2 h-5 w-5 animate-spin text-amber-600" />
                <p className="text-xs text-muted-foreground">
                  Analyzing performance...
                </p>
              </div>
            ) : (
              <>
                <p className="mt-4 text-sm font-medium leading-relaxed text-muted-foreground">
                  {aiInsight ||
                    "No fresh AI summary is available yet. Use Generate Fresh Insight to pull the latest system analysis."}
                </p>
                <Button
                  onClick={handleGenerateInsight}
                  className="mt-3 h-10 w-full rounded-2xl bg-amber-500 font-semibold text-slate-950 hover:bg-amber-600"
                >
                  Generate Fresh Insight
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  bg,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  bg: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 rounded-2xl border border-border bg-secondary px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-amber-200 hover:bg-background"
    >
      <div
        className={cn(
          "rounded-lg p-2 transition-transform group-hover:scale-110",
          bg,
        )}
      >
        {icon}
      </div>
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
    </Link>
  );
}

function ChannelRow({
  name,
  count,
  percent,
  color,
}: {
  name: string;
  count: number;
  percent: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="w-28 shrink-0 text-xs font-semibold text-muted-foreground">
        {name}
      </span>
      <span className="w-32 shrink-0 pr-4 text-right text-xs text-muted-foreground">
        {count} Bookings ({percent}%)
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-bold text-foreground">
        {percent}%
      </span>
    </div>
  );
}

function InsightStat({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-2xl bg-secondary/80 p-3 ring-1 ring-border">
      <p className="text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}
