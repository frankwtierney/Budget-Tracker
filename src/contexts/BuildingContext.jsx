import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { subscribeToDocument, subscribeToCollection, where } from '../lib/firestore';

const BuildingContext = createContext(null);

export function BuildingProvider({ children }) {
  const { user } = useAuth();
  const [building, setBuilding] = useState(null);
  const [fiscalYear, setFiscalYear] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [loadingBuildings, setLoadingBuildings] = useState(true);

  // Subscribe to all buildings the user has a role in
  useEffect(() => {
    if (!user) {
      setBuildings([]);
      setLoadingBuildings(false);
      return;
    }

    // Firestore can't query nested map keys directly, so we subscribe to
    // all buildings and filter client-side by role presence.
    // At the scale of this app (few buildings per user) this is fine.
    const unsub = subscribeToCollection('buildings', (docs) => {
      const accessible = docs.filter((b) => b.roles && b.roles[user.uid]);
      setBuildings(accessible);
      setLoadingBuildings(false);
    });

    return unsub;
  }, [user]);

  // Auto-select the first building when buildings load
  useEffect(() => {
    if (buildings.length > 0 && !building) {
      setBuilding(buildings[0]);
    }
    if (buildings.length === 0) {
      setBuilding(null);
    }
  }, [buildings]);

  // Subscribe to active fiscal year for the selected building
  useEffect(() => {
    if (!building?.activeFiscalYearId) {
      setFiscalYear(null);
      return;
    }
    const unsub = subscribeToDocument(
      `buildings/${building.id}/fiscalYears/${building.activeFiscalYearId}`,
      setFiscalYear
    );
    return unsub;
  }, [building?.id, building?.activeFiscalYearId]);

  function selectBuilding(b) {
    setBuilding(b);
    setFiscalYear(null);
  }

  return (
    <BuildingContext.Provider
      value={{ building, fiscalYear, buildings, loadingBuildings, selectBuilding }}
    >
      {children}
    </BuildingContext.Provider>
  );
}

export function useBuilding() {
  const ctx = useContext(BuildingContext);
  if (!ctx) throw new Error('useBuilding must be used within BuildingProvider');
  return ctx;
}
