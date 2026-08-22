"use client";

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useUser, useAuth } from "@/firebase";
import { apiClient } from "@/lib/api-client";
import { useAppResources } from "@/lib/app-data-store";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterBar } from "@/components/ui/filter-bar";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Printer,
  BarChart3,
  Layers,
  Trophy,
  Calculator,
  Sparkles,
  Wand2,
  ShieldCheck,
  RotateCcw,
  AlertCircle,
  Handshake,
  Download,
} from "lucide-react";
import {
  formatCurrency,
  calculateProratedRevenue,
  calculateProratedBaseRevenue,
  parseLocalOnly,
  summarizeSecurityDeposits,
  filterSecurityDeposits,
  normalizeBookingSecurityDepositRecords,
  normalizeSecurityDepositsFromBookings,
  summarizeNormalizedSecurityDeposits,
  looksLikeFirestoreId,
} from "@/lib/utils-app";
import { useDateStore } from "@/lib/date-store";
import { getHistoricalSummaryForMonth } from "@/lib/historical-expense-summaries";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

function getProfitRateForBooking(booking: any): number {
  const checkin = parseLocalOnly(booking.checkinDate);
  if (!checkin) return 1500;
  return checkin.getMonth() < 5 ? 1800 : 1500;
}

export default function AnalyticsClient() {
  useUser();
  const auth = useAuth();
  const { toast } = useToast();
  const { month, year } = useDateStore();

  const analyticsResources = useAppResources([
    "bookings",
    "units",
    "expenses",
    "agents",
    "investors",
    "booking-payments",
  ]);
  const loading = analyticsResources.loading;
  const data = useMemo(
    () => ({
      bookings: analyticsResources.data["bookings"] ?? [],
      units: analyticsResources.data["units"] ?? [],
      expenses: analyticsResources.data["expenses"] ?? [],
      agents: analyticsResources.data["agents"] ?? [],
      investors: analyticsResources.data["investors"] ?? [],
      bookingPayments: analyticsResources.data["booking-payments"] ?? [],
    }),
    [analyticsResources.data],
  );

  const [reportType, setReportType] = useState("unit");
  const [selectedEntity, setSelectedEntity] = useState("all");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any>(null);

  // AI summary
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  const [sdFilters, setSdFilters] = useState({
    month: month + 1,
    year,
    unit: "all",
    agent: "all",
    guest: "all",
    status: "all",
  });

  useEffect(() => {
    setSdFilters((current) => ({
      ...current,
      month: month + 1,
      year,
    }));
  }, [month, year]);

  // Resolve agent name for a booking. Falls back to booking fields when only agentId is stored.
  const getAgentNameForBooking = useCallback(
    (booking: any): string => {
      if (!booking) return "";
      const agentId = String(booking.agentId || booking.agent_id || "").trim();
      if (agentId) {
        const agent = data.agents.find((a: any) => String(a.id) === agentId);
        if (agent) {
          return String(
            agent.name || agent.fullName || agent.agentName || "",
          ).trim();
        }
      }
      return String(
        booking.agent ||
          booking.agentName ||
          booking.assignedAgent ||
          booking.assigned_agent ||
          booking.processedBy ||
          booking.processed_by ||
          "",
      ).trim();
    },
    [data.agents],
  );

  // Single normalized dataset from Bookings for the Security Deposit Monitoring tab.
  const sdNormalizedDeposits = useMemo(
    () =>
      normalizeSecurityDepositsFromBookings(data.bookings).map((entry: any) => {
        const booking = data.bookings.find(
          (b: any) => String(b.id) === String(entry.bookingId),
        );
        const resolvedAgent = getAgentNameForBooking(booking);
        return {
          ...entry,
          agent:
            resolvedAgent ||
            (looksLikeFirestoreId(entry.agent) ? "" : entry.agent || ""),
        };
      }),
    [data.bookings, getAgentNameForBooking],
  );

  // Agent/Guest filter options.
  const sdAgentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          sdNormalizedDeposits
            .map((r) => r.agent)
            .filter(
              (name) => name && name !== "—" && !looksLikeFirestoreId(name),
            ),
        ),
      ),
    [sdNormalizedDeposits],
  );
  const sdGuestOptions = useMemo(
    () =>
      Array.from(
        new Set(
          sdNormalizedDeposits
            .map((r) => r.guestName)
            .filter((name) => name && name !== "—"),
        ),
      ),
    [sdNormalizedDeposits],
  );

  // Filtered dataset shared by Security Deposit Monitoring widgets.
  const sdFilteredDeposits = useMemo(() => {
    return filterSecurityDeposits(sdNormalizedDeposits, {
      month: sdFilters.month,
      year: sdFilters.year,
      unit: sdFilters.unit,
      agent: sdFilters.agent,
      guest: sdFilters.guest,
      status: sdFilters.status,
    });
  }, [
    sdNormalizedDeposits,
    sdFilters.month,
    sdFilters.year,
    sdFilters.unit,
    sdFilters.agent,
    sdFilters.guest,
    sdFilters.status,
  ]);

  const sdMetrics = useMemo(
    () => summarizeNormalizedSecurityDeposits(sdFilteredDeposits),
    [sdFilteredDeposits],
  );

  // One record per booking (not per money movement).
  const securityLedger = useMemo(() => {
    return [...sdFilteredDeposits].sort((a, b) => {
      const dateA = a.depositDate || a.checkinDate || "";
      const dateB = b.depositDate || b.checkinDate || "";
      return dateB.localeCompare(dateA);
    });
  }, [sdFilteredDeposits]);

  const sdUnitChartData = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>();
    sdFilteredDeposits.forEach((r) => {
      const key = r.unitName || r.unitId || "—";
      const current = map.get(key) ?? { name: key, value: 0 };
      current.value += Number(r.depositAmount) || 0;
      map.set(key, current);
    });
    // Include all units with deposit records.
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [sdFilteredDeposits]);

  const sdStatusChartData = useMemo(() => {
    const order = ["Paid", "Partial", "Unpaid"];
    const sums: Record<string, number> = { Paid: 0, Partial: 0, Unpaid: 0 };
    sdFilteredDeposits.forEach((r) => {
      const status = r.status || r.depositStatus;
      if (sums[status] !== undefined) {
        sums[status] += Number(r.depositAmount) || 0;
      }
    });
    // Always render all three statuses to keep the chart stable.
    return order.map((name) => ({ name, value: sums[name] }));
  }, [sdFilteredDeposits]);

  // Export the exact filtered ledger shown on screen as a CSV file.
  const exportSecurityDepositLedger = () => {
    const headers = [
      "Guest",
      "Unit",
      "Deposit Amount",
      "Status",
      "Assigned Agent",
    ];
    const rows = securityLedger.map((row) => [
      row.guestName || "—",
      row.unitName || row.unitId || "—",
      String(Number(row.depositAmount) || 0),
      row.status || "—",
      looksLikeFirestoreId(row.agent) ? "—" : row.agent || "—",
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "security-deposits.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const overviewMetrics = useMemo(() => {
    if (!data) return null;
    const revenue = data.bookings.reduce(
      (sum, b) => sum + calculateProratedRevenue(b, month, year),
      0,
    );
    const filteredExpenses = data.expenses.filter((e) =>
      e.date?.startsWith(monthKey),
    );
    const transactionExpense = filteredExpenses.reduce(
      (sum, e) => sum + Number(e.calculatedTotal || e.amount || 0),
      0,
    );
    const historicalSummary = getHistoricalSummaryForMonth(month + 1, year);
    const historicalExpense = historicalSummary?.grandTotal ?? 0;
    const expense = transactionExpense + historicalExpense;
    const paidBookings = data.bookings.filter(
      (b) => (b.paymentStatus || "").toLowerCase() === "paid",
    );
    const completedBookings = paidBookings.length;
    const fixedProfit = paidBookings.reduce(
      (sum, b) => sum + getProfitRateForBooking(b),
      0,
    );
    const paymentsCollected = data.bookingPayments
      .filter(
        (p) =>
          p.paidAt?.startsWith(monthKey) &&
          (p.status || p.paymentStatus || "").toLowerCase() === "paid",
      )
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const expensesPaid = expense;
    const netCashFlow = paymentsCollected - expensesPaid;
    return {
      revenue,
      expense,
      transactionExpense,
      historicalExpense,
      profit: fixedProfit - expense,
      completedBookings,
      fixedProfit,
      paymentsCollected,
      expensesPaid,
      netCashFlow,
    };
  }, [data, month, year, monthKey]);

  const chartData = useMemo(() => {
    if (!overviewMetrics) return [];
    return [
      { name: "Revenue", value: overviewMetrics.revenue, color: "#10b981" },
      { name: "Expenses", value: overviewMetrics.expense, color: "#ef4444" },
      { name: "Net Profit", value: overviewMetrics.profit, color: "#f59e0b" },
    ];
  }, [overviewMetrics]);

  const securityDepositSummary = useMemo(() => {
    const summary = summarizeNormalizedSecurityDeposits(sdFilteredDeposits);
    return {
      collected: summary.totalCollected,
      refunded: summary.totalRefunded,
      activeHeld: summary.activeHeld,
      outstanding: summary.activeHeld,
      unpaid: summary.unpaidDeposits,
    };
  }, [sdFilteredDeposits]);

  const unitRankings = useMemo(() => {
    if (!data) return [];
    const monthStart = new Date(year, month, 1).getTime();
    const nextMonthStart = new Date(year, month + 1, 1).getTime();
    const parseDay = (v?: string) => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };
    const historicalSummary = getHistoricalSummaryForMonth(month + 1, year);
    const historicalUnitMap = new Map<string, number>();
    if (historicalSummary) {
      historicalSummary.unitSummaries.forEach((u) => {
        if (u.unitId) {
          historicalUnitMap.set(u.unitId, u.total);
        }
      });
    }
    return data.units
      .map((u) => {
        const uId = String(u.id);
        const bookings = data.bookings.filter(
          (b) => String(b.unitId || b.unit_id) === uId,
        );
        const revenue = bookings.reduce(
          (sum, b) => sum + calculateProratedRevenue(b, month, year),
          0,
        );
        const paidBookings = bookings.filter(
          (b) => (b.paymentStatus || "").toLowerCase() === "paid",
        );
        const completedBookings = paidBookings.length;
        const fixedProfit = paidBookings.reduce(
          (sum, b) => sum + getProfitRateForBooking(b),
          0,
        );
        const unitExpenses = data.expenses
          .filter((e) => {
            const matchesDate = e.date?.startsWith(monthKey);
            const targetsUnit =
              e.unitIds && e.unitIds.map(String).includes(String(u.id));
            return (
              matchesDate && targetsUnit && e.category !== "Agent Commission"
            );
          })
          .reduce((sum, e) => {
            const total = Number(e.calculatedTotal || e.amount || 0);
            const targetedUnitsCount =
              e.unitIds && e.unitIds.length > 0
                ? e.unitIds.length
                : data.units.length;
            return sum + total / targetedUnitsCount;
          }, 0);
        const historicalUnitExpense = historicalUnitMap.get(uId) ?? 0;
        const totalUnitExpenses = unitExpenses + historicalUnitExpense;
        // Occupied nights within the selected month using all bookings.
        let occupiedNights = 0;
        bookings.forEach((b) => {
          const cin = parseDay(b.checkinDate);
          const cout = parseDay(b.checkoutDate);
          if (!cin || !cout) return;
          const start = Math.max(cin.getTime(), monthStart);
          const end = Math.min(cout.getTime(), nextMonthStart);
          if (end > start) {
            occupiedNights += Math.round((end - start) / (1000 * 60 * 60 * 24));
          }
        });
        return {
          name: u.name || u.unitNumber,
          revenue,
          expenses: totalUnitExpenses,
          transactionExpenses: unitExpenses,
          historicalExpenses: historicalUnitExpense,
          profit: fixedProfit - totalUnitExpenses,
          completedBookings,
          occupiedNights,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [data, month, year, monthKey]);

  const handleGenerate = () => {
    setIsGenerating(true);
    setAiSummary(null);

    {
      let revenue = 0,
        grossIncome = 0,
        expense = 0,
        entityName = "All Entities",
        commission = 0,
        investorShare = 0;
      let totalFixedProfit = 0;
      let completedBookingsCount = 0;

      if (reportType === "unit") {
        const filteredBookings = data.bookings.filter(
          (b) =>
            selectedEntity === "all" ||
            String(b.unitId || b.unit_id) === selectedEntity,
        );
        revenue = filteredBookings.reduce(
          (sum, b) => sum + calculateProratedRevenue(b, month, year),
          0,
        );
        grossIncome = filteredBookings.reduce(
          (sum, b) => sum + calculateProratedBaseRevenue(b, month, year),
          0,
        );
        const paidUnitBookings = filteredBookings.filter(
          (b) => (b.paymentStatus || "").toLowerCase() === "paid",
        );
        completedBookingsCount = paidUnitBookings.length;
        totalFixedProfit = paidUnitBookings.reduce(
          (sum, b) => sum + getProfitRateForBooking(b),
          0,
        );

        expense = data.expenses
          .filter((e) => {
            const matchesDate = e.date?.startsWith(monthKey);
            const isTargeted =
              selectedEntity === "all" ||
              (e.unitIds && e.unitIds.map(String).includes(selectedEntity));
            return (
              matchesDate && isTargeted && e.category !== "Agent Commission"
            );
          })
          .reduce((sum, e) => {
            const total = Number(e.calculatedTotal || e.amount || 0);
            const targetedUnitsCount =
              e.unitIds && e.unitIds.length > 0
                ? e.unitIds.length
                : data.units.length;
            return (
              sum +
              (selectedEntity === "all" ? total : total / targetedUnitsCount)
            );
          }, 0);

        const historicalSummary = getHistoricalSummaryForMonth(month + 1, year);
        if (historicalSummary) {
          const historicalForEntity = historicalSummary.unitSummaries
            .filter((u) => {
              if (selectedEntity === "all") return true;
              return u.unitId === selectedEntity;
            })
            .reduce((sum, u) => {
              if (selectedEntity === "all") return sum + u.total;
              return sum + u.total / historicalSummary.unitSummaries.length;
            }, 0);
          expense += historicalForEntity;
        }

        entityName =
          selectedEntity === "all"
            ? "All Units"
            : data.units.find((u) => String(u.id) === selectedEntity)?.name ||
              "Unknown Unit";
      } else if (reportType === "agent") {
        const agent = data.agents.find((a) => String(a.id) === selectedEntity);
        if (agent) {
          entityName = agent.name;
          const agentBookings = data.bookings.filter(
            (b) => String(b.agentId) === selectedEntity,
          );
          const paidAgentBookings = agentBookings.filter(
            (b) => (b.paymentStatus || "").toLowerCase() === "paid",
          );
          completedBookingsCount = paidAgentBookings.length;
          totalFixedProfit = paidAgentBookings.reduce(
            (sum, b) => sum + getProfitRateForBooking(b),
            0,
          );

          agentBookings.forEach((b) => {
            const bRevenue = calculateProratedRevenue(b, month, year);
            const bGrossIncome = calculateProratedBaseRevenue(b, month, year);
            revenue += bRevenue;
            grossIncome += bGrossIncome;

            const unit = data.units.find(
              (u) => String(u.id) === String(b.unitId),
            );
            if (unit) {
              const checkin = new Date(b.checkinDate);
              const checkout = new Date(b.checkoutDate);
              const nights = Math.max(
                1,
                Math.round(
                  (checkout.getTime() - checkin.getTime()) /
                    (1000 * 60 * 60 * 24),
                ),
              );
              const baseCost = nights * Number(unit.rate || 0);
              const surplus = Math.max(
                0,
                Number(b.totalAmount || 0) - baseCost,
              );
              commission += surplus * (bRevenue / Number(b.totalAmount || 1));
            }
          });
        }
      } else if (reportType === "investor") {
        const investor = data.investors.find(
          (i) => String(i.id) === selectedEntity,
        );
        if (investor) {
          entityName = investor.name;
          const assignedUnitIds = investor.unitIds?.map(String) || [];

          assignedUnitIds.forEach((uId: string) => {
            const uBookings = data.bookings.filter(
              (b) => String(b.unitId || b.unit_id) === uId,
            );
            const paidUBookings = uBookings.filter(
              (b) => (b.paymentStatus || "").toLowerCase() === "paid",
            );
            completedBookingsCount += paidUBookings.length;
            totalFixedProfit += paidUBookings.reduce(
              (sum, b) => sum + getProfitRateForBooking(b),
              0,
            );

            const uRevenue = uBookings.reduce(
              (sum, b) => sum + calculateProratedRevenue(b, month, year),
              0,
            );
            const uGrossIncome = uBookings.reduce(
              (sum, b) => sum + calculateProratedBaseRevenue(b, month, year),
              0,
            );
            const uExpense = data.expenses
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

            const historicalSummary = getHistoricalSummaryForMonth(
              month + 1,
              year,
            );
            const historicalUnitExpense =
              historicalSummary?.unitSummaries.find((u) => u.unitId === uId)
                ?.total ?? 0;

            revenue += uRevenue;
            grossIncome += uGrossIncome;
            expense += uExpense + historicalUnitExpense;
          });

          const netProfit = grossIncome - expense;
          const companyShare = netProfit * (5 / 6);
          investorShare = Math.max(
            0,
            companyShare * (Number(investor.sharePercentage || 0) / 100),
          );
        }
      }

      const fixedProfit = totalFixedProfit;

      setGeneratedReport({
        type: reportType,
        name: entityName,
        period: monthKey,
        revenue,
        grossIncome,
        expenses: expense,
        profit: fixedProfit - expense,
        commission,
        investorShare,
        completedBookings: completedBookingsCount,
        fixedProfit,
      });
      setIsGenerating(false);
    }
  };

  const handleGenerateAiSummary = async () => {
    if (!generatedReport) return;
    setIsAiLoading(true);
    try {
      const { summary } = await apiClient.post<{ summary: string }>(
        "/ai/report-summary",
        {
          reportData: generatedReport,
        },
        auth,
      );
      setAiSummary(summary);
    } catch (error: any) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not generate report summary.";
      toast({
        title: "AI Analysis Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const dropdownEntities = useMemo(() => {
    if (!data) return [];
    if (reportType === "unit")
      return [{ id: "all", name: "All Units" }, ...data.units];
    if (reportType === "agent") return data.agents;
    if (reportType === "investor") return data.investors;
    return [];
  }, [data, reportType]);

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
        <p className="text-muted-foreground font-medium">
          Syncing Reporting Tools...
        </p>
      </div>
    );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto pb-20 text-left">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="text-left">
            <h1 className="text-3xl font-bold text-foreground">
              Reports & Analytics
            </h1>
            <p className="text-muted-foreground">
              Financial period: {monthKey}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" /> Export View
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-md mb-8">
          <TabsTrigger value="overview">General Overview</TabsTrigger>
          <TabsTrigger value="generate">Report Builder</TabsTrigger>
          <TabsTrigger value="performance">Unit Performance</TabsTrigger>
          <TabsTrigger value="security-deposits">Security Deposits</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard
              title="Revenue Earned"
              value={formatCurrency(overviewMetrics?.revenue || 0)}
              icon={<ArrowUpRight className="text-green-600" />}
              bgColor="bg-green-50 dark:bg-green-950/30"
              textColor="text-green-600"
            />
            <MetricCard
              title="Expenses"
              value={formatCurrency(overviewMetrics?.expense || 0)}
              icon={<ArrowDownRight className="text-red-600" />}
              bgColor="bg-red-50 dark:bg-red-950/30"
              textColor="text-red-600"
            />
            <MetricCard
              title="Net Profit"
              value={formatCurrency(overviewMetrics?.profit || 0)}
              icon={<TrendingUp className="text-amber-600" />}
              bgColor="bg-amber-50 dark:bg-amber-950/30"
              textColor="text-amber-600"
            />
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Security Deposits
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <MetricCard
                title="Deposits Collected"
                value={formatCurrency(securityDepositSummary?.collected || 0)}
                icon={<ShieldCheck className="text-blue-600" />}
                bgColor="bg-blue-50 dark:bg-blue-950/30"
                textColor="text-blue-600"
              />
              <MetricCard
                title="Deposits Refunded"
                value={formatCurrency(securityDepositSummary?.refunded || 0)}
                icon={<RotateCcw className="text-amber-600" />}
                bgColor="bg-amber-50 dark:bg-amber-950/30"
                textColor="text-amber-600"
              />
              <MetricCard
                title="Outstanding Deposits"
                value={formatCurrency(securityDepositSummary?.outstanding || 0)}
                icon={<AlertCircle className="text-purple-600" />}
                bgColor="bg-purple-50 dark:bg-purple-950/30"
                textColor="text-purple-600"
              />
            </div>
          </div>

          <Card className="shadow-card border border-border bg-card h-[400px] w-full p-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                />
                <RechartsTooltip
                  cursor={{ fill: "hsl(var(--secondary))" }}
                  contentStyle={{
                    borderRadius: 16,
                    borderColor: "hsl(var(--border))",
                    backgroundColor: "hsl(var(--card))",
                    color: "hsl(var(--card-foreground))",
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={80}>
                  {chartData.map((e, i) => (
                    <Cell key={`cell-${i}`} fill={e.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        <TabsContent value="generate" className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="shadow-card border border-border bg-card">
              <CardHeader className="text-left">
                <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                  <Layers className="h-5 w-5 text-amber-500" /> Configurator
                </CardTitle>
                <CardDescription>
                  Select target and period for breakdown.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground block">
                      Report Type
                    </label>
                    <Select
                      value={reportType}
                      onValueChange={(v) => {
                        setReportType(v);
                        setSelectedEntity("all");
                      }}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unit">Property Unit</SelectItem>
                        <SelectItem value="agent">Booking Agent</SelectItem>
                        <SelectItem value="investor">Investor Share</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground block">
                      Select Name
                    </label>
                    <Select
                      value={selectedEntity}
                      onValueChange={setSelectedEntity}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Choose entity..." />
                      </SelectTrigger>
                      <SelectContent>
                        {dropdownEntities.map((e) => (
                          <SelectItem key={e.id} value={String(e.id)}>
                            {e.name || e.unitNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={handleGenerate}
                    disabled={
                      isGenerating ||
                      (selectedEntity === "all" && reportType !== "unit")
                    }
                    className="w-full gradient-btn text-white font-bold h-12 shadow-md"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Calculator className="h-4 w-4 mr-2" />
                    )}
                    Calculate Statement
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="lg:col-span-2 space-y-6">
              {generatedReport ? (
                <div className="space-y-6">
                  <Card className="shadow-xl border border-border bg-card overflow-hidden">
                    <div className="p-6 bg-secondary/50 border-b border-border flex justify-between items-center text-left">
                      <div>
                        <h3 className="font-black text-foreground uppercase tracking-tight">
                          {generatedReport.name}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {reportType.toUpperCase()} STATEMENT •{" "}
                          {generatedReport.period}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-2 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                          onClick={handleGenerateAiSummary}
                          disabled={isAiLoading}
                        >
                          {isAiLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          AI Summary
                        </Button>
                        <Badge className="bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 h-8">
                          Generated
                        </Badge>
                      </div>
                    </div>
                    <CardContent className="p-8">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                        <div className="p-6 bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-100 dark:border-green-800 text-left">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                            Total Revenue
                          </span>
                          <div className="text-2xl font-black text-green-600 dark:text-green-400">
                            {formatCurrency(generatedReport.revenue)}
                          </div>
                        </div>

                        {reportType === "unit" && (
                          <div className="p-6 bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-100 dark:border-red-800 text-left">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                              Total Expenses
                            </span>
                            <div className="text-2xl font-black text-red-600 dark:text-red-400">
                              {formatCurrency(generatedReport.expenses)}
                            </div>
                          </div>
                        )}

                        {reportType === "agent" && (
                          <div className="p-6 bg-blue-50 dark:bg-blue-950/30 rounded-2xl border border-blue-100 dark:border-blue-800 text-left">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                              Commission Due
                            </span>
                            <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
                              {formatCurrency(generatedReport.commission)}
                            </div>
                          </div>
                        )}

                        {reportType === "investor" && (
                          <div className="p-6 bg-purple-50 dark:bg-purple-950/30 rounded-2xl border border-purple-100 dark:border-purple-800 text-left">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                              Investor Share
                            </span>
                            <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
                              {formatCurrency(generatedReport.investorShare)}
                            </div>
                          </div>
                        )}

                        <div className="p-6 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-100 dark:border-amber-800 text-left">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                            Net Flow/Profit
                          </span>
                          <p className="text-3xl font-black text-amber-600 dark:text-amber-400 tracking-tight">
                            {formatCurrency(generatedReport.profit)}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {generatedReport.completedBookings} completed
                            booking(s) − Expenses
                          </p>
                        </div>
                        <div className="p-6 bg-blue-50 dark:bg-blue-950/30 rounded-2xl border border-blue-100 dark:border-blue-800 text-left">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                            Gross Income (Base)
                          </span>
                          <p className="text-3xl font-black text-blue-600 dark:text-blue-400 tracking-tight">
                            {formatCurrency(generatedReport.grossIncome || 0)}
                          </p>
                        </div>
                      </div>

                      {aiSummary && (
                        <div className="mt-8 p-6 bg-amber-50/50 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-800 animate-in fade-in slide-in-from-top-2 duration-500 text-left">
                          <div className="flex items-center gap-2 mb-3 text-amber-700 dark:text-amber-300">
                            <Wand2 className="h-4 w-4" />
                            <span className="text-xs font-black uppercase tracking-widest">
                              AI Financial Insight
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed text-foreground/80 italic">
                            {aiSummary}
                          </p>
                        </div>
                      )}

                      <div className="mt-8 p-4 bg-secondary/50 rounded-xl border border-dashed border-border">
                        <p className="text-xs text-muted-foreground italic text-center">
                          This report is a prorated financial summary based on
                          check-in/check-out dates within the selected month.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] border-2 border-dashed border-border rounded-3xl bg-secondary/30">
                  <div className="p-4 bg-card rounded-full shadow-sm mb-4">
                    <BarChart3 className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">
                    Select an entity to generate a statement.
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="performance">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {unitRankings.map((unit, index) => (
              <Card
                key={index}
                className={cn(
                  "shadow-card border border-border bg-card p-5 hover:ring-2 hover:ring-amber-500/20 transition-all text-left",
                  index === 0 &&
                    "border-amber-300 dark:border-amber-700 ring-1 ring-amber-500/30",
                )}
              >
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-black">
                      #{index + 1}
                    </div>
                    <CardTitle className="text-base font-bold text-foreground">
                      {unit.name}
                    </CardTitle>
                  </div>
                  {index === 0 ? (
                    <div className="flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-1">
                      <Trophy className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                        Top Revenue Unit
                      </span>
                    </div>
                  ) : (
                    <Trophy className="h-5 w-5 text-muted-foreground/20" />
                  )}
                </div>

                <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-100 dark:border-green-800 text-center mb-4">
                  <span className="text-[9px] uppercase font-bold text-green-700 dark:text-green-300 block mb-1">
                    Revenue Earned
                  </span>
                  <span className="text-2xl font-black text-green-600 dark:text-green-400 tracking-tight">
                    {formatCurrency(unit.revenue)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-center mb-4">
                  <div className="bg-red-50 dark:bg-red-950/30 p-3 rounded-xl border border-red-100 dark:border-red-800">
                    <span className="text-[9px] uppercase font-bold text-red-700 dark:text-red-300 block mb-1">
                      Expenses
                    </span>
                    <span className="text-sm font-black text-red-600 dark:text-red-400">
                      {formatCurrency(unit.expenses || 0)}
                    </span>
                    {unit.historicalExpenses > 0 && (
                      <span className="text-[9px] text-muted-foreground block mt-0.5">
                        incl. historical{" "}
                        {formatCurrency(unit.historicalExpenses)}
                      </span>
                    )}
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-100 dark:border-amber-800">
                    <span className="text-[9px] uppercase font-bold text-amber-700 dark:text-amber-300 block mb-1">
                      Net Profit
                    </span>
                    <span className="text-sm font-black text-amber-600 dark:text-amber-400">
                      {formatCurrency(unit.profit)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-secondary/50 px-3 py-2 text-center">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground block mb-0.5">
                      Completed Bookings
                    </span>
                    <span className="text-sm font-black text-foreground">
                      {unit.completedBookings}
                    </span>
                  </div>
                  <div className="rounded-lg bg-secondary/50 px-3 py-2 text-center">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground block mb-0.5">
                      Occupancy
                    </span>
                    <span className="text-sm font-black text-foreground">
                      {unit.occupiedNights} nights
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="security-deposits" className="space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                Security Deposit Monitoring
              </h2>
              <p className="text-muted-foreground mt-1">
                Monitor and report on security deposit activity
              </p>
            </div>
            <Button
              variant="secondary"
              className="h-10 rounded-2xl"
              onClick={exportSecurityDepositLedger}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <SDSummaryCard
              title="Total Collected"
              value={formatCurrency(sdMetrics.totalCollected)}
              icon={<ShieldCheck className="text-blue-600" />}
              bgColor="bg-blue-50 dark:bg-blue-950/30"
              textColor="text-blue-600"
            />
            <SDSummaryCard
              title="Total Refunded"
              value={formatCurrency(sdMetrics.totalRefunded)}
              icon={<RotateCcw className="text-amber-600" />}
              bgColor="bg-amber-50 dark:bg-amber-950/30"
              textColor="text-amber-600"
            />
            <SDSummaryCard
              title="Active Held"
              value={formatCurrency(sdMetrics.activeHeld)}
              icon={<Handshake className="text-green-600" />}
              bgColor="bg-green-50 dark:bg-green-950/30"
              textColor="text-green-600"
            />
            <SDSummaryCard
              title="Unpaid Deposits"
              value={formatCurrency(sdMetrics.unpaidDeposits)}
              icon={<Calculator className="text-slate-600" />}
              bgColor="bg-slate-50 dark:bg-slate-950/30"
              textColor="text-slate-600"
            />
          </div>

          <FilterBar>
            <Select
              value={`${sdFilters.month}-${sdFilters.year}`}
              onValueChange={(v) => {
                const parts = v.split("-");
                setSdFilters({
                  ...sdFilters,
                  month: parseInt(parts[0], 10),
                  year: parseInt(parts[1], 10),
                });
              }}
            >
              <SelectTrigger className="bg-background h-10 w-auto min-w-[160px] rounded-2xl border-border text-sm text-foreground">
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {Array.from({ length: 12 }, (_, i) => {
                  const m = new Date(year, i, 1);
                  return (
                    <SelectItem
                      key={m.toISOString()}
                      value={`${i + 1}-${year}`}
                    >
                      {m.toLocaleString("default", {
                        month: "long",
                        year: "numeric",
                      })}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            <Select
              value={sdFilters.unit}
              onValueChange={(v) =>
                setSdFilters({
                  ...sdFilters,
                  unit: v,
                })
              }
            >
              <SelectTrigger className="bg-background h-10 w-auto min-w-[160px] rounded-2xl border-border text-sm text-foreground">
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="all">All Units</SelectItem>
                {data.units.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name || u.unitNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sdFilters.status}
              onValueChange={(v) => setSdFilters({ ...sdFilters, status: v })}
            >
              <SelectTrigger className="bg-background h-10 w-auto min-w-[160px] rounded-2xl border-border text-sm text-foreground">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Partial">Partial</SelectItem>
                <SelectItem value="Unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sdFilters.agent}
              onValueChange={(v) => setSdFilters({ ...sdFilters, agent: v })}
            >
              <SelectTrigger className="bg-background h-10 w-auto min-w-[160px] rounded-2xl border-border text-sm text-foreground">
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="all">All Agents</SelectItem>
                {sdAgentOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sdFilters.guest}
              onValueChange={(v) => setSdFilters({ ...sdFilters, guest: v })}
            >
              <SelectTrigger className="bg-background h-10 w-auto min-w-[160px] rounded-2xl border-border text-sm text-foreground">
                <SelectValue placeholder="Guest" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="all">All Guests</SelectItem>
                {sdGuestOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="secondary"
              className="h-10 rounded-2xl"
              onClick={() =>
                setSdFilters({
                  month: month + 1,
                  year,
                  unit: "all",
                  agent: "all",
                  guest: "all",
                  status: "all",
                })
              }
            >
              Reset
            </Button>
          </FilterBar>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-card border border-border bg-card h-[360px] w-full p-6">
              <CardTitle className="text-sm font-bold text-foreground mb-2">
                Security Deposits by Unit
              </CardTitle>
              <div className="h-[280px] w-full">
                {sdUnitChartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-muted-foreground">
                      No deposit data available for the selected filters.
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={sdUnitChartData}
                      layout="vertical"
                      margin={{ top: 10, right: 40, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        type="number"
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 12,
                        }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={90}
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 12,
                        }}
                      />
                      <RechartsTooltip
                        cursor={{ fill: "hsl(var(--secondary))" }}
                        formatter={(value: any) => [
                          formatCurrency(Number(value) || 0),
                          "Deposit",
                        ]}
                        contentStyle={{
                          borderRadius: 16,
                          borderColor: "hsl(var(--border))",
                          backgroundColor: "hsl(var(--card))",
                          color: "hsl(var(--card-foreground))",
                        }}
                      />
                      <Bar
                        dataKey="value"
                        name="Deposit Amount"
                        fill="#3b82f6"
                        radius={[0, 6, 6, 0]}
                        barSize={26}
                      >
                        {sdUnitChartData.map((_entry, index) => (
                          <Cell key={`unit-cell-${index}`} fill="#3b82f6" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card className="shadow-card border border-border bg-card h-[360px] w-full p-6">
              <CardTitle className="text-sm font-bold text-foreground mb-2">
                Security Deposit Status Distribution
              </CardTitle>
              <div className="h-[280px] w-full">
                {sdFilteredDeposits.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-muted-foreground">
                      No deposit data available for the selected filters.
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={sdStatusChartData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 12,
                        }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 12,
                        }}
                      />
                      <RechartsTooltip
                        cursor={{ fill: "hsl(var(--secondary))" }}
                        formatter={(value: any) => [
                          formatCurrency(Number(value) || 0),
                          "Deposit Amount",
                        ]}
                        contentStyle={{
                          borderRadius: 16,
                          borderColor: "hsl(var(--border))",
                          backgroundColor: "hsl(var(--card))",
                          color: "hsl(var(--card-foreground))",
                        }}
                      />
                      <Bar
                        dataKey="value"
                        name="Deposit Amount"
                        radius={[6, 6, 0, 0]}
                        barSize={52}
                      >
                        {sdStatusChartData.map((entry, index) => {
                          const color =
                            entry.name === "Paid"
                              ? "#10b981"
                              : entry.name === "Partial"
                                ? "#f59e0b"
                                : "#ef4444";
                          return (
                            <Cell key={`status-cell-${index}`} fill={color} />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          <Card className="shadow-card border border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-foreground">
                Security Deposit Ledger
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                One row per booking. Deposit amounts, status, and assigned agent
                come directly from Bookings, the single source of truth.
              </p>
            </CardHeader>
            <CardContent>
              {securityLedger.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No deposit records found for the selected filters.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2 pr-3">Guest</th>
                        <th className="py-2 pr-3">Unit</th>
                        <th className="py-2 pr-3 text-right">Deposit Amount</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2">Assigned Agent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {securityLedger.map((entry, index) => (
                        <tr
                          key={entry.id || entry.bookingId || index}
                          className="border-b border-border/60"
                        >
                          <td className="py-2 pr-3">
                            {entry.guestName || "—"}
                          </td>
                          <td className="py-2 pr-3">
                            {entry.unitName || entry.unitId || "—"}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {formatCurrency(Number(entry.depositAmount) || 0)}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge
                              className={`rounded-full ${
                                entry.status === "Paid"
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                  : entry.status === "Partial"
                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                              }`}
                            >
                              {entry.status || "—"}
                            </Badge>
                          </td>
                          <td className="py-2">
                            {looksLikeFirestoreId(entry.agent)
                              ? "—"
                              : entry.agent || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon,
  bgColor,
  textColor,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
}) {
  return (
    <Card className="shadow-card border border-border bg-card p-6 text-left">
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
          {title}
        </span>
        <div className={cn("p-2.5 rounded-xl shadow-sm", bgColor)}>{icon}</div>
      </div>
      <div className={cn("text-3xl font-black tracking-tight", textColor)}>
        {value}
      </div>
    </Card>
  );
}

function SDSummaryCard({
  title,
  value,
  icon,
  bgColor,
  textColor,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
}) {
  return (
    <Card className="shadow-card border border-border bg-card p-6 text-left">
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
          {title}
        </span>
        <div className={cn("p-2.5 rounded-xl shadow-sm", bgColor)}>{icon}</div>
      </div>
      <div className={cn("text-3xl font-black tracking-tight", textColor)}>
        {value}
      </div>
    </Card>
  );
}
