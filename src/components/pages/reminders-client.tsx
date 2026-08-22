"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useUser, useAuth } from "@/firebase";
import { apiClient } from "@/lib/api-client";
import { useAppResources } from "@/lib/app-data-store";
import { todayLocalDateInput } from "@/lib/utils-app";
import {
  shouldCreateHousekeeping,
  buildHousekeepingTask,
  isHousekeepingEligibleBooking,
  isCheckoutAtOrAfter,
} from "@/lib/housekeeping";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Bell,
  Plus,
  Trash2,
  Edit2,
  Save,
  Loader2,
  Calendar,
  CheckCircle2,
  Circle,
  Search,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/use-user-role";
import { canManageOperations } from "@/auth/roles";

export default function RemindersClient() {
  const { user } = useUser();
  const { role } = useUserRole();
  const auth = useAuth();
  const { toast } = useToast();

  const remindersResources = useAppResources(["reminders"]);
  const reminders = remindersResources.data["reminders"] ?? [];
  const loading = remindersResources.loading;
  const bookingsResources = useAppResources(["bookings"]);
  const bookings = bookingsResources.data["bookings"] ?? [];
  const housekeeping = reminders.filter(
    (reminder: any) =>
      String(reminder?.reminderType || reminder?.type || "")
        .trim()
        .toLowerCase() === "housekeeping",
  );
  const housekeepingCreatedRef = React.useRef(new Set<string>());
  // Captured once when the Reminders page mounts. Automatic housekeeping only
  // sweeps checkouts at/after this moment so historical checkouts are never
  // re-recorded on load, while a checkout during the active session still
  // creates a task. Using a ref keeps the boundary fixed even when the effect
  // below re-runs (its dependency list changes with bookings/reminders).
  const housekeepingSessionStartRef = React.useRef<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState("");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<any>(null);
  const [formLoading, setFormLoading] = useState(false);

  /**
   * Auto-create housekeeping reminders for checked-out bookings.
   * This runs once when bookings load and prevents duplicates via a Set.
   */
  useEffect(() => {
    if (!user || !auth || !bookings.length || !canManageOperations(role))
      return;

    let cancelled = false;

    const autoCreateHousekeepingReminders = async () => {
      for (const booking of bookings) {
        if (cancelled) return;
        const bookingId = String(booking?.id || "");
        if (!bookingId) continue;

        // Housekeeping eligibility is date-derived (built by housekeeping helpers
        // from `getOperationsStatus`): the booking must be genuinely past its
        // checkout time. Do NOT trust a stored booking.status string here — an
        // imported/stale "checked out" status would let a future-dated booking
        // bypass the date math and get a reminder created early.
        if (!isHousekeepingEligibleBooking(booking)) continue;

        // From-now-onward boundary: skip historical checkouts that finished
        // before this session started so the sweep never re-records old
        // bookings on load. A checkout during the active session still creates.
        if (!isCheckoutAtOrAfter(housekeepingSessionStartRef.current, booking))
          continue;

        // Check if a housekeeping reminder already exists for this booking
        const existsForBooking = reminders.some(
          (r: any) =>
            String(r?.bookingId || "") === bookingId &&
            (String(r?.title || "")
              .toLowerCase()
              .includes("housekeeping") ||
              String(r?.type || "").toLowerCase() === "housekeeping"),
        );
        if (existsForBooking) continue;

        const task = buildHousekeepingTask({
          reminder: null,
          booking,
          userId: user.uid,
        });

        // Check if we already tried to create this deterministic reminder in
        // the current session. The backend create-only write protects refreshes
        // and navigation sessions as well.
        if (housekeepingCreatedRef.current.has(task.id)) continue;

        // Create the single housekeeping reminder.
        try {
          housekeepingCreatedRef.current.add(task.id);
          const payload = {
            ...task,
            type: "housekeeping",
            reminderType: "housekeeping",
            dueDate: task.checkoutDateLocal,
            completed: false,
          };

          await apiClient.post("/reminder", payload, auth);
          if (cancelled) return;
        } catch (error: any) {
          // Non-fatal; log but don't break the flow
          if (!cancelled) {
            console.error(
              `Failed to auto-create housekeeping reminder for booking ${bookingId}:`,
              error,
            );
          }
          housekeepingCreatedRef.current.delete(task.id);
        }
      }
    };

    autoCreateHousekeepingReminders();
    return () => {
      cancelled = true;
    };
  }, [user, auth, bookings, reminders, role]);

  const handleSave = async (e: React.FormEvent) => {
    if (!canManageOperations(role)) return;
    e.preventDefault();
    setFormLoading(true);
    try {
      const payload = {
        ...editingReminder,
        uid: user?.uid,
        completed: editingReminder.completed || false,
        createdAt: editingReminder.createdAt || new Date().toISOString(),
      };

      if (editingReminder?.id) {
        await apiClient.put(`/reminder/${editingReminder.id}`, payload, auth);
        toast({ title: "Updated", description: "Reminder saved." });
      } else {
        await apiClient.post("/reminder", payload, auth);
        toast({ title: "Created", description: "Reminder added." });
      }
      setIsDialogOpen(false);
      await remindersResources.refresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save reminder.",
      });
    } finally {
      setFormLoading(false);
    }
  };

  const ensureHousekeepingTask = async (reminder: any) => {
    try {
      const booking = bookings.find(
        (b: any) => String(b?.id || "") === String(reminder?.bookingId || ""),
      );
      const now = new Date();
      const eligible = shouldCreateHousekeeping({
        reminder,
        booking,
        now,
        nowCompleted: true,
      });
      if (!eligible) return;

      const payload = buildHousekeepingTask({
        reminder,
        booking,
        now,
        userId: user?.uid,
      });
      const reminderPayload = {
        ...payload,
        type: "housekeeping",
        reminderType: "housekeeping",
        dueDate: payload.checkoutDateLocal,
        completed: false,
      };
      const alreadyExists =
        housekeeping.some(
          (h: any) => String(h?.id || "") === reminderPayload.id,
        ) || housekeepingCreatedRef.current.has(payload.id);
      if (alreadyExists) return;
      housekeepingCreatedRef.current.add(reminderPayload.id);

      await apiClient.post("/reminder", reminderPayload, auth);
      await remindersResources.refresh(["reminders"]);
      toast({
        title: "Housekeeping reminder created",
        description: `${payload.unitName} is ready for cleaning.`,
      });
    } catch (error: any) {
      // The reminder update already succeeded — keep the failure non-fatal.
      console.error("Failed to create housekeeping task:", error);
    }
  };

  const toggleCompletion = async (reminder: any) => {
    if (!canManageOperations(role)) return;
    const completing = !reminder.completed;
    try {
      const updated = { ...reminder, completed: completing, uid: user?.uid };
      await apiClient.put(`/reminder/${reminder.id}`, updated, auth);

      if (completing) {
        await ensureHousekeepingTask(reminder);
      }

      await remindersResources.refresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message,
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManageOperations(role)) return;
    if (!confirm("Remove this reminder?")) return;
    try {
      await apiClient.delete(`/reminder/${id}`, auth);
      toast({ title: "Deleted", description: "Reminder removed." });
      await remindersResources.refresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete reminder.",
      });
    }
  };

  const filteredReminders = useMemo(() => {
    return reminders
      .filter(
        (r) =>
          (r.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (r.description || "")
            .toLowerCase()
            .includes(searchQuery.toLowerCase()),
      )
      .sort((a, b) => {
        if (a.completed === b.completed) {
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }
        return a.completed ? 1 : -1;
      });
  }, [reminders, searchQuery]);

  const openNewDialog = () => {
    setEditingReminder({
      title: "",
      description: "",
      priority: "medium",
      dueDate: todayLocalDateInput(),
      completed: false,
    });
    setIsDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <Loader2 className="animate-spin text-amber-500 h-8 w-8" />
        <p className="text-sm text-muted-foreground italic">Syncing tasks...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 text-left">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-950/50 rounded-lg text-amber-600 dark:text-amber-400">
            <Bell className="h-6 w-6" />
          </div>
          <div className="text-left">
            <h1 className="text-3xl font-bold text-foreground">
              Operational Reminders
            </h1>
            <p className="text-muted-foreground">
              Keep track of tasks and schedules
            </p>
          </div>
        </div>
        <Button
          className="gradient-btn text-white gap-2 shadow-sm"
          disabled={!canManageOperations(role)}
          onClick={openNewDialog}
        >
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search reminders..."
          className="pl-9 h-11 bg-card border border-border"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredReminders.map((reminder) => (
          <Card
            key={reminder.id}
            className={cn(
              "shadow-card border border-border transition-all overflow-hidden group text-left",
              reminder.completed
                ? "bg-secondary/50 opacity-75"
                : "bg-card hover:ring-2 hover:ring-amber-500/20",
            )}
          >
            <CardHeader className="p-4 pb-0 flex flex-row items-start justify-between space-y-0">
              <div className="flex items-start gap-3">
                <button
                  disabled={!canManageOperations(role)}
                  onClick={() => toggleCompletion(reminder)}
                  className={cn(
                    "mt-1 transition-colors",
                    reminder.completed
                      ? "text-green-500 dark:text-green-400"
                      : "text-muted-foreground/30 hover:text-amber-500",
                  )}
                >
                  {reminder.completed ? (
                    <CheckCircle2 className="h-6 w-6" />
                  ) : (
                    <Circle className="h-6 w-6" />
                  )}
                </button>
                <div>
                  <CardTitle
                    className={cn(
                      "text-lg font-bold leading-tight text-foreground",
                      reminder.completed &&
                        "line-through text-muted-foreground",
                    )}
                  >
                    {reminder.title}
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] uppercase font-black tracking-widest h-4 px-1",
                        reminder.priority === "high"
                          ? "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-300 border-red-100 dark:border-red-800"
                          : reminder.priority === "medium"
                            ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-300 border-amber-100 dark:border-amber-800"
                            : "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-300 border-blue-100 dark:border-blue-800",
                      )}
                    >
                      {reminder.priority}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-bold flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {reminder.dueDate}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-4">
              <p
                className={cn(
                  "text-sm text-muted-foreground line-clamp-2",
                  reminder.completed && "text-muted-foreground/60",
                )}
              >
                {reminder.description || "No description provided."}
              </p>
            </CardContent>
            <CardFooter className="bg-secondary/30 p-2 border-t border-border flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-8 gap-2 text-xs"
                disabled={!canManageOperations(role)}
                onClick={() => {
                  setEditingReminder(reminder);
                  setIsDialogOpen(true);
                }}
              >
                <Edit2 className="h-3 w-3" /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-8 gap-2 text-xs text-destructive hover:text-destructive"
                disabled={!canManageOperations(role)}
                onClick={() => handleDelete(reminder.id)}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden text-left border border-border bg-card shadow-2xl rounded-2xl">
          <DialogHeader className="bg-secondary/50 px-6 py-6 border-b border-border">
            <DialogTitle className="text-xl font-bold text-foreground">
              {editingReminder?.id ? "Edit Reminder" : "Add New Reminder"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="p-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Task Title
              </Label>
              <Input
                value={editingReminder?.title || ""}
                onChange={(e) =>
                  setEditingReminder({
                    ...editingReminder,
                    title: e.target.value,
                  })
                }
                required
                className="h-11 bg-background border border-border"
                placeholder="What needs to be done?"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Description
              </Label>
              <Textarea
                value={editingReminder?.description || ""}
                onChange={(e) =>
                  setEditingReminder({
                    ...editingReminder,
                    description: e.target.value,
                  })
                }
                className="min-h-[100px] bg-background border border-border"
                placeholder="Add more details about this task..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">
                  Priority
                </Label>
                <Select
                  value={editingReminder?.priority || "medium"}
                  onValueChange={(v) =>
                    setEditingReminder({ ...editingReminder, priority: v })
                  }
                >
                  <SelectTrigger className="h-11 bg-background border border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">
                  Due Date
                </Label>
                <Input
                  type="date"
                  value={editingReminder?.dueDate || ""}
                  onChange={(e) =>
                    setEditingReminder({
                      ...editingReminder,
                      dueDate: e.target.value,
                    })
                  }
                  required
                  className="h-11 bg-background border border-border"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="submit"
                disabled={formLoading}
                className="w-full h-12 gradient-btn text-white font-bold rounded-xl shadow-lg"
              >
                {formLoading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Save className="mr-2 h-5 w-5" />
                )}
                {editingReminder?.id ? "Save Changes" : "Create Reminder"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
