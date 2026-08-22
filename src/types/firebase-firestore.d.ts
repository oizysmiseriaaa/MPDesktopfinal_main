declare module "firebase/app" {
  export class FirebaseError extends Error {
    code: string;
    customData?: unknown;
  }

  export interface FirebaseApp {
    name: string;
    options: Record<string, unknown>;
  }

  export function initializeApp(options?: Record<string, unknown>): FirebaseApp;
  export function getApps(): FirebaseApp[];
  export function getApp(): FirebaseApp;
}

declare module "firebase/auth" {
  export interface UserInfo {
    providerId: string;
    uid: string;
  }

  export interface User {
    uid: string;
    email: string | null;
    displayName: string | null;
    emailVerified: boolean;
    phoneNumber: string | null;
    tenantId: string | null;
    providerData: UserInfo[];
    getIdToken(forceRefresh?: boolean): Promise<string>;
  }

  export interface UserCredential {
    user: User;
  }

  export interface AuthCredential {
    providerId: string;
  }

  export interface ActionCodeSettings {
    url?: string;
    handleCodeInApp?: boolean;
    iOS?: {
      bundleId?: string;
    };
    android?: {
      packageName: string;
      installApp?: boolean;
      minimumVersion?: string;
    };
    dynamicLinkDomain?: string;
  }

  export interface Auth {
    currentUser: User | null;
  }

  export class EmailAuthProvider {
    static credential(email: string, password: string): AuthCredential;
  }

  export const browserLocalPersistence: unknown;
  export function setPersistence(
    auth: Auth,
    persistence: unknown,
  ): Promise<void>;
  export function getAuth(app?: unknown): Auth;
  export function signInAnonymously(auth: Auth): Promise<UserCredential>;
  export function createUserWithEmailAndPassword(
    auth: Auth,
    email: string,
    password: string,
  ): Promise<UserCredential>;
  export function signInWithEmailAndPassword(
    auth: Auth,
    email: string,
    password: string,
  ): Promise<UserCredential>;
  export function signOut(auth: Auth): Promise<void>;
  export function sendPasswordResetEmail(
    auth: Auth,
    email: string,
    actionCodeSettings?: ActionCodeSettings,
  ): Promise<void>;
  export function reauthenticateWithCredential(
    user: User,
    credential: AuthCredential,
  ): Promise<void>;
  export function updatePassword(
    user: User,
    newPassword: string,
  ): Promise<void>;
  export function onAuthStateChanged(
    auth: Auth,
    nextOrObserver: (user: User | null) => void,
    error?: (error: unknown) => void,
  ): () => void;
}

declare module "firebase/firestore" {
  export interface DocumentData {
    [key: string]: unknown;
  }

  export interface Firestore {
    _type: "firestore";
  }

  export interface FirestoreError extends Error {
    code?: string;
  }

  export interface Query<T = DocumentData> {
    type: string;
    _query?: { path: { canonicalString(): string } };
  }

  export interface CollectionReference<T = DocumentData> extends Query<T> {
    path: string;
    type: "collection";
  }

  export interface DocumentReference<T = DocumentData> {
    path: string;
    type: "document";
  }

  export interface DocumentSnapshot<T = DocumentData> {
    id: string;
    exists(): boolean;
    data(): T | undefined;
  }

  export interface QuerySnapshot<T = DocumentData> {
    docs: Array<{ id: string; data(): T | undefined }>;
    empty: boolean;
  }

  export interface SetOptions {
    merge?: boolean;
  }

  export class Timestamp {
    constructor(seconds?: number, nanoseconds?: number);
    toDate(): Date;
  }

  export function collection(
    firestore: Firestore,
    ...pathSegments: string[]
  ): CollectionReference;
  export function doc(
    firestore: Firestore,
    ...pathSegments: string[]
  ): DocumentReference;
  export function query<T = DocumentData>(...args: unknown[]): Query<T>;
  export function limit<T = DocumentData>(...args: unknown[]): unknown;
  export function orderBy<T = DocumentData>(...args: unknown[]): unknown;
  export function serverTimestamp(): unknown;
  export function getDocs<T = DocumentData>(
    queryOrRef: CollectionReference<T> | Query<T>,
  ): Promise<QuerySnapshot<T>>;
  export function setDoc<T = DocumentData>(
    docRef: DocumentReference<T>,
    data: T,
    options?: SetOptions,
  ): Promise<void>;
  export function addDoc<T = DocumentData>(
    colRef: CollectionReference<T>,
    data: T,
  ): Promise<DocumentReference<T>>;
  export function updateDoc<T = DocumentData>(
    docRef: DocumentReference<T>,
    data: Partial<T>,
  ): Promise<void>;
  export function deleteDoc(docRef: DocumentReference): Promise<void>;
  export function onSnapshot<T = DocumentData>(
    query: Query<T>,
    next: (snapshot: QuerySnapshot<T>) => void,
    error?: (error: FirestoreError) => void,
  ): () => void;

  export function onSnapshot<T = DocumentData>(
    docRef: DocumentReference<T>,
    next: (snapshot: DocumentSnapshot<T>) => void,
    error?: (error: FirestoreError) => void,
  ): () => void;

  export function getFirestore(app: unknown): Firestore;
}
