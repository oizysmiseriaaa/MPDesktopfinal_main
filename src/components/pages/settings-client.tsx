'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/section-header';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ReceiptText, Settings2, UserCog, Save, ShieldCheck, Eye, EyeOff } from 'lucide-react';

export default function SettingsClient() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const settingsRef = useMemo(
    () => (user ? doc(firestore, 'users', user.uid, 'settings', 'config') : null),
    [user, firestore]
  );
  const userRef = useMemo(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [user, firestore]
  );

  const { data: settings, isLoading: settingsLoading } = useDoc(settingsRef);
  const { data: profile, isLoading: profileLoading } = useDoc(userRef);

  const [profileForm, setProfileForm] = useState({
    displayName: '',
    email: '',
    phone: '',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    systemTitle: '',
    companyName: '',
    wifiName: '',
    wifiPassword: '',
    checkIn: '14:00',
    checkOut: '12:00',
    contactName: '',
    contactPhone: '',
    paymentOptions: '',
    specialDetails: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        displayName: profile.displayName || user?.displayName || '',
        email: profile.email || user?.email || 'mariasantos@gmail.com',
        phone: profile.phone || user?.phoneNumber || '',
      });
    }
  }, [profile, user?.displayName, user?.phoneNumber, user?.email]);

  useEffect(() => {
    if (settings) {
      setSettingsForm({
        systemTitle: settings.systemTitle || '',
        companyName: settings.companyName || '',
        wifiName: settings.wifiName || '',
        wifiPassword: settings.wifiPassword || '',
        checkIn: settings.checkIn || '14:00',
        checkOut: settings.checkOut || '12:00',
        contactName: settings.contactName || '',
        contactPhone: settings.contactPhone || '',
        paymentOptions: settings.paymentOptions || '',
        specialDetails: settings.specialDetails || '',
      });
    }
  }, [settings]);

  const handleSaveProfile = async () => {
    if (!userRef) return;
    setSavingProfile(true);
    try {
      await setDoc(
        userRef,
        {
          displayName: profileForm.displayName,
          phone: profileForm.phone,
          email: profileForm.email || 'mariasantos@gmail.com',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      toast({ title: 'Profile Saved', description: 'Your account profile was updated.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save profile.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user || !user.email) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be signed in to change your password.' });
      return;
    }

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast({ variant: 'destructive', title: 'Validation', description: 'Please complete all password fields.' });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ variant: 'destructive', title: 'Validation', description: 'New password and confirmation do not match.' });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Validation', description: 'New password must be at least 6 characters long.' });
      return;
    }

    try {
      setSavingPassword(true);
      const credential = EmailAuthProvider.credential(user.email, passwordForm.currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passwordForm.newPassword);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast({ title: 'Password Updated', description: 'Your password was changed successfully.' });
    } catch (e: any) {
      const message = e?.code === 'auth/wrong-password'
        ? 'Current password is incorrect.'
        : e?.message || 'Failed to change password.';
      toast({ variant: 'destructive', title: 'Error', description: message });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settingsRef) return;
    setSavingSettings(true);
    try {
      await setDoc(settingsRef, { ...settingsForm, id: 'config' }, { merge: true });
      toast({ title: 'Settings Saved', description: 'System configuration updated successfully.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save settings.' });
    } finally {
      setSavingSettings(false);
    }
  };

  if (settingsLoading || profileLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Workspace"
        title="Account Settings"
        description="Manage your personal profile and the system configuration used across the workspace."
        action={
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Auto-saved to backend
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="surface rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <span className="rounded-lg bg-amber-500/15 p-2 text-amber-600">
                <UserCog className="h-4 w-4" />
              </span>
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={profileForm.displayName}
                onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
                placeholder="e.g. Maria Santos"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                placeholder="mariasantos@gmail.com"
                className="form-field"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                placeholder="+63 9xx xxx xxxx"
                className="form-field"
              />
            </div>
            <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full gradient-btn rounded-2xl text-white">
              {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Profile
            </Button>

            <div className="rounded-2xl border border-border bg-secondary/50 p-4">
              <h4 className="text-sm font-semibold text-foreground">Change Password</h4>
              <div className="mt-3 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowCurrentPassword((value) => !value)}>
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowNewPassword((value) => !value)}>
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowConfirmPassword((value) => !value)}>
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button onClick={handleChangePassword} disabled={savingPassword} className="w-full rounded-2xl bg-amber-500 text-slate-950 hover:bg-amber-600">
                  {savingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  Update Password
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="surface rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <span className="rounded-lg bg-amber-500/15 p-2 text-amber-600">
                <Settings2 className="h-4 w-4" />
              </span>
              System Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="systemTitle">System Title</Label>
              <Input
                id="systemTitle"
                value={settingsForm.systemTitle}
                onChange={(e) => setSettingsForm({ ...settingsForm, systemTitle: e.target.value })}
                placeholder="e.g. Manila Prime Property Management"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={settingsForm.companyName}
                onChange={(e) => setSettingsForm({ ...settingsForm, companyName: e.target.value })}
                placeholder="e.g. Manila Prime Staycation"
              />
            </div>

            <hr className="my-2 border-slate-200" />
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-amber-600" />
              <h4 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                Receipt &amp; Guide Settings
              </h4>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wifiName">WiFi Name</Label>
                <Input
                  id="wifiName"
                  value={settingsForm.wifiName}
                  onChange={(e) => setSettingsForm({ ...settingsForm, wifiName: e.target.value })}
                  className="form-field"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wifiPassword">WiFi Password</Label>
                <Input
                  id="wifiPassword"
                  value={settingsForm.wifiPassword}
                  onChange={(e) => setSettingsForm({ ...settingsForm, wifiPassword: e.target.value })}
                  className="form-field"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="checkIn">Check-in Time</Label>
                <Input
                  id="checkIn"
                  type="time"
                  value={settingsForm.checkIn}
                  onChange={(e) => setSettingsForm({ ...settingsForm, checkIn: e.target.value })}
                  className="form-field"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="checkOut">Check-out Time</Label>
                <Input
                  id="checkOut"
                  type="time"
                  value={settingsForm.checkOut}
                  onChange={(e) => setSettingsForm({ ...settingsForm, checkOut: e.target.value })}
                  className="form-field"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactName">Contact Name</Label>
              <Input
                id="contactName"
                value={settingsForm.contactName}
                onChange={(e) => setSettingsForm({ ...settingsForm, contactName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">Contact Phone</Label>
              <Input
                id="contactPhone"
                value={settingsForm.contactPhone}
                onChange={(e) => setSettingsForm({ ...settingsForm, contactPhone: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentOptions">Payment Options</Label>
              <Textarea
                id="paymentOptions"
                value={settingsForm.paymentOptions}
                onChange={(e) => setSettingsForm({ ...settingsForm, paymentOptions: e.target.value })}
                className="form-field-area"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="specialDetails">Special Details</Label>
              <Textarea
                id="specialDetails"
                value={settingsForm.specialDetails}
                onChange={(e) => setSettingsForm({ ...settingsForm, specialDetails: e.target.value })}
                className="form-field-area"
              />
            </div>

            <Button onClick={handleSaveSettings} disabled={savingSettings} className="w-full gradient-btn rounded-2xl text-white">
              {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
