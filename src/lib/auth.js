import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';
import { EMAIL_ALLOWLIST } from '../config';

export function isEmailAllowed(email) {
  if (!email) return false;
  const lower = email.toLowerCase();
  return EMAIL_ALLOWLIST.some((entry) => {
    if (entry.startsWith('@')) return lower.endsWith(entry.toLowerCase());
    return lower === entry.toLowerCase();
  });
}

export async function loginWithEmail(email, password) {
  if (!isEmailAllowed(email)) {
    throw new Error('Your email domain is not authorized to use BudgetHub.');
  }
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(email, password) {
  if (!isEmailAllowed(email)) {
    throw new Error('Your email domain is not authorized to use BudgetHub.');
  }
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function sendPasswordReset(email) {
  return sendPasswordResetEmail(auth, email);
}

export async function logout() {
  return signOut(auth);
}
