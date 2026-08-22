'use client';

import React, { useMemo } from 'react';
import { collection, limit, orderBy, query, Timestamp } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

function formatAuditDate(value: unknown): string {
  if (!value) return 'Unknown date';
  if (value instanceof Timestamp) return value.toDate().toLocaleString();
  if (typeof value === 'object' && value !== null && 'seconds' in (value as Record<string, unknown>)) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toLocaleString();
  }
  return String(value);
}

export default function AuditClient() {
  const { user } = useUser();
  const firestore = useFirestore();

  const logsQuery = useMemoFirebase(
    () =>
      user
        ? query(
            collection(firestore, 'users', user.uid, 'auditLogs'),
            orderBy('createdAt', 'desc'),
            limit(100)
          )
        : null,
    [firestore, user?.uid]
  );

  const { data: logs, isLoading } = useCollection<any>(logsQuery as any);

  const grouped = useMemo(() => logs || [], [logs]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        <p className="text-sm text-muted-foreground">Loading audit timeline...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      <div>
        <h1 className="text-3xl font-bold">Audit Timeline</h1>
        <p className="text-muted-foreground">Latest changes made in settings, bookings, and payments.</p>
      </div>

      <div className="space-y-4">
        {grouped.map((entry) => (
          <Card key={entry.id} className="card-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>{entry.summary || entry.action || 'Activity event'}</span>
                <Badge variant="outline">{entry.module || 'general'}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p>{formatAuditDate(entry.createdAt)}</p>
              <p>{entry.actorEmail || entry.actorUid || 'Unknown actor'}</p>
              {entry.targetId ? <p>Target: {entry.targetId}</p> : null}
            </CardContent>
          </Card>
        ))}

        {grouped.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No audit events yet.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
