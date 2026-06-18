import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { subscribeToDocument, setDocument } from '../lib/firestore';
import { serverTimestamp } from 'firebase/firestore';
import { isSuperAdmin as checkSuperAdmin } from '../lib/structure';

const SYSTEM_DOC_PATH = 'system/config';

const SystemContext = createContext(null);

export function SystemProvider({ children }) {
  const { user } = useAuth();
  const [systemDoc, setSystemDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) {
      setSystemDoc(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToDocument(
      SYSTEM_DOC_PATH,
      (doc) => {
        setSystemDoc(doc);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );
    return unsub;
  }, [user]);

  const isSuperAdmin = checkSuperAdmin(systemDoc, user?.uid);
  const isUnclaimed = !loading && !systemDoc;

  async function claimSuperAdmin() {
    if (!user) throw new Error('Not signed in');
    if (systemDoc) throw new Error('System already claimed');
    await setDocument(SYSTEM_DOC_PATH, {
      roles: { [user.uid]: 'admin' },
      buildingTypes: [],
      periods: { fixed: ['FALL', 'SPRING'], extras: [] },
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    });
  }

  return (
    <SystemContext.Provider
      value={{ systemDoc, loading, error, isSuperAdmin, isUnclaimed, claimSuperAdmin }}
    >
      {children}
    </SystemContext.Provider>
  );
}

export function useSystem() {
  const ctx = useContext(SystemContext);
  if (!ctx) throw new Error('useSystem must be used within SystemProvider');
  return ctx;
}
