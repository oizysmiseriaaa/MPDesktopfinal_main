"use client";

import React, { useMemo, useState, useEffect, type ReactNode } from "react";
import { FirebaseProvider } from "@/firebase/provider";
import { initializeFirebase } from "@/firebase/init";
import { browserLocalPersistence, setPersistence } from "firebase/auth";

interface FirebaseClientProviderProps {
  children: ReactNode;
}

export function FirebaseClientProvider({
  children,
}: FirebaseClientProviderProps) {
  const [isReady, setIsReady] = useState(false);

  const firebaseServices = useMemo(() => {
    // 1. Initialize the app instance
    return initializeFirebase();
  }, []);

  useEffect(() => {
    const setupPersistence = async () => {
      try {
        // 2. FORCE PERSISTENCE: Crucial for Tauri/Desktop
        // This stops Firebase from looking for cookies/browser-session storage
        // that may not exist in the initial Tauri webview load.
        await setPersistence(firebaseServices.auth, browserLocalPersistence);
      } catch (err) {
        console.error("Firebase persistence error:", err);
      } finally {
        setIsReady(true);
      }
    };
    setupPersistence();
  }, [firebaseServices.auth]);

  // 3. Prevent rendering children until Firebase is ready
  // This avoids "ReferenceError: window is not defined" during build
  if (!isReady) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <FirebaseProvider
      firebaseApp={firebaseServices.firebaseApp}
      auth={firebaseServices.auth}
      firestore={firebaseServices.firestore}
    >
      {children}
    </FirebaseProvider>
  );
}
