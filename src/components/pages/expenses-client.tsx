"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useUser, useAuth } from "@/firebase";
import { apiClient } from "@/lib/api-client";
import { useAppResources } from "@/lib/app-data-store";
import { useDateStore } from "@/lib/date-store";
import { formatCurrency, todayLocalDateInput } from "@/lib/utils-app";
import { getHistoricalSummaryForMonth } from "@/lib/historical-expense-summaries";
import { cn } from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Loader2,
  Plus,
  Download,
  Trash2,
  Edit2,
  MoreVertical,
  Receipt,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";
import { canManageOperations } from "@/auth/roles";

const CATEGORY_COLORS: Record<string, string> = {
  Utilities: "#3b82f6", // Blue
  Repairs: "#f59e0b", // Orange
  Supplies: "#22c55e", // Green
  Rent: "#8b5cf6", // Purple
  "Agent Commission": "#f97316", // Dark Orange
  "Other Expenses": "#ef4444", // Red
  "Shared Expense": "#fbbf24", // Amber
  "Staff Salaries / Wages": "#14b8a6", // Teal
};

function normalizeText(value: any) {
  return String(value ?? "").trim();
}

function toNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeExpensePayload(payload: Record<string, any>): any {
  if (payload === undefined || payload === null) return {};
  if (Array.isArray(payload)) {
    return payload
      .map((value) => sanitizeExpensePayload(value as Record<string, any>))
      .filter((value) => Object.keys(value).length > 0);
  }

  const sanitized: Record<string, any> = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === "string" && value.trim() === "") return;
    if (typeof value === "object") {
      const cleaned = sanitizeExpensePayload(value as Record<string, any>);
      if (Object.keys(cleaned).length > 0) sanitized[key] = cleaned;
      return;
    }
    sanitized[key] = value;
  });
  return sanitized;
}

const UnitCheckboxRow = React.memo(function UnitCheckboxRow({
  unitId,
  unitName,
  isSelected,
  onToggle,
}: {
  unitId: string;
  unitName: string;
  isSelected: boolean;
  onToggle: (unitId: string, checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 p-2 rounded-lg border border-border hover:bg-secondary cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => onToggle(unitId, e.target.checked)}
        className="rounded"
      />
      <span className="text-sm font-medium text-foreground flex-1">
        {unitName}
      </span>
      {isSelected && <div className="w-2 h-2 rounded-full bg-green-500" />}
    </label>
  );
});

function getExpenseTotalAmount(expense: any) {
  return toNumber(expense?.calculatedTotal ?? expense?.amount ?? 0, 0);
}

export default function ExpensesClient() {
  const { role } = useUserRole();
  const { user } = useUser();
  const auth = useAuth();
  const { toast } = useToast();
  const { month, year } = useDateStore();

  const resources = useAppResources(["expenses", "units", "agents"]);
  const expenses = resources.data["expenses"] ?? [];
  const units = resources.data["units"] ?? [];
  const agents = resources.data["agents"] ?? [];
  const loading = resources.loading;

  // Modals & Forms
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);

  // Sort state
  const [sortField, setSortField] = useState<string>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Memoized unit lookup map for O(1) access
  const unitMap = useMemo(() => {
    const map = new Map<string, any>();
    units.forEach((unit: any) => map.set(String(unit.id), unit));
    return map;
  }, [units]);

  const getUnitById = (id: string) => unitMap.get(String(id));
  const getUnitNamesForIds = (ids: string[]) =>
    ids
      .map((id) =>
        normalizeText(
          getUnitById(id)?.name || getUnitById(id)?.unitNumber || "",
        ),
      )
      .filter(Boolean);

  const getEditingUnitSelectionMode = (expense: any) => {
    if (!expense) return "single";
    if (expense.unitSelectionMode) return expense.unitSelectionMode;
    if (
      Array.isArray(expense.unitIds) &&
      expense.unitIds.length === units.length &&
      units.length > 0
    )
      return "all";
    if (Array.isArray(expense.unitIds) && expense.unitIds.length > 1)
      return "multiple";
    if (expense.unitId) return "single";
    return "single";
  };

  const selectedUnitIds = useMemo(() => {
    if (!editingExpense) return [];
    const mode = getEditingUnitSelectionMode(editingExpense);
    if (mode === "all") {
      return units.map((unit: any) => String(unit.id));
    }
    if (
      Array.isArray(editingExpense.unitIds) &&
      editingExpense.unitIds.length
    ) {
      return editingExpense.unitIds.map((id: any) => String(id));
    }
    if (editingExpense.unitId) {
      return [String(editingExpense.unitId)];
    }
    return [];
  }, [editingExpense, units]);

  const selectedUnitIdSet = useMemo(() => {
    return new Set(
      (editingExpense?.unitIds || []).map((id: string) => String(id)),
    );
  }, [editingExpense?.unitIds]);

  const getExpenseAffectedUnitIds = (expense: any) => {
    if (
      expense?.unitSelectionMode === "all" ||
      (Array.isArray(expense?.unitIds) &&
        expense?.unitIds.length === units.length &&
        units.length > 0)
    ) {
      return units.map((unit: any) => String(unit.id));
    }
    if (Array.isArray(expense?.unitIds) && expense.unitIds.length) {
      return expense.unitIds.map((id: any) => String(id));
    }
    if (expense?.unitId) {
      return [String(expense.unitId)];
    }
    return [];
  };

  const getExpenseAffectedUnitNames = (expense: any) => {
    const ids = getExpenseAffectedUnitIds(expense);
    if (ids.length) {
      if (
        expense?.unitSelectionMode === "all" ||
        (units.length > 0 && ids.length === units.length)
      ) {
        return ["All Units"];
      }
      return getUnitNamesForIds(ids);
    }
    if (expense?.unitName) {
      return expense.unitName
        .split(",")
        .map((name: string) => normalizeText(name))
        .filter(Boolean);
    }
    return ["General/Unassigned"];
  };

  const getExpenseDisplayUnitName = (expense: any) => {
    const names = getExpenseAffectedUnitNames(expense);
    return names.join(", ") || "General/Unassigned";
  };

  const getExpenseStatusBadge = (status?: string) => {
    const normalized = String(status || "Paid")
      .trim()
      .toLowerCase();
    const label =
      normalized === "cancelled"
        ? "Cancelled"
        : normalized === "pending"
          ? "Pending"
          : "Paid";
    const badgeClass =
      normalized === "cancelled"
        ? "bg-red-100 text-red-700"
        : normalized === "pending"
          ? "bg-amber-100 text-amber-700"
          : "bg-green-100 text-green-700";
    return (
      <Badge
        className={cn("border-none text-[9px] uppercase font-bold", badgeClass)}
      >
        {label}
      </Badge>
    );
  };

  const toggleSelectedUnit = useCallback((unitId: string, checked: boolean) => {
    setEditingExpense((prev: any) => {
      if (!prev) return prev;
      const currentIds = Array.isArray(prev.unitIds) ? prev.unitIds : [];
      const nextIds = checked
        ? Array.from(new Set([...currentIds, String(unitId)]))
        : currentIds.filter((id: string) => String(id) !== String(unitId));
      return {
        ...prev,
        unitIds: nextIds,
        unitId: "",
      };
    });
  }, []);

  const selectAllUnits = useCallback(() => {
    setEditingExpense((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        unitIds: units.map((unit: any) => String(unit.id)),
        unitId: "",
      };
    });
  }, [units]);

  const clearAllUnits = useCallback(() => {
    setEditingExpense((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        unitIds: [],
        unitId: "",
      };
    });
  }, []);

  const getRecordedByLabel = (expense: any) => {
    return (
      expense.recordedByName ||
      expense.recordedBy ||
      expense.recordedByEmail ||
      expense.userName ||
      expense.userEmail ||
      "Unknown"
    );
  };

  const validateExpenseDistribution = (expense: any) => {
    const mode = expense?.unitSelectionMode || "single";
    const totalAmount = toNumber(expense?.amount, 0);

    // Strengthened amount validation
    if (
      expense?.amount === "" ||
      expense?.amount === null ||
      expense?.amount === undefined
    )
      return "Amount is required.";
    if (!Number.isFinite(Number(expense.amount)))
      return "Amount must be a valid number.";
    if (Number(expense.amount) <= 0) return "Amount must be greater than zero.";
    if (totalAmount <= 0) return "Amount must be greater than zero.";

    let unitIds = getExpenseAffectedUnitIds(expense).map((id: any) =>
      String(id),
    );
    if (mode === "all" && units.length > 0) {
      unitIds = units.map((unit: any) => String(unit.id));
    }

    const validUnitIds: string[] = Array.from(
      new Set(unitIds.filter((id: string) => unitMap.has(id))),
    );

    // Validate multiple units
    if (mode === "multiple") {
      if (validUnitIds.length === 0) {
        return "Select at least one unit for multiple units.";
      }
    }

    // Validate single unit — General/Unassigned (empty unitId) is allowed
    if (mode === "single") {
      if (validUnitIds.length > 1) {
        return "Single unit mode allows only one unit.";
      }
      if (expense?.unitId && !validUnitIds.includes(String(expense.unitId))) {
        return "Selected unit is invalid.";
      }
    }

    const distributionValues = expense?.distributionValues as
      | Record<string, any>
      | undefined;
    if (expense?.distributionMode === "percentage" && validUnitIds.length > 1) {
      const sum = validUnitIds.reduce<number>(
        (acc, id) => acc + toNumber(distributionValues?.[id], 0),
        0,
      );
      if (Math.abs(sum - 100) > 0.001) {
        return "Total percentage must equal exactly 100%.";
      }
    }

    if (expense?.distributionMode === "custom" && validUnitIds.length > 1) {
      const sum = validUnitIds.reduce<number>(
        (acc, id) => acc + toNumber(distributionValues?.[id], 0),
        0,
      );
      if (Math.abs(sum - totalAmount) > 0.01) {
        return "Custom amounts must equal the total expense amount.";
      }
    }

    return null;
  };

  const handleExportExpensesCsv = () => {
    const headers = [
      "Date",
      "Title",
      "Category",
      "Affected Units",
      "Payment Method",
      "Status",
      "Recorded By",
      "Amount",
      "Notes",
    ];
    const rows = filteredExpenses.map((expense) => {
      const date = expense.date?.split("T")[0] || "";
      const title = expense.title || expense.name || "";
      const category = expense.category || "Other Expenses";
      const affected = getExpenseDisplayUnitName(expense);
      const method = expense.paymentMethod || "CASH";
      const status = expense.status || "Paid";
      const recordedBy = getRecordedByLabel(expense);
      const amount = formatCurrency(getExpenseTotalAmount(expense));
      const notes = expense.notes || "";
      const escapeValue = (value: string) =>
        `"${String(value).replace(/"/g, '""')}"`;
      return [
        date,
        title,
        category,
        affected,
        method,
        status,
        recordedBy,
        amount,
        notes,
      ]
        .map(escapeValue)
        .join(",");
    });

    const csv = [headers.map((h) => `"${h}"`).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `expenses-${todayLocalDateInput()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  type DistributionItem = {
    id: string;
    amount: number;
    name: string;
  };

  const getExpenseDistributionAmounts = (expense: any): DistributionItem[] => {
    const total = getExpenseTotalAmount(expense);
    const ids = getExpenseAffectedUnitIds(expense);
    if (!ids.length) return [];

    if (expense?.distributionMode === "custom" && expense?.distributionValues) {
      return ids.map((id: string) => {
        const value = toNumber(expense.distributionValues[id], 0);
        return {
          id,
          amount: value,
          name: normalizeText(
            getUnitById(id)?.name || getUnitById(id)?.unitNumber || "",
          ),
        };
      });
    }

    if (
      expense?.distributionMode === "percentage" &&
      expense?.distributionValues
    ) {
      const roundedValues: Array<{ id: string; value: number; name: string }> =
        ids.map((id: string) => {
          const percent = toNumber(expense.distributionValues[id], 0);
          const value = Math.round(((total * percent) / 100) * 100) / 100;
          return {
            id,
            value,
            name: normalizeText(
              getUnitById(id)?.name || getUnitById(id)?.unitNumber || "",
            ),
          };
        });
      const roundedSum = roundedValues.reduce(
        (sum: number, item) => sum + item.value,
        0,
      );
      const remainder = Math.round((total - roundedSum) * 100) / 100;
      if (remainder !== 0 && roundedValues.length > 0) {
        roundedValues[roundedValues.length - 1].value += remainder;
        roundedValues[roundedValues.length - 1].value =
          Math.round(roundedValues[roundedValues.length - 1].value * 100) / 100;
      }
      return roundedValues.map((item) => ({
        id: item.id,
        amount: item.value,
        name: item.name,
      }));
    }

    const equalShare = Math.round((total / ids.length) * 100) / 100;
    return ids.map((id: string, index: number) => ({
      id,
      amount:
        index === ids.length - 1
          ? total - equalShare * (ids.length - 1)
          : equalShare,
      name: normalizeText(
        getUnitById(id)?.name || getUnitById(id)?.unitNumber || "",
      ),
    }));
  };

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterUnitId, setFilterUnitId] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  // Sort handler
  const handleSort = useCallback(
    (field: string) => {
      setSortDirection((prev) =>
        sortField === field ? (prev === "asc" ? "desc" : "asc") : "desc",
      );
      setSortField(field);
    },
    [sortField],
  );

  // Filter & Sort Data
  const filteredExpenses = useMemo(() => {
    const filtered = expenses.filter((expense) => {
      const eDate = expense.date?.split("T")[0] || "";

      // Default to current month if no explicit date range is set
      let matchesDate = eDate.startsWith(monthKey);
      if (startDate || endDate) {
        matchesDate = true;
        if (startDate && eDate < startDate) matchesDate = false;
        if (endDate && eDate > endDate) matchesDate = false;
      }

      const matchesSearch = (expense.title || expense.name || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesCategory =
        filterCategory === "all" || expense.category === filterCategory;
      const affectedUnitIds = getExpenseAffectedUnitIds(expense);
      const matchesUnit =
        filterUnitId === "all" || affectedUnitIds.includes(filterUnitId);

      return matchesDate && matchesSearch && matchesCategory && matchesUnit;
    });

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let valueA: string, valueB: string;
      switch (sortField) {
        case "date":
          valueA = a.date || "";
          valueB = b.date || "";
          break;
        case "title":
          valueA = (a.title || a.name || "").toLowerCase();
          valueB = (b.title || b.name || "").toLowerCase();
          break;
        case "category":
          valueA = (a.category || "").toLowerCase();
          valueB = (b.category || "").toLowerCase();
          break;
        case "unit":
          valueA = getExpenseDisplayUnitName(a).toLowerCase();
          valueB = getExpenseDisplayUnitName(b).toLowerCase();
          break;
        case "payment":
          valueA = (a.paymentMethod || "CASH").toLowerCase();
          valueB = (b.paymentMethod || "CASH").toLowerCase();
          break;
        case "status":
          valueA = (a.status || "Paid").toLowerCase();
          valueB = (b.status || "Paid").toLowerCase();
          break;
        case "recordedBy":
          valueA = getRecordedByLabel(a).toLowerCase();
          valueB = getRecordedByLabel(b).toLowerCase();
          break;
        case "amount":
          return sortDirection === "asc"
            ? getExpenseTotalAmount(a) - getExpenseTotalAmount(b)
            : getExpenseTotalAmount(b) - getExpenseTotalAmount(a);
        default:
          valueA = a.date || "";
          valueB = b.date || "";
      }
      const compare = valueA.localeCompare(valueB);
      return sortDirection === "asc" ? compare : -compare;
    });

    return sorted;
  }, [
    expenses,
    monthKey,
    startDate,
    endDate,
    searchTerm,
    filterCategory,
    filterUnitId,
    sortField,
    sortDirection,
  ]);

  // Aggregations
  const { categoryTotals, unitTotals, grandTotal } = useMemo(() => {
    let grandTotal = 0;
    const catMap: Record<string, number> = {};
    const unitMap: Record<string, number> = {};

    filteredExpenses.forEach((exp) => {
      const amt = getExpenseTotalAmount(exp);
      const cat = exp.category || "Other Expenses";
      const distribution = getExpenseDistributionAmounts(exp);

      grandTotal += amt;
      catMap[cat] = (catMap[cat] || 0) + amt;

      if (distribution.length > 0) {
        distribution.forEach((item: DistributionItem) => {
          unitMap[item.name] = (unitMap[item.name] || 0) + item.amount;
        });
      } else {
        const uName = exp.unitName || "General/Unassigned";
        unitMap[uName] = (unitMap[uName] || 0) + amt;
      }
    });

    const categoryTotals = Object.entries(catMap)
      .map(([name, value]) => ({
        name,
        value,
        color: CATEGORY_COLORS[name] || CATEGORY_COLORS["Other Expenses"],
      }))
      .sort((a, b) => b.value - a.value);

    const unitTotals = Object.entries(unitMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { categoryTotals, unitTotals, grandTotal };
  }, [filteredExpenses]);

  const maxUnitValue = unitTotals.length > 0 ? unitTotals[0].value : 1;

  const handleOpenNew = () => {
    setEditingExpense({
      date: todayLocalDateInput(),
      title: "",
      category: "Utilities",
      unitId: "",
      unitIds: [],
      unitSelectionMode: "single",
      distributionMode: "equal",
      distributionValues: {},
      unitName: "General/Unassigned",
      paymentMethod: "CASH",
      status: "Paid",
      amount: "",
      notes: "",
      recordedByName: user?.displayName || user?.email || "",
      recordedByEmail: user?.email || "",
    });
    setIsModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    if (!canManageOperations(role)) return;
    e.preventDefault();
    if (formLoading) return;
    if (
      !editingExpense.title ||
      !editingExpense.amount ||
      !editingExpense.date ||
      !editingExpense.category
    ) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Date, Title, Category, and Amount are required.",
      });
      return;
    }

    const validationError = validateExpenseDistribution(editingExpense);
    if (validationError) {
      toast({
        variant: "destructive",
        title: "Error",
        description: validationError,
      });
      return;
    }

    setFormLoading(true);
    const totalAmount = toNumber(editingExpense.amount, 0);
    let unitIds: string[] = getExpenseAffectedUnitIds(editingExpense).map(
      (id: any) => String(id),
    );
    if (editingExpense.unitSelectionMode === "all" && units.length > 0) {
      unitIds = units.map((unit: any) => String(unit.id));
    }

    if (
      editingExpense.unitSelectionMode !== "all" &&
      unitIds.length === 0 &&
      editingExpense.unitId
    ) {
      unitIds.push(String(editingExpense.unitId));
    }

    unitIds = [
      ...new Set(
        unitIds.filter((id: string) =>
          units.some((unit: any) => String(unit.id) === id),
        ),
      ),
    ];

    const validUnitNames = getExpenseAffectedUnitNames({
      ...editingExpense,
      unitIds,
      unitSelectionMode: editingExpense.unitSelectionMode,
    });

    // Build payload with strict undefined filtering
    const frequency =
      editingExpense.frequency === "recurring" ? "recurring" : "one_time";
    const payload: any = {
      uid: user?.uid,
      title: editingExpense.title,
      date: editingExpense.date,
      amount: totalAmount,
      amountMode: "total",
      frequency,
      category: editingExpense.category,
      paymentMethod: editingExpense.paymentMethod || "CASH",
      status: editingExpense.status || "Paid",
      unitName: validUnitNames.join(", ") || "General/Unassigned",
      recordedByName: editingExpense.recordedByName || user?.displayName || "",
      recordedByEmail: editingExpense.recordedByEmail || user?.email || "",
      recordedBy: editingExpense.recordedBy || user?.email || "",
      updatedAt: new Date().toISOString(),
    };

    if (
      frequency === "recurring" &&
      editingExpense.recurringDay !== undefined &&
      editingExpense.recurringDay !== null &&
      editingExpense.recurringDay !== ""
    ) {
      const recurringDay = Number(editingExpense.recurringDay);
      if (Number.isFinite(recurringDay)) payload.recurringDay = recurringDay;
    }
    if (frequency !== "recurring") delete payload.recurringDay;

    // Only include unitIds/unitId if applicable
    if (unitIds.length > 0) {
      payload.unitIds = unitIds;
    }
    if (unitIds.length === 1) {
      payload.unitId = unitIds[0];
    }

    // Only include unit selection mode if multiple units
    if (editingExpense.unitSelectionMode) {
      payload.unitSelectionMode = editingExpense.unitSelectionMode;
    }

    // Only include distribution if multiple units selected
    if (unitIds.length > 1) {
      payload.distributionMode = editingExpense.distributionMode || "equal";
      payload.distributionValues = editingExpense.distributionValues || {};
    }

    // Only include agent commission fields if category is Agent Commission
    if (editingExpense.category === "Agent Commission") {
      if (editingExpense.agentId) {
        payload.agentId = editingExpense.agentId;
      }
      if (editingExpense.agentName) {
        payload.agentName = editingExpense.agentName;
      }
      payload.commissionStatus = editingExpense.commissionStatus || "on hold";
    }

    // Only include notes if provided
    if (editingExpense.notes) {
      payload.notes = editingExpense.notes;
    }

    const cleanedPayload = sanitizeExpensePayload(payload);

    try {
      if (editingExpense.id) {
        await apiClient.put(
          `/expense/${editingExpense.id}`,
          cleanedPayload,
          auth,
        );
        toast({
          title: "Success",
          description: "Expense updated successfully.",
        });
      } else {
        cleanedPayload.createdAt = new Date().toISOString();
        await apiClient.post<any>("/expense", cleanedPayload, auth);
        toast({
          title: "Success",
          description: "Expense recorded successfully.",
        });
      }
      setIsModalOpen(false);
      await resources.refresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message,
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteExpense = async (expense: any) => {
    if (!canManageOperations(role)) return;
    if (!confirm(`Delete expense "${expense.title}"?`)) return;
    try {
      await apiClient.delete(`/expense/${expense.id}`, auth);
      toast({ title: "Deleted", description: "Expense removed." });
      await resources.refresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: error.message,
      });
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilterCategory("all");
    setFilterUnitId("all");
    setStartDate("");
    setEndDate("");
  };

  const hasActiveFilters =
    searchTerm ||
    filterCategory !== "all" ||
    filterUnitId !== "all" ||
    startDate ||
    endDate;

  if (loading && !expenses.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="animate-spin text-amber-500 h-8 w-8" />
        <p className="text-sm text-muted-foreground italic">
          Syncing Expenses...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 text-left">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Receipt className="text-amber-500" /> Expenses
          </h1>
          <p className="text-muted-foreground">
            Track your spending, categories, and unit profitability.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="text-gray-600 bg-white"
            onClick={() => window.print()}
          >
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
          <Button
            className="gradient-btn text-white"
            disabled={!canManageOperations(role)}
            onClick={handleOpenNew}
          >
            {canManageOperations(role) && (
              <>
                <Plus className="h-4 w-4 mr-2" /> Add Expense
              </>
            )}
          </Button>
        </div>
      </div>

      {/* SUMMARIES ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SUMMARY EXPENSES PER UNIT */}
        <Card className="border border-border bg-card shadow-card rounded-2xl h-[380px] flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 bg-secondary/50 rounded-t-2xl border-b border-border">
            <div>
              <CardTitle className="text-lg font-bold text-foreground">
                Summary Expenses Per Unit
              </CardTitle>
              <p className="text-xs text-muted-foreground font-medium mt-1">
                Cost distribution across properties
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Total Evaluated
              </p>
              <p className="text-xl font-black text-foreground">
                {formatCurrency(grandTotal)}
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-4 flex-1 overflow-y-auto custom-scrollbar">
            {unitTotals.length > 0 ? (
              <div className="space-y-4">
                {unitTotals.map((u, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-foreground/80">
                        {u.name}
                      </span>
                      <span className="font-bold text-foreground">
                        {formatCurrency(u.value)}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2.5">
                      <div
                        className="bg-amber-400 h-2.5 rounded-full transition-all duration-1000"
                        style={{
                          width: `${Math.max(5, (u.value / maxUnitValue) * 100)}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                No unit expenses found for this period.
              </div>
            )}
          </CardContent>
        </Card>

        {/* SUMMARY REPORT PER CATEGORY */}
        <Card className="border border-border bg-card shadow-card rounded-2xl h-[380px] flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-0">
            <CardTitle className="text-lg font-bold text-foreground">
              Summary Report Per Category
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex-1 flex flex-col md:flex-row items-center justify-center gap-6">
            {categoryTotals.length > 0 ? (
              <>
                <div className="h-[220px] w-[220px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryTotals}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {categoryTotals.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(val: number) => formatCurrency(val)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
                      Total
                    </span>
                    <span className="text-lg font-black text-foreground">
                      {formatCurrency(grandTotal)}
                    </span>
                  </div>
                </div>
                <div className="flex-1 space-y-3 w-full">
                  {categoryTotals.map((cat) => (
                    <div
                      key={cat.name}
                      className="flex justify-between items-center text-sm p-2 rounded-lg hover:bg-secondary transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-sm"
                          style={{ backgroundColor: cat.color }}
                        ></div>
                        <span className="text-muted-foreground font-medium">
                          {cat.name}
                        </span>
                      </div>
                      <span className="font-bold text-foreground">
                        {formatCurrency(cat.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
                No categorical expenses found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* HISTORICAL EXPENSE SUMMARY */}
      {(() => {
        const historical = getHistoricalSummaryForMonth(month + 1, year);
        if (!historical) return null;
        return (
          <Card className="border border-border bg-card shadow-card rounded-2xl h-[380px] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2 bg-secondary/50 rounded-t-2xl border-b border-border">
              <div>
                <CardTitle className="text-lg font-bold text-foreground">
                  Historical Expense Summary
                </CardTitle>
                <p className="text-xs text-muted-foreground font-medium mt-1">
                  {historical.sourceLabel}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Historical Total
                </p>
                <p className="text-xl font-black text-foreground">
                  {formatCurrency(historical.grandTotal)}
                </p>
              </div>
            </CardHeader>
            <CardContent className="pt-4 flex-1 overflow-y-auto custom-scrollbar">
              <div className="space-y-4">
                {historical.unitSummaries
                  .filter((u) => u.total > 0)
                  .map((u, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-bold text-foreground/80">
                          {u.unitName}
                        </span>
                        <span className="font-bold text-foreground">
                          {formatCurrency(u.total)}
                        </span>
                      </div>
                    </div>
                  ))}
                {historical.categorySummaries && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                      Category Breakdown
                    </p>
                    <div className="space-y-2">
                      {historical.categorySummaries.map((cat, i) => (
                        <div
                          key={i}
                          className="flex justify-between items-center text-sm p-2 rounded-lg hover:bg-secondary transition-colors"
                        >
                          <span className="text-muted-foreground font-medium">
                            {cat.category}
                          </span>
                          <span className="font-bold text-foreground">
                            {formatCurrency(cat.total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* FILTER BAR */}
      <div className="bg-card p-4 rounded-xl border border-border shadow-card space-y-4">
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span className="text-[10px] uppercase tracking-wider font-bold text-amber-600 dark:text-amber-400">
              Filtered Results
            </span>
            {searchTerm && (
              <span className="rounded-full bg-secondary px-2 py-0.5">
                Search: &quot;{searchTerm}&quot;
              </span>
            )}
            {filterCategory !== "all" && (
              <span className="rounded-full bg-secondary px-2 py-0.5">
                Category: {filterCategory}
              </span>
            )}
            {filterUnitId !== "all" && (
              <span className="rounded-full bg-secondary px-2 py-0.5">
                Unit:{" "}
                {units.find((u) => String(u.id) === filterUnitId)?.name ||
                  filterUnitId}
              </span>
            )}
            {(startDate || endDate) && (
              <span className="rounded-full bg-secondary px-2 py-0.5">
                Date: {startDate || "..."} → {endDate || "..."}
              </span>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
              Search
            </Label>
            <Input
              placeholder="Expense title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10"
            />
          </div>

          <div className="w-40 space-y-1">
            <Label className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
              Category
            </Label>
            <select
              className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="all">All Categories</option>
              <option value="Utilities">Utilities</option>
              <option value="Repairs">Repairs</option>
              <option value="Supplies">Supplies</option>
              <option value="Rent">Rent</option>
              <option value="Agent Commission">Agent Commission</option>
              <option value="Shared Expense">Shared Expense</option>
              <option value="Staff Salaries / Wages">
                Staff Salaries / Wages
              </option>
              <option value="Other Expenses">Other Expenses</option>
            </select>
          </div>

          <div className="w-40 space-y-1">
            <Label className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
              Unit
            </Label>
            <select
              className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
              value={filterUnitId}
              onChange={(e) => setFilterUnitId(e.target.value)}
            >
              <option value="all">All Units (Incl. General)</option>
              {units.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name || u.unitNumber}
                </option>
              ))}
            </select>
          </div>

          <div className="w-36 space-y-1">
            <Label className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
              Date From
            </Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10"
            />
          </div>

          <div className="w-36 space-y-1">
            <Label className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
              Date To
            </Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10"
            />
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              onClick={clearFilters}
              className="h-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <X className="h-4 w-4 mr-2" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* DETAILED EXPENSE RECORD TABLE */}
      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden text-left">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead
                  className="font-bold text-foreground/80 cursor-pointer select-none"
                  onClick={() => handleSort("date")}
                  aria-label="Sort by date"
                >
                  <span className="inline-flex items-center gap-1">
                    Date{" "}
                    {sortField === "date" ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </span>
                </TableHead>
                <TableHead
                  className="font-bold text-foreground/80 cursor-pointer select-none"
                  onClick={() => handleSort("title")}
                  aria-label="Sort by title"
                >
                  <span className="inline-flex items-center gap-1">
                    Expense Title{" "}
                    {sortField === "title" ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </span>
                </TableHead>
                <TableHead
                  className="font-bold text-foreground/80 cursor-pointer select-none"
                  onClick={() => handleSort("category")}
                  aria-label="Sort by category"
                >
                  <span className="inline-flex items-center gap-1">
                    Category{" "}
                    {sortField === "category" ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </span>
                </TableHead>
                <TableHead
                  className="font-bold text-foreground/80 cursor-pointer select-none"
                  onClick={() => handleSort("unit")}
                  aria-label="Sort by unit"
                >
                  <span className="inline-flex items-center gap-1">
                    Affected Unit(s){" "}
                    {sortField === "unit" ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </span>
                </TableHead>
                <TableHead
                  className="font-bold text-foreground/80 cursor-pointer select-none"
                  onClick={() => handleSort("payment")}
                  aria-label="Sort by payment method"
                >
                  <span className="inline-flex items-center gap-1">
                    Mode of Payment{" "}
                    {sortField === "payment" ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </span>
                </TableHead>
                <TableHead
                  className="font-bold text-foreground/80 cursor-pointer select-none"
                  onClick={() => handleSort("status")}
                  aria-label="Sort by status"
                >
                  <span className="inline-flex items-center gap-1">
                    Status{" "}
                    {sortField === "status" ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </span>
                </TableHead>
                <TableHead
                  className="font-bold text-foreground/80 cursor-pointer select-none"
                  onClick={() => handleSort("recordedBy")}
                  aria-label="Sort by recorded by"
                >
                  <span className="inline-flex items-center gap-1">
                    Recorded By{" "}
                    {sortField === "recordedBy" ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </span>
                </TableHead>
                <TableHead
                  className="text-right font-bold text-foreground/80 cursor-pointer select-none"
                  onClick={() => handleSort("amount")}
                  aria-label="Sort by amount"
                >
                  <span className="inline-flex items-center gap-1 justify-end">
                    Amount{" "}
                    {sortField === "amount" ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </span>
                </TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.map((expense) => {
                const catColor =
                  CATEGORY_COLORS[expense.category || "Other Expenses"];
                return (
                  <TableRow key={expense.id} className="hover:bg-secondary/50">
                    <TableCell className="text-sm font-medium text-foreground">
                      {expense.date?.split("T")[0]}
                    </TableCell>
                    <TableCell className="font-bold text-foreground">
                      {expense.title || expense.name}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className="border-none text-[10px] uppercase font-bold"
                        style={{
                          backgroundColor: `${catColor}15`,
                          color: catColor,
                        }}
                      >
                        {expense.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {expense.category === "Agent Commission"
                        ? expense.agentName || "N/A"
                        : getExpenseDisplayUnitName(expense)}
                    </TableCell>
                    <TableCell className="text-[10px] font-bold text-muted-foreground">
                      {expense.category === "Agent Commission" ? (
                        <Badge
                          className={cn(
                            "border-none text-[9px] uppercase font-bold",
                            expense.commissionStatus === "released"
                              ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
                          )}
                        >
                          {expense.commissionStatus || "on hold"}
                        </Badge>
                      ) : (
                        expense.paymentMethod || "CASH"
                      )}
                    </TableCell>
                    <TableCell>
                      {getExpenseStatusBadge(expense.status)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {getRecordedByLabel(expense)}
                    </TableCell>
                    <TableCell className="text-right font-black text-destructive">
                      {formatCurrency(getExpenseTotalAmount(expense))}
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
                              setEditingExpense({ ...expense });
                              setIsModalOpen(true);
                            }}
                          >
                            <Edit2 className="h-3.5 w-3.5 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteExpense(expense)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredExpenses.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="h-32 text-center text-muted-foreground italic"
                  >
                    No expenses match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* POP-UP ADD EXPENSES MODAL */}
      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          if (formLoading) return; // Prevent close while saving
          setIsModalOpen(open);
          if (!open) {
            document.body.style.pointerEvents = "";
            window.setTimeout(() => {
              document.body.style.pointerEvents = "";
            }, 0);
          }
        }}
      >
        <DialogContent
          className="sm:max-w-[500px] p-0 flex flex-col max-h-[min(85vh,720px)] overflow-hidden text-left border border-border bg-card shadow-2xl rounded-2xl"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (formLoading) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (formLoading) event.preventDefault();
          }}
        >
          <DialogHeader className="shrink-0 bg-secondary/50 px-6 py-5 border-b border-border">
            <DialogTitle className="text-xl font-bold text-foreground">
              {editingExpense?.id ? "Edit Expense" : "Add New Expense"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSaveExpense}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0 custom-scrollbar">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">
                  Expense Title / Description
                </Label>
                <Input
                  value={editingExpense?.title || ""}
                  onChange={(e) =>
                    setEditingExpense({
                      ...editingExpense,
                      title: e.target.value,
                    })
                  }
                  required
                  className="rounded-xl h-11 bg-background border border-border"
                  placeholder="e.g. Meralco Bill, Cleaning Supplies..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">
                    Date
                  </Label>
                  <Input
                    type="date"
                    value={editingExpense?.date?.split("T")[0] || ""}
                    onChange={(e) =>
                      setEditingExpense({
                        ...editingExpense,
                        date: e.target.value,
                      })
                    }
                    required
                    className="rounded-xl h-11 bg-background border border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">
                    Amount (₱)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingExpense?.amount || ""}
                    onChange={(e) =>
                      setEditingExpense({
                        ...editingExpense,
                        amount: e.target.value,
                      })
                    }
                    required
                    className="rounded-xl h-11 bg-background border border-border"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">
                    Category
                  </Label>
                  <select
                    className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                    value={editingExpense?.category || "Utilities"}
                    onChange={(e) =>
                      setEditingExpense({
                        ...editingExpense,
                        category: e.target.value,
                      })
                    }
                  >
                    <option value="Utilities">Utilities</option>
                    <option value="Repairs">Repairs</option>
                    <option value="Supplies">Supplies</option>
                    <option value="Rent">Rent</option>
                    <option value="Agent Commission">Agent Commission</option>
                    <option value="Shared Expense">Shared Expense</option>
                    <option value="Staff Salaries / Wages">
                      Staff Salaries / Wages
                    </option>
                    <option value="Other Expenses">Other Expenses</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">
                    Mode of Payment
                  </Label>
                  <select
                    className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                    value={editingExpense?.paymentMethod || "CASH"}
                    onChange={(e) =>
                      setEditingExpense({
                        ...editingExpense,
                        paymentMethod: e.target.value,
                      })
                    }
                  >
                    <option value="CASH">Cash</option>
                    <option value="GCASH">GCash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">
                    Status
                  </Label>
                  <select
                    className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                    value={editingExpense?.status || "Paid"}
                    onChange={(e) =>
                      setEditingExpense({
                        ...editingExpense,
                        status: e.target.value,
                      })
                    }
                  >
                    <option value="Paid">Paid</option>
                    <option value="Pending">Pending</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">
                    Recorded By
                  </Label>
                  <Input
                    value={
                      editingExpense?.recordedByName ||
                      user?.displayName ||
                      user?.email ||
                      ""
                    }
                    onChange={(e) =>
                      setEditingExpense({
                        ...editingExpense,
                        recordedByName: e.target.value,
                      })
                    }
                    className="rounded-xl h-11 bg-background border border-border"
                    placeholder="Recorded by"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">
                  Affected Units
                </Label>
                <select
                  className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                  value={editingExpense?.unitSelectionMode || "single"}
                  onChange={(e) => {
                    const mode = e.target.value;
                    setEditingExpense((prev: any) => ({
                      ...prev,
                      unitSelectionMode: mode,
                      unitIds: mode === "multiple" ? prev?.unitIds || [] : [],
                      unitId: mode === "single" ? prev?.unitId || "" : "",
                      unitName:
                        mode === "single" && !prev?.unitId
                          ? "General/Unassigned"
                          : prev?.unitName,
                    }));
                  }}
                >
                  <option value="single">Single Unit</option>
                  <option value="multiple">Multiple Units</option>
                  <option value="all">All Units</option>
                </select>
              </div>

              {(editingExpense?.unitSelectionMode === "single" ||
                !editingExpense?.unitSelectionMode) && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">
                    Select Unit
                  </Label>
                  <select
                    className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                    value={editingExpense?.unitId || ""}
                    onChange={(e) =>
                      setEditingExpense((prev: any) => ({
                        ...prev,
                        unitId: e.target.value,
                        unitIds: [],
                        unitName: e.target.value
                          ? undefined
                          : "General/Unassigned",
                      }))
                    }
                  >
                    <option value="">General / Unassigned</option>
                    {units.map((u) => (
                      <option key={u.id} value={String(u.id)}>
                        {u.name || u.unitNumber}
                      </option>
                    ))}
                  </select>
                  {!editingExpense?.unitId && (
                    <div className="rounded-lg p-3 text-xs font-medium bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      This is a general expense. No unit is required.
                    </div>
                  )}
                </div>
              )}

              {editingExpense?.unitSelectionMode === "multiple" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">
                      Select Units{" "}
                      {editingExpense?.unitIds?.length > 0 && (
                        <span className="ml-1 text-amber-600">
                          ({editingExpense.unitIds.length} selected)
                        </span>
                      )}
                    </Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground"
                        onClick={selectAllUnits}
                        aria-label="Select all units"
                      >
                        Select All
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px] font-bold uppercase text-muted-foreground hover:text-destructive"
                        onClick={clearAllUnits}
                        aria-label="Clear all units"
                      >
                        Clear All
                      </Button>
                    </div>
                  </div>

                  {/* Unit selection with checkboxes — fixed height, scroll inside */}
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar border border-border rounded-xl p-2 bg-background">
                    {units.map((unit: any) => {
                      const unitId = String(unit.id);
                      return (
                        <UnitCheckboxRow
                          key={unitId}
                          unitId={unitId}
                          unitName={normalizeText(unit.name || unit.unitNumber)}
                          isSelected={selectedUnitIdSet.has(unitId)}
                          onToggle={toggleSelectedUnit}
                        />
                      );
                    })}
                  </div>

                  {/* Show selected units as compact tags */}
                  {editingExpense?.unitIds?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto custom-scrollbar pt-2">
                      {editingExpense.unitIds.map((unitId: string) => {
                        const unit = getUnitById(unitId);
                        const unitName =
                          unit?.name || unit?.unitNumber || "Unit";
                        return (
                          <div
                            key={unitId}
                            className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full text-xs font-medium border border-amber-200 dark:border-amber-800"
                          >
                            <span>{normalizeText(unitName)}</span>
                            <button
                              type="button"
                              onClick={() => toggleSelectedUnit(unitId, false)}
                              className="hover:text-amber-900 dark:hover:text-amber-100"
                              aria-label={`Remove ${normalizeText(unitName)}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Validation message for multiple units */}
                  {editingExpense?.unitIds?.length === 0 && (
                    <div className="rounded-lg p-3 text-xs font-semibold bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                      Select at least one unit to proceed.
                    </div>
                  )}
                </div>
              )}

              {editingExpense?.unitSelectionMode === "all" && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">
                    All Units Selected
                  </Label>
                  <div className="rounded-xl border border-dashed border-border bg-secondary/50 p-3 text-sm text-muted-foreground">
                    This expense will apply to all units.
                  </div>
                </div>
              )}

              {selectedUnitIds.length > 1 && (
                <div className="space-y-2 pt-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">
                    Distribution
                  </Label>
                  <select
                    className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                    value={editingExpense?.distributionMode || "equal"}
                    onChange={(e) =>
                      setEditingExpense({
                        ...editingExpense,
                        distributionMode: e.target.value,
                      })
                    }
                  >
                    <option value="equal">Equal Distribution</option>
                    <option value="custom">Custom Per Unit</option>
                    <option value="percentage">Percentage Distribution</option>
                  </select>
                </div>
              )}

              {selectedUnitIds.length > 1 &&
                editingExpense?.distributionMode && (
                  <div className="space-y-3 pt-2">
                    {selectedUnitIds.map((unitId: string) => {
                      const unit = getUnitById(unitId);
                      const name = normalizeText(
                        unit?.name || unit?.unitNumber || "Unit",
                      );
                      const valueKey = String(unitId);
                      const value =
                        editingExpense?.distributionValues?.[valueKey] ?? "";
                      return (
                        <div
                          key={unitId}
                          className="grid grid-cols-2 gap-4 items-end"
                        >
                          <div>
                            <Label className="text-xs uppercase font-bold text-muted-foreground">
                              {name}
                            </Label>
                            <div className="text-sm text-foreground/80 mt-1">
                              {editingExpense.distributionMode === "percentage"
                                ? "Percentage"
                                : "Amount (₱)"}
                            </div>
                          </div>
                          <Input
                            type="number"
                            min="0"
                            step={
                              editingExpense.distributionMode === "percentage"
                                ? "0.1"
                                : "0.01"
                            }
                            value={value}
                            onChange={(e) => {
                              const nextValues = {
                                ...(editingExpense.distributionValues || {}),
                              };
                              nextValues[valueKey] = e.target.value;
                              setEditingExpense({
                                ...editingExpense,
                                distributionValues: nextValues,
                              });
                            }}
                            className="rounded-xl h-11 bg-background border border-border"
                          />
                        </div>
                      );
                    })}
                    {/* Live distribution validation */}
                    {(() => {
                      const totalAmount = toNumber(editingExpense?.amount, 0);
                      const distValues =
                        editingExpense?.distributionValues || {};
                      const isPercentage =
                        editingExpense.distributionMode === "percentage";
                      const totalAssigned = selectedUnitIds.reduce(
                        (sum: number, id: string) => {
                          return sum + toNumber(distValues[id], 0);
                        },
                        0,
                      );
                      const remaining = isPercentage
                        ? 100 - totalAssigned
                        : totalAmount - totalAssigned;
                      const isValid = isPercentage
                        ? Math.abs(totalAssigned - 100) < 0.01
                        : Math.abs(totalAssigned - totalAmount) < 0.01;

                      if (selectedUnitIds.length > 1) {
                        return (
                          <div
                            className={`rounded-xl p-3 text-xs font-semibold ${isValid ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800" : "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"}`}
                          >
                            {isPercentage ? (
                              isValid ? (
                                <>
                                  Total:{" "}
                                  <span className="font-black">
                                    {totalAssigned.toFixed(1)}%
                                  </span>{" "}
                                  — Ready to save
                                </>
                              ) : (
                                <>
                                  Total:{" "}
                                  <span className="font-black">
                                    {totalAssigned.toFixed(1)}%
                                  </span>{" "}
                                  — Remaining:{" "}
                                  <span className="font-black">
                                    {remaining.toFixed(1)}%
                                  </span>
                                </>
                              )
                            ) : isValid ? (
                              <>
                                Assigned:{" "}
                                <span className="font-black">
                                  {formatCurrency(totalAssigned)}
                                </span>{" "}
                                — Ready to save
                              </>
                            ) : (
                              <>
                                Assigned:{" "}
                                <span className="font-black">
                                  {formatCurrency(totalAssigned)}
                                </span>{" "}
                                — Remaining:{" "}
                                <span className="font-black">
                                  {formatCurrency(Math.abs(remaining))}
                                </span>
                              </>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

              {editingExpense?.category === "Agent Commission" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">
                      Agent
                    </Label>
                    <select
                      className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                      value={editingExpense?.agentId || ""}
                      onChange={(e) => {
                        const agent = agents.find(
                          (a) => String(a.id) === e.target.value,
                        );
                        setEditingExpense({
                          ...editingExpense,
                          agentId: e.target.value,
                          agentName: agent?.name || "",
                        });
                      }}
                      required
                    >
                      <option value="">Select Agent</option>
                      {agents.map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">
                      Commission Status
                    </Label>
                    <select
                      className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                      value={editingExpense?.commissionStatus || "on hold"}
                      onChange={(e) =>
                        setEditingExpense({
                          ...editingExpense,
                          commissionStatus: e.target.value,
                        })
                      }
                    >
                      <option value="on hold">On Hold</option>
                      <option value="released">Released</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">
                  Additional Notes
                </Label>
                <Textarea
                  value={editingExpense?.notes || ""}
                  onChange={(e) =>
                    setEditingExpense({
                      ...editingExpense,
                      notes: e.target.value,
                    })
                  }
                  className="rounded-xl bg-background border border-border min-h-[80px]"
                  placeholder="Optional details, receipt numbers..."
                />
              </div>
            </div>

            <div className="shrink-0 px-6 pb-6 pt-3 border-t border-border bg-card">
              <Button
                type="submit"
                disabled={formLoading}
                className="w-full h-12 gradient-btn text-white font-bold rounded-xl shadow-lg"
              >
                {formLoading ? (
                  <Loader2 className="animate-spin" />
                ) : editingExpense?.id ? (
                  <Edit2 className="mr-2 h-5 w-5" />
                ) : (
                  <Plus className="mr-2 h-5 w-5" />
                )}
                {editingExpense?.id ? "Save Changes" : "Record Expense"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
