"use client";

import { Auth } from "firebase/auth";
import { useAppDataStore } from "./app-data-store";

// Fallback URL for static builds if environmental variables are undefined
const DEFAULT_BASE_URL =
  "https://asia-southeast1-unified-booker.cloudfunctions.net/api";

const getBaseUrl = () => {
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  return DEFAULT_BASE_URL;
};

const API_BASE_URL = getBaseUrl();
const REQUEST_TIMEOUT_MS = 15_000; // Increased slightly for desktop latency
const GET_CACHE_TTL_MS = 45_000;
const TOKEN_CACHE_TTL_MS = 55_000;

// --- Caches and helpers ---

/** Simple GET response cache */
const getCache = new Map<string, { data: any; expiresAt: number }>();

/** In-flight GET dedup map */
const inflightRequests = new Map<string, Promise<any>>();
let cacheGeneration = 0;

/** Auth token cache keyed by uid */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Build a deterministic cache key from path + options */
function getRequestKey(
  path: string,
  options: RequestInit = {},
  userId?: string,
): string {
  const method = (options.method || "GET").toUpperCase();
  const body = typeof options.body === "string" ? options.body : "";
  return `${userId || "anonymous"}:${method}:${path}:${body}`;
}

/** Clear the entire GET response cache */
function clearGetCache() {
  cacheGeneration += 1;
  getCache.clear();
  inflightRequests.clear();
}

async function getAuthToken(auth?: Auth) {
  const user = auth?.currentUser;
  if (!user) return null;

  const cacheKey = user.uid;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  try {
    // Firebase refreshes expired tokens itself. Forcing a refresh for every
    // CRUD request turns a normal save into an extra network round trip and
    // causes visible UI stalls in the desktop app.
    const token = await user.getIdToken();
    tokenCache.set(cacheKey, {
      token,
      expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
    });
    return token;
  } catch (e) {
    console.error("Auth token refresh failed:", e);
    return null;
  }
}

function invalidateCache(path: string) {
  try {
    const lowerPath = path.toLowerCase();
    const invalidList: any[] = [];
    if (
      lowerPath.includes("/booking") ||
      lowerPath.includes("/security-deposit")
    ) {
      invalidList.push("bookings", "booking-payments", "security-deposits");
    } else if (lowerPath.includes("/expense")) {
      invalidList.push("expenses");
    } else if (lowerPath.includes("/unit")) {
      invalidList.push("units");
    } else if (lowerPath.includes("/agent")) {
      invalidList.push("agents");
    } else if (lowerPath.includes("/investor")) {
      invalidList.push("investors");
    } else if (lowerPath.includes("/reminder")) {
      invalidList.push("reminders");
    }
    if (invalidList.length > 0) {
      useAppDataStore.getState().invalidateResources(invalidList);
    }
  } catch (e) {
    console.error("Failed to invalidate cache:", e);
  }
}

async function fetchFromApi<T>(
  path: string,
  options: RequestInit = {},
  auth?: Auth,
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const requestKey = getRequestKey(path, options, auth?.currentUser?.uid);
  const requestGeneration = cacheGeneration;

  if (method === "GET") {
    const cached = getCache.get(requestKey);
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.data as T);
    }
    if (cached) getCache.delete(requestKey);

    const inflight = inflightRequests.get(requestKey);
    if (inflight) return inflight as Promise<T>;
  }

  // Format target endpoint path
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  const requestPromise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const token = await getAuthToken(auth);
      const headers = new Headers(options.headers || {});
      headers.set("Content-Type", "application/json");
      if (token) headers.set("Authorization", `Bearer ${token}`);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown Error");
        let parsedError: string | null = null;

        try {
          const parsed = JSON.parse(errorText);
          parsedError =
            typeof parsed?.error === "string"
              ? parsed.error
              : typeof parsed?.message === "string"
                ? parsed.message
                : null;
        } catch {
          parsedError = null;
        }

        const finalMessage =
          parsedError ||
          errorText ||
          `Request failed with status ${response.status}`;
        console.error(`API Error [${response.status}]:`, finalMessage);
        throw new Error(finalMessage);
      }

      if (response.status === 204) {
        if (method !== "GET") {
          invalidateCache(path);
        }
        return null as unknown as T;
      }
      const data = (await response.json()) as T;
      if (method === "GET") {
        if (requestGeneration === cacheGeneration) {
          getCache.set(requestKey, {
            data,
            expiresAt: Date.now() + GET_CACHE_TTL_MS,
          });
        }
      } else {
        invalidateCache(path);
      }
      return data;
    } catch (error: any) {
      if (error?.name === "AbortError")
        throw new Error("Request timed out. Check your internet connection.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  })();

  if (method === "GET") {
    inflightRequests.set(requestKey, requestPromise);
    const clearInflight = () => {
      if (inflightRequests.get(requestKey) === requestPromise) {
        inflightRequests.delete(requestKey);
      }
    };
    void requestPromise.then(clearInflight, clearInflight);
  }

  return requestPromise as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, auth?: Auth) =>
    fetchFromApi<T>(path, { method: "GET" }, auth),
  post: <T>(path: string, data: unknown, auth?: Auth) =>
    fetchFromApi<T>(path, { method: "POST", body: JSON.stringify(data) }, auth),
  put: <T>(path: string, data: unknown, auth?: Auth) =>
    fetchFromApi<T>(path, { method: "PUT", body: JSON.stringify(data) }, auth),
  delete: <T>(path: string, auth?: Auth) =>
    fetchFromApi<T>(path, { method: "DELETE" }, auth),
  invalidateAll: () => clearGetCache(),
};
