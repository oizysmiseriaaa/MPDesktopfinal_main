import { FirebaseError } from 'firebase/app';

const AUTH_CODE_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'This email is already registered. Try signing in instead.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-not-found': 'No account exists for that email yet.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-credential': 'Invalid email or password. Please check and try again.',
  'auth/weak-password': 'Password is too weak. Use at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a bit and try again.',
  'auth/network-request-failed': 'Network issue detected. Please check your internet connection.',
  'auth/missing-password': 'Please enter your password.',
  'auth/missing-email': 'Please enter your email address.',
};

export function getFriendlyAuthErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError && error.code in AUTH_CODE_MESSAGES) {
    return AUTH_CODE_MESSAGES[error.code];
  }

  return 'Something went wrong while authenticating. Please try again.';
}
