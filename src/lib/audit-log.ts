import { AppRole } from '@/auth/roles';
import { Auth } from 'firebase/auth';
import { Firestore, addDoc, collection, serverTimestamp } from 'firebase/firestore';

type AuditPayload = {
  action: string;
  module: 'settings' | 'bookings' | 'payments' | 'auth';
  targetId?: string;
  summary: string;
  details?: Record<string, unknown>;
};

export async function logAuditEvent(
  firestore: Firestore,
  auth: Auth,
  role: AppRole,
  payload: AuditPayload
) {
  const actor = auth.currentUser;
  if (!actor) return;

  try {
    await addDoc(collection(firestore, 'users', actor.uid, 'auditLogs'), {
      actorUid: actor.uid,
      actorEmail: actor.email || '',
      actorRole: role,
      action: payload.action,
      module: payload.module,
      targetId: payload.targetId || '',
      summary: payload.summary,
      details: payload.details || {},
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Audit log write skipped:', error);
  }
}
