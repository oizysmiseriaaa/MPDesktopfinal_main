"use client";

import { create } from "zustand";
import { getDocs, collection, Firestore, onSnapshot } from "firebase/firestore";
import type { Auth } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAuth, useFirestore, useUser } from "@/firebase";
import { apiClient } from "@/lib/api-client";
import { mergeOfficialUnits } from "@/lib/official-units";
import { normalizeSecurityDeposits } from "@/lib/utils-app";
import { canAccessResource } from "@/auth/roles";
import { useUserRole } from "@/hooks/use-user-role";

type ResourceName =
  | "units"
  | "bookings"
  | "expenses"
  | "booking-payments"
  | "security-deposits"
  | "reminders"
  | "agents"
  | "investors";

type ResourceContext = {
  auth?: Auth | null;
  firestore?: Firestore | null;
  userId?: string | null;
};

type ResourceMap = Partial<Record<ResourceName, any[]>>;
type FlagMap = Partial<Record<ResourceName, boolean>>;
type ErrorMap = Partial<Record<ResourceName, string | null>>;
type SourceMap = Partial<Record<ResourceName, "firestore" | "api">>;

const TTL_MS = 5 * 60_000;
const SNAPSHOT_IGNORE_MS = 5_000;

const RESOURCE_CONFIG: Record<
  ResourceName,
  { endpoint: string; firestoreCollections: string[] }
> = {
  units: { endpoint: "/units", firestoreCollections: ["units"] },
  bookings: { endpoint: "/bookings", firestoreCollections: ["bookings"] },
  expenses: { endpoint: "/expenses", firestoreCollections: ["expenses"] },
  "booking-payments": {
    endpoint: "/booking-payments",
    firestoreCollections: ["booking-payments"],
  },
  "security-deposits": {
    endpoint: "/security-deposits",
    firestoreCollections: ["security-deposits"],
  },
  reminders: { endpoint: "/reminders", firestoreCollections: ["reminders"] },
  agents: { endpoint: "/agents", firestoreCollections: ["agents"] },
  investors: { endpoint: "/investors", firestoreCollections: ["investors"] },
};

async function tryReadFromFirestore(
  resource: ResourceName,
  firestore?: Firestore | null,
): Promise<any[] | null> {
  if (!firestore) return null;
  const config = RESOURCE_CONFIG[resource];

  for (const name of config.firestoreCollections) {
    try {
      const snapshot = await getDocs(collection(firestore, name));
      if (!snapshot.empty) {
        return snapshot.docs.map((docItem: any) => ({
          ...docItem.data(),
          id: docItem.id,
        }));
      }
    } catch {
      // Fallback to API below.
    }
  }

  return null;
}

// Real-time Firestore subscriptions keep the store in sync with the
// security-deposits (and other) collections without a page refresh.
const realtimeUnsubscribers = new Map<string, () => void>();
let listenerOwnerId: string | null = null;
const snapshotIgnoreUntil = new Map<string, number>();
const activeResources = new Set<ResourceName>();

function resetRealtimeStateForUser(userId: string | null) {
  if (listenerOwnerId === userId) return;
  realtimeUnsubscribers.forEach((unsubscribe) => unsubscribe());
  realtimeUnsubscribers.clear();
  listenerOwnerId = userId;
  snapshotIgnoreUntil.clear();
  activeResources.clear();
  useAppDataStore.setState({
    data: {},
    loading: {},
    backgroundLoading: {},
    errors: {},
    loadedAt: {},
    source: {},
    inflight: {},
  });
}

function releaseRealtimeSync(resources: ResourceName[]) {
  for (const resource of resources) {
    activeResources.delete(resource);
    const config = RESOURCE_CONFIG[resource];
    for (const name of config.firestoreCollections) {
      const subscriptionKey = `${resource}:${name}`;
      const unsub = realtimeUnsubscribers.get(subscriptionKey);
      if (unsub) {
        unsub();
        realtimeUnsubscribers.delete(subscriptionKey);
      }
    }
  }
}

function ensureRealtimeSync(
  resource: ResourceName,
  firestore?: Firestore | null,
) {
  if (!firestore) return;

  activeResources.add(resource);
  const config = RESOURCE_CONFIG[resource];
  for (const name of config.firestoreCollections) {
    const subscriptionKey = `${resource}:${name}`;
    if (realtimeUnsubscribers.has(subscriptionKey)) continue;
    try {
      const ref = collection(firestore, name);
      const unsub = onSnapshot(
        ref,
        (snapshot) => {
          const ignoreUntil = snapshotIgnoreUntil.get(subscriptionKey) || 0;
          if (Date.now() < ignoreUntil) return;
          const docs = snapshot.docs.map((docItem: any) => ({
            ...docItem.data(),
            id: docItem.id,
          }));
          const normalized = normalizeResourceData(resource, docs);
          useAppDataStore.setState((s) => {
            const current = s.data[resource];
            if (
              hasUsableData(current) &&
              shallowEqualArrays(current, normalized)
            ) {
              return s;
            }
            return {
              data: { ...s.data, [resource]: normalized },
              loadedAt: { ...s.loadedAt, [resource]: Date.now() },
              source: { ...s.source, [resource]: "firestore" },
              errors: { ...s.errors, [resource]: null },
            };
          });
        },
        (err) => {
          console.error(
            `[app-data-store] realtime listener error for ${resource}:`,
            err,
          );
        },
      );
      realtimeUnsubscribers.set(subscriptionKey, unsub);
    } catch (err) {
      console.error(
        `[app-data-store] failed to subscribe to ${resource}:`,
        err,
      );
    }
  }
}

function hasUsableData(value: unknown): value is any[] {
  return Array.isArray(value);
}

function shallowEqualArrays(a: any[], b: any[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (String(a[i]?.id || a[i]?.bookingId || "") !== String(b[i]?.id || b[i]?.bookingId || "")) {
      return false;
    }
  }
  return true;
}

// Older calendar sync runs created documents from rate-only cells. They are
// identifiable artifacts, not reservations: the generated guest equals the
// unit label and the document has no Sheet-row identity. Keep the documents
// for audit, but prevent every consuming page from counting them as bookings.
function isLegacySheetBookingPlaceholder(booking: any) {
  const id = String(booking?.id || booking?.bookingId || "");
  if (!id.startsWith("sheet-booking-") || booking?.sourceRow) return false;
  const normalize = (value: unknown) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const guest = normalize(
    [booking?.guestFirstName, booking?.guestLastName]
      .filter(Boolean)
      .join(" ") || booking?.guestName,
  );
  return Boolean(
    guest && guest === normalize(booking?.unitName) && !booking?.notes,
  );
}

function normalizeResourceData(resource: ResourceName, value: any[]) {
  if (resource === "bookings") {
    const seen = new Set<string>();
    return value.filter((booking) => {
      if (isLegacySheetBookingPlaceholder(booking)) return false;
      const identity = String(booking?.id || booking?.bookingId || "");
      if (!identity || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }
  if (resource === "security-deposits") {
    return normalizeSecurityDeposits(value);
  }
  return value;
}

type StoreState = {
  data: ResourceMap;
  loading: FlagMap;
  backgroundLoading: FlagMap;
  errors: ErrorMap;
  loadedAt: Partial<Record<ResourceName, number>>;
  source: SourceMap;
  inflight: Partial<Record<ResourceName, Promise<void>>>;
  ensureResources: (
    resources: ResourceName[],
    ctx: ResourceContext,
    force?: boolean,
  ) => Promise<void>;
  invalidateResources: (resources: ResourceName[]) => void;
};

export const useAppDataStore = create<StoreState>((set, get) => ({
  data: {},
  loading: {},
  backgroundLoading: {},
  errors: {},
  loadedAt: {},
  source: {},
  inflight: {},
  ensureResources: async (resources, ctx, force = false) => {
    const tasks = resources.map(async (resource) => {
      // Establish a live Firestore subscription regardless of cache freshness
      // so that external changes propagate to every consumer in real time.
      ensureRealtimeSync(resource, ctx.firestore);

      const state = get();
      const loadedAt = state.loadedAt[resource] ?? 0;
      const freshEnough =
        !force && loadedAt > 0 && Date.now() - loadedAt < TTL_MS;
      if (freshEnough) return;

      const current = get().inflight[resource];
      if (current) return current;

      const hasCachedData = hasUsableData(get().data[resource]);
      const promise = (async () => {
        set((s) => ({
          loading: { ...s.loading, [resource]: !hasCachedData },
          backgroundLoading: {
            ...s.backgroundLoading,
            [resource]: hasCachedData,
          },
          errors: { ...s.errors, [resource]: null },
        }));

        try {
          if (force) {
            snapshotIgnoreUntil.set(
              `${resource}:${RESOURCE_CONFIG[resource].firestoreCollections[0]}`,
              Date.now() + SNAPSHOT_IGNORE_MS,
            );
            const apiData = await apiClient.get<any[]>(
              RESOURCE_CONFIG[resource].endpoint,
              ctx.auth ?? undefined,
            );
            if (Array.isArray(apiData)) {
              const normalizedApiData = normalizeResourceData(resource, apiData);
              set((s) => ({
                data: { ...s.data, [resource]: normalizedApiData },
                loading: { ...s.loading, [resource]: false },
                backgroundLoading: { ...s.backgroundLoading, [resource]: false },
                loadedAt: { ...s.loadedAt, [resource]: Date.now() },
                source: { ...s.source, [resource]: "api" },
              }));
              return;
            }

            set((s) => ({
              data: { ...s.data, [resource]: [] },
              loading: { ...s.loading, [resource]: false },
              backgroundLoading: { ...s.backgroundLoading, [resource]: false },
              loadedAt: { ...s.loadedAt, [resource]: Date.now() },
              source: { ...s.source, [resource]: "api" },
            }));
            return;
          }

          const firestoreData = await tryReadFromFirestore(
            resource,
            ctx.firestore,
          );
          if (firestoreData) {
            const normalizedFirestoreData = normalizeResourceData(
              resource,
              firestoreData,
            );
            set((s) => ({
              data: { ...s.data, [resource]: normalizedFirestoreData },
              loading: { ...s.loading, [resource]: false },
              backgroundLoading: { ...s.backgroundLoading, [resource]: false },
              loadedAt: { ...s.loadedAt, [resource]: Date.now() },
              source: { ...s.source, [resource]: "firestore" },
            }));
            return;
          }

          const apiData = await apiClient.get<any[]>(
            RESOURCE_CONFIG[resource].endpoint,
            ctx.auth ?? undefined,
          );
          if (Array.isArray(apiData)) {
            const normalizedApiData = normalizeResourceData(resource, apiData);
            set((s) => ({
              data: {
                ...s.data,
                [resource]: normalizedApiData,
              },
              loading: { ...s.loading, [resource]: false },
              backgroundLoading: { ...s.backgroundLoading, [resource]: false },
              loadedAt: { ...s.loadedAt, [resource]: Date.now() },
              source: { ...s.source, [resource]: "api" },
            }));
            return;
          }

          set((s) => ({
            data: {
              ...s.data,
              [resource]: [],
            },
            loading: { ...s.loading, [resource]: false },
            backgroundLoading: { ...s.backgroundLoading, [resource]: false },
            loadedAt: { ...s.loadedAt, [resource]: Date.now() },
            source: { ...s.source, [resource]: "api" },
          }));
        } catch (error: any) {
          set((s) => ({
            loading: { ...s.loading, [resource]: false },
            backgroundLoading: { ...s.backgroundLoading, [resource]: false },
            errors: {
              ...s.errors,
              [resource]: error?.message || `Failed to load ${resource}`,
            },
          }));
        } finally {
          set((s) => {
            const nextInflight = { ...s.inflight };
            delete nextInflight[resource];
            return { inflight: nextInflight };
          });
        }
      })();

      set((s) => ({ inflight: { ...s.inflight, [resource]: promise } }));
      return promise;
    });

    await Promise.all(tasks);
  },
  invalidateResources: (resources) => {
    set((s) => {
      const loadedAt = { ...s.loadedAt };
      const errors = { ...s.errors };
      for (const resource of resources) {
        delete loadedAt[resource];
        delete errors[resource];
      }
      return { loadedAt, errors };
    });
  },
}));

type UseAppResourcesOptions = {
  preloadOnly?: boolean;
};

export function useAppResources(
  resources: ResourceName[],
  options?: UseAppResourcesOptions,
) {
  const auth = useAuth();
  const firestore = useFirestore();
  const { user } = useUser();
  const { role } = useUserRole();
  const ensureResources = useAppDataStore((s) => s.ensureResources);
  const invalidateResources = useAppDataStore((s) => s.invalidateResources);
  const data = useAppDataStore((s) => s.data);
  const loadingMap = useAppDataStore((s) => s.loading);
  const backgroundLoadingMap = useAppDataStore((s) => s.backgroundLoading);
  const errorMap = useAppDataStore((s) => s.errors);

  const resourceSignature = resources.join("|");

  const resourceList = useMemo(
    () =>
      Array.from(
        new Set(
          resources
            .filter((resource): resource is ResourceName => !!resource)
            .filter((resource) => canAccessResource(role, resource)),
        ),
      ),
    [resourceSignature, role],
  );

  const key = resourceList.join("|");

  useEffect(() => {
    resetRealtimeStateForUser(user?.uid ?? null);
    if (!user || resourceList.length === 0) return;
    ensureResources(resourceList, { auth, firestore, userId: user.uid });
  }, [user?.uid, auth, firestore, key, ensureResources, resourceList]);

  const previousResourceList = useRef<ResourceName[]>([]);
  useEffect(() => {
    const prev = previousResourceList.current;
    const removed = prev.filter((r) => !resourceList.includes(r));
    if (removed.length > 0) {
      releaseRealtimeSync(removed);
    }
    previousResourceList.current = resourceList;
  }, [resourceList]);

  const refresh = useCallback(
    async (targetResources?: ResourceName[]) => {
      const list = (targetResources ?? resourceList).filter((resource) =>
        canAccessResource(role, resource),
      );
      invalidateResources(list);
      if (list.length === 0) return;
      await ensureResources(list, { auth, firestore, userId: user?.uid }, true);
    },
    [
      resourceList,
      role,
      invalidateResources,
      ensureResources,
      auth,
      firestore,
      user?.uid,
    ],
  );

  return useMemo(() => {
    const resourceData = Object.fromEntries(
      resourceList.map((resource) => {
        const value = data[resource] ?? [];
        if (resource === "units") {
          return [resource, mergeOfficialUnits(value)];
        }
        return [resource, value];
      }),
    ) as Record<ResourceName, any[]>;
    const loading = resourceList.some(
      (resource) =>
        Boolean(loadingMap[resource]) && !hasUsableData(data[resource]),
    );
    const backgroundLoading = resourceList.some((resource) =>
      Boolean(backgroundLoadingMap[resource]),
    );
    const errors = resourceList
      .map((resource) => errorMap[resource])
      .filter(Boolean)
      .join("\n");

    return {
      data: resourceData,
      loading: options?.preloadOnly ? false : loading,
      backgroundLoading,
      error: errors || null,
      refresh,
      invalidate: invalidateResources,
    };
  }, [
    resourceList,
    data,
    loadingMap,
    backgroundLoadingMap,
    errorMap,
    invalidateResources,
    refresh,
    options?.preloadOnly,
  ]);
}
