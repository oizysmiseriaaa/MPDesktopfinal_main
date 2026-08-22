"use client";

import React, { useEffect, useState } from "react";
import { useUser, useAuth } from "@/firebase";
import { apiClient } from "@/lib/api-client";
import { useAppResources } from "@/lib/app-data-store";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Search,
  Users,
  Loader2,
  Mail,
  Edit2,
  Trash2,
  Save,
  Building2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/use-user-role";
import { canManageOperations } from "@/auth/roles";
import { formatCurrency, todayLocalDateInput } from "@/lib/utils-app";

export default function InvestorsClient() {
  const { role } = useUserRole();
  const { user } = useUser();
  const auth = useAuth();
  const { toast } = useToast();

  const investorsResources = useAppResources(["investors", "units"]);
  const investors = investorsResources.data["investors"] ?? [];
  const units = investorsResources.data["units"] ?? [];
  const loading = investorsResources.loading;
  const [search, setSearch] = useState("");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState<any>(null);
  const [formLoading, setFormLoading] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    if (!canManageOperations(role)) return;
    e.preventDefault();
    setFormLoading(true);
    try {
      const payload = {
        ...editingInvestor,
        uid: user?.uid,
        investmentAmount: parseFloat(editingInvestor.investmentAmount || 0),
        sharePercentage: parseFloat(editingInvestor.sharePercentage || 0),
        unitIds: editingInvestor.unitIds || [],
      };

      if (editingInvestor?.id) {
        await apiClient.put(`/investor/${editingInvestor.id}`, payload, auth);
        toast({ title: "Updated", description: "Investor details saved." });
      } else {
        await apiClient.post("/investor", payload, auth);
        toast({ title: "Created", description: "New investor added." });
      }
      setIsDialogOpen(false);
      await investorsResources.refresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save investor.",
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManageOperations(role)) return;
    if (!confirm("Are you sure?")) return;
    try {
      await apiClient.delete(`/investor/${id}`, auth);
      toast({ title: "Deleted", description: "Investor removed." });
      await investorsResources.refresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete investor.",
      });
    }
  };

  const handleUnitSelection = (unitId: string) => {
    const current = editingInvestor.unitIds || [];
    if (current.includes(unitId)) {
      setEditingInvestor({
        ...editingInvestor,
        unitIds: current.filter((id: string) => id !== unitId),
      });
    } else {
      setEditingInvestor({ ...editingInvestor, unitIds: [...current, unitId] });
    }
  };

  const filtered = investors.filter(
    (i) =>
      (i.investorName || i.name || "")
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      (i.investorEmail || i.email || "")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <Loader2 className="animate-spin text-amber-500" />
        <p className="text-sm text-muted-foreground italic">
          Syncing Investors...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 text-left">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Investors</h1>
          <p className="text-muted-foreground">Manage profit-sharing</p>
        </div>
        {canManageOperations(role) && (
          <Button
            className="gradient-btn text-white gap-2 shadow-sm"
            onClick={() => {
              setEditingInvestor({
                name: "",
                email: "",
                phone: "",
                investmentAmount: 0,
                sharePercentage: 0,
                joinDate: todayLocalDateInput(),
                unitIds: [],
              });
              setIsDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Investor
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search..."
          className="pl-9 h-11 bg-card border border-border"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((investor) => (
          <Card
            key={investor.id}
            className="shadow-card border border-border bg-card overflow-hidden group"
          >
            <CardHeader className="bg-secondary/50 border-b border-border p-4">
              <div className="flex justify-between items-center text-left">
                <div>
                  <CardTitle className="text-lg font-bold text-foreground">
                    {investor.name || "Unnamed"}
                  </CardTitle>
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mt-1">
                    Joined: {investor.joinDate}
                  </p>
                </div>
                <div className="p-2 bg-purple-100 dark:bg-purple-950/50 rounded-lg">
                  <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 border-b border-border pb-4">
                <div className="space-y-1 text-left">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">
                    Investment
                  </p>
                  <p className="font-bold text-amber-600">
                    {formatCurrency(investor.investmentAmount)}
                  </p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">
                    Share
                  </p>
                  <p className="font-bold text-foreground">
                    {investor.sharePercentage || 0}%
                  </p>
                </div>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground text-left">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-amber-500" /> {investor.email}
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-amber-500" />{" "}
                  {investor.unitIds?.length || 0} Units
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-secondary/30 p-2 border-t border-border flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setEditingInvestor(investor);
                  setIsDialogOpen(true);
                }}
              >
                <Edit2 className="h-3 w-3 mr-2" /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-destructive"
                onClick={() => handleDelete(investor.id)}
              >
                <Trash2 className="h-3 w-3 mr-2" /> Delete
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden text-left border border-border bg-card shadow-2xl rounded-2xl">
          <DialogHeader className="bg-secondary/50 px-6 py-6 border-b border-border">
            <DialogTitle className="text-xl font-bold text-foreground">
              {editingInvestor?.id ? "Edit Profile" : "New Investor"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSave}
            className="p-6 space-y-5 max-h-[80vh] overflow-y-auto"
          >
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-muted-foreground">
                Full Name
              </Label>
              <Input
                value={editingInvestor?.name || ""}
                onChange={(e) =>
                  setEditingInvestor({
                    ...editingInvestor,
                    name: e.target.value,
                  })
                }
                required
                className="h-11 bg-background border border-border"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">
                  Email
                </Label>
                <Input
                  type="email"
                  value={editingInvestor?.email || ""}
                  onChange={(e) =>
                    setEditingInvestor({
                      ...editingInvestor,
                      email: e.target.value,
                    })
                  }
                  required
                  className="h-11 bg-background border border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">
                  Phone
                </Label>
                <Input
                  value={editingInvestor?.phone || ""}
                  onChange={(e) =>
                    setEditingInvestor({
                      ...editingInvestor,
                      phone: e.target.value,
                    })
                  }
                  required
                  className="h-11 bg-background border border-border"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-muted-foreground">
                Assigned Units ({editingInvestor?.unitIds?.length || 0})
              </Label>
              <ScrollArea className="h-[120px] border border-border p-4 bg-secondary/30 rounded-xl">
                <div className="grid grid-cols-1 gap-2">
                  {units.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center space-x-3 p-2 bg-card rounded border border-border shadow-sm"
                    >
                      <Checkbox
                        id={`unit-inv-${u.id}`}
                        checked={editingInvestor?.unitIds?.includes(u.id)}
                        onCheckedChange={() => handleUnitSelection(u.id)}
                      />
                      <label
                        htmlFor={`unit-inv-${u.id}`}
                        className="text-sm font-medium text-foreground"
                      >
                        {u.unitNumber || u.name}
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">
                  Initial Investment (₱)
                </Label>
                <Input
                  type="number"
                  value={editingInvestor?.investmentAmount || 0}
                  onChange={(e) =>
                    setEditingInvestor({
                      ...editingInvestor,
                      investmentAmount: e.target.value,
                    })
                  }
                  required
                  className="h-11 bg-background border border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">
                  Share %
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  value={editingInvestor?.sharePercentage || 0}
                  onChange={(e) =>
                    setEditingInvestor({
                      ...editingInvestor,
                      sharePercentage: e.target.value,
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
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save className="mr-2 h-5 w-5" />
                )}{" "}
                Save Investor
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
