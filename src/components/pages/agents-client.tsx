"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useUser, useAuth } from "@/firebase";
import { apiClient } from "@/lib/api-client";
import { useAppResources } from "@/lib/app-data-store";
import { useDateStore } from "@/lib/date-store";
import { formatCurrency, todayLocalDateInput } from "@/lib/utils-app";
import { cn } from "@/lib/utils";
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
import {
  Handshake,
  Loader2,
  Plus,
  Mail,
  Percent,
  Edit2,
  Trash2,
  Save,
  Phone,
  Calendar,
  Info,
  DollarSign,
  Check,
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
import { useUserRole } from "@/hooks/use-user-role";
import { canManageOperations } from "@/auth/roles";
import { useDialogCleanup } from "@/hooks/use-dialog-cleanup";

export default function AgentsClient() {
  const { role } = useUserRole();
  const { user } = useUser();
  const auth = useAuth();
  const { toast } = useToast();
  const { month, year } = useDateStore();

  const agentsResources = useAppResources(["agents", "expenses"]);
  const agents = agentsResources.data["agents"] ?? [];
  const expenses = agentsResources.data["expenses"] ?? [];
  const loading = agentsResources.loading;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [formLoading, setFormLoading] = useState(false);

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  // Commission data grouped by agentId
  const commissionsByAgent = useMemo(() => {
    const map: Record<string, any[]> = {};
    expenses
      .filter((e) => e.category === "Agent Commission")
      .forEach((e) => {
        const aid = String(e.agentId || "");
        if (!map[aid]) map[aid] = [];
        map[aid].push(e);
      });
    return map;
  }, [expenses]);

  // Monthly commission data for the currently editing agent
  const editingAgentCommissions = useMemo(() => {
    if (!editingAgent?.id) return [];
    return (commissionsByAgent[String(editingAgent.id)] || [])
      .filter((c) => c.date?.startsWith(monthKey))
      .sort(
        (a, b) =>
          new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
      );
  }, [editingAgent?.id, commissionsByAgent, monthKey]);

  const getAgentCommissionSummary = (agentId: string) => {
    const commissions = commissionsByAgent[agentId] || [];
    const monthlyCommissions = commissions.filter((c) =>
      c.date?.startsWith(monthKey),
    );
    const onHold = monthlyCommissions
      .filter((c) => c.commissionStatus !== "released")
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const released = monthlyCommissions
      .filter((c) => c.commissionStatus === "released")
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);
    return {
      onHold,
      released,
      total: onHold + released,
      count: monthlyCommissions.length,
    };
  };

  useDialogCleanup(isDialogOpen);

  const handleSave = async (e: React.FormEvent) => {
    if (!canManageOperations(role)) return;
    e.preventDefault();
    setFormLoading(true);
    try {
      const payload = { ...editingAgent, uid: user?.uid };
      if (editingAgent?.id) {
        await apiClient.put(`/agent/${editingAgent.id}`, payload, auth);
        toast({ title: "Updated", description: "Agent details saved." });
      } else {
        await apiClient.post("/agent", payload, auth);
        toast({ title: "Created", description: "New agent added." });
      }
      setIsDialogOpen(false);
      await agentsResources.refresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save agent.",
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManageOperations(role)) return;
    if (!confirm("Remove this agent?")) return;
    try {
      await apiClient.delete(`/agent/${id}`, auth);
      toast({ title: "Deleted", description: "Agent partnership removed." });
      await agentsResources.refresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete agent.",
      });
    }
  };

  const handleReleaseCommission = async (commission: any) => {
    if (!canManageOperations(role)) return;
    if (
      !confirm(
        `Release commission of ${formatCurrency(commission.amount)} to ${commission.agentName}?`,
      )
    )
      return;
    try {
      await apiClient.put(
        `/expense/${commission.id}`,
        {
          ...commission,
          commissionStatus: "released",
          updatedAt: new Date().toISOString(),
        },
        auth,
      );
      toast({
        title: "Released",
        description: "Commission has been marked as released.",
      });
      await agentsResources.refresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const openNewAgentDialog = () => {
    setEditingAgent({
      name: "",
      email: "",
      phone: "",
      commissionType: "fixed_commission",
      commissionRate: 0,
      joinDate: todayLocalDateInput(),
    });
    setIsDialogOpen(true);
  };

  const openEditAgentDialog = (agent: any) => {
    setEditingAgent({
      ...agent,
      commissionType: "fixed_commission",
      commissionRate: 0,
    });
    setIsDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        <p className="text-sm text-muted-foreground">Syncing Agents...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div className="text-left">
          <h1 className="text-3xl font-bold text-foreground">Booking Agents</h1>
          <p className="text-muted-foreground">
            Manage affiliate and agency referral partnerships
          </p>
        </div>
        <Button
          className="gradient-btn text-white gap-2 shadow-sm"
          disabled={!canManageOperations(role)}
          onClick={openNewAgentDialog}
        >
          {canManageOperations(role) && (
            <>
              <Plus className="h-4 w-4" /> Add Agent
            </>
          )}
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map((agent) => (
          <Card
            key={agent.id}
            className="shadow-card border border-border bg-card overflow-hidden group hover:ring-2 hover:ring-amber-500/20 transition-all"
          >
            <CardHeader className="bg-secondary/50 border-b border-border p-4">
              <div className="flex justify-between items-center">
                <div className="text-left">
                  <CardTitle className="text-lg font-bold text-foreground">
                    {agent.name || "Unnamed"}
                  </CardTitle>
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mt-1">
                    Joined: {agent.joinDate || "N/A"}
                  </p>
                </div>
                <div className="p-2 bg-green-100 dark:bg-green-950/50 rounded-lg">
                  <Handshake className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                  <Handshake className="h-4 w-4 text-amber-500" /> Commission
                  Model
                </div>
                <Badge
                  variant="outline"
                  className="bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 font-bold"
                >
                  Fixed / Surplus
                </Badge>
              </div>
              {(() => {
                const summary = getAgentCommissionSummary(String(agent.id));
                return summary.count > 0 ? (
                  <div className="flex items-center gap-3 text-sm border-b border-border pb-4">
                    <div className="flex-1">
                      <p className="text-[10px] text-muted-foreground font-bold uppercase">
                        On Hold
                      </p>
                      <p className="font-black text-amber-600">
                        {formatCurrency(summary.onHold)}
                      </p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-muted-foreground font-bold uppercase">
                        Released
                      </p>
                      <p className="font-black text-green-600 dark:text-green-400">
                        {formatCurrency(summary.released)}
                      </p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-muted-foreground font-bold uppercase">
                        Total
                      </p>
                      <p className="font-black text-foreground">
                        {formatCurrency(summary.total)}
                      </p>
                    </div>
                  </div>
                ) : null;
              })()}
              <div className="space-y-2 text-left">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4 text-amber-500" />{" "}
                  {agent.email || "No email"}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4 text-amber-500" />{" "}
                  {agent.phone || "No contact"}
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-secondary/30 p-2 border-t border-border flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 gap-2 text-xs"
                onClick={() => openEditAgentDialog(agent)}
              >
                <Edit2 className="h-3 w-3" /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 gap-2 text-xs text-destructive hover:text-destructive"
                onClick={() => handleDelete(agent.id)}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            </CardFooter>
          </Card>
        ))}
        {agents.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-xl bg-card">
            <p className="text-muted-foreground">No agents found.</p>
          </div>
        )}
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            document.body.style.pointerEvents = "";
            window.setTimeout(() => {
              document.body.style.pointerEvents = "";
            }, 0);
          }
        }}
      >
        <DialogContent
          className="sm:max-w-[480px] p-0 overflow-hidden border border-border bg-card shadow-2xl rounded-2xl"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader className="bg-secondary/50 px-6 py-6 border-b border-border">
            <DialogTitle className="text-xl font-bold text-foreground">
              {editingAgent?.id ? "Edit Agent Profile" : "Add New Agent"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSave}
            className="p-6 space-y-5 max-h-[80vh] overflow-y-auto text-left"
          >
            <div className="space-y-2">
              <Label
                htmlFor="agentName"
                className="text-xs font-bold uppercase text-muted-foreground"
              >
                Full Name
              </Label>
              <Input
                id="agentName"
                value={editingAgent?.name || ""}
                onChange={(e) =>
                  setEditingAgent({ ...editingAgent, name: e.target.value })
                }
                required
                className="h-11 bg-background border border-border"
                placeholder="Agent Full Name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="agentEmail"
                  className="text-xs font-bold uppercase text-muted-foreground"
                >
                  Email Address
                </Label>
                <Input
                  id="agentEmail"
                  type="email"
                  value={editingAgent?.email || ""}
                  onChange={(e) =>
                    setEditingAgent({ ...editingAgent, email: e.target.value })
                  }
                  required
                  className="h-11 bg-background border border-border"
                  placeholder="agent@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="agentPhone"
                  className="text-xs font-bold uppercase text-muted-foreground"
                >
                  Phone Number
                </Label>
                <Input
                  id="agentPhone"
                  value={editingAgent?.phone || ""}
                  onChange={(e) =>
                    setEditingAgent({ ...editingAgent, phone: e.target.value })
                  }
                  required
                  className="h-11 bg-background border border-border"
                  placeholder="+63 9xx..."
                />
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-200 flex gap-3">
              <Info className="h-5 w-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <strong className="block mb-1">
                  Fixed / Surplus Commission Model
                </strong>
                Commission is calculated automatically as the surplus amount
                (total payment from guest minus the unit base rate for the
                nights stayed).
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="agentJoinDate"
                className="text-xs font-bold uppercase text-muted-foreground"
              >
                Join Date
              </Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="agentJoinDate"
                  type="date"
                  className="h-11 pl-10 bg-background border border-border"
                  value={editingAgent?.joinDate || ""}
                  onChange={(e) =>
                    setEditingAgent({
                      ...editingAgent,
                      joinDate: e.target.value,
                    })
                  }
                  required
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
                {editingAgent?.id ? "Save Changes" : "Add Agent"}
              </Button>
            </DialogFooter>
          </form>

          {/* Commissions Section - only visible when editing existing agent */}
          {editingAgent?.id && (
            <div className="border-t border-border px-6 py-4 space-y-3 max-h-[300px] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase text-muted-foreground tracking-widest">
                  Commissions ({monthKey})
                </h4>
                <Badge variant="outline" className="text-[10px]">
                  {editingAgentCommissions.length} entries
                </Badge>
              </div>
              {editingAgentCommissions.length > 0 ? (
                <div className="space-y-2">
                  {editingAgentCommissions.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground truncate text-xs">
                          {c.title || "Commission"}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {c.date?.split("T")[0]}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-black text-foreground">
                          {formatCurrency(c.amount)}
                        </span>
                        {c.commissionStatus === "released" ? (
                          <Badge className="bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 border-none text-[9px] uppercase">
                            Released
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] font-bold text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                            onClick={() => handleReleaseCommission(c)}
                          >
                            <Check className="h-3 w-3 mr-1" /> Release
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4 italic">
                  No commissions for this month.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
