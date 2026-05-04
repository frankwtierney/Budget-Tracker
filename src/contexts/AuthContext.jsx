import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { setDocument, getDocument } from '../lib/firestore';
import { serverTimestamp } from 'firebase/firestore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        await upsertUserDoc(firebaseUser);
        const doc = await getDocument(`users/${firebaseUser.uid}`);
        setUserDoc(doc);
      } else {
        setUser(null);
        setUserDoc(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={{ user, userDoc, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

async function upsertUserDoc(firebaseUser) {
  const path = `users/${firebaseUser.uid}`;
  const existing = await getDocument(path);
  if (!existing) {
    await setDocument(path, {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName ?? firebaseUser.email,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
  } else {
    await setDocument(path, { ...existing, lastLoginAt: serverTimestamp() });
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
