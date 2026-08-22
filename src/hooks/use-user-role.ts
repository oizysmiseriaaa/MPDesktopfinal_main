'use client';

import { doc } from 'firebase/firestore';
import { useMemo } from 'react';
import { useDoc, useFirestore, useUser } from '@/firebase';
import { AppRole, normalizeRole } from '@/auth/roles';

export function useUserRole() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const profileRef = useMemo(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user?.uid]
  );
  const { data: profile, isLoading: isProfileLoading } = useDoc<{ role?: string }>(profileRef);

  const role: AppRole = normalizeRole(profile?.role);
  return {
    role,
    isRoleLoading: isUserLoading || isProfileLoading,
  };
}
