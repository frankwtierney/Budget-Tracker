import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  subscribeToDocument,
  subscribeToCollection,
  updateDocument,
  where,
  orderBy,
} from '../lib/firestore';

const BuildingContext = createContext(null);

export function BuildingProvider({ children }) {
  const { user } = useAuth();
  const [building, setBuilding] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [fiscalYears, setFiscalYears] = useState([]);
  const [loadingBuildings, setLoadingBuildings] = useState(true);

  // viewingFiscalYearId: null means "use the active one"
  const [viewingFiscalYearId, setViewingFiscalYearId] = useState(null);

  // Derived: the fiscal year currently being viewed across all pages
  const fiscalYear =
    fiscalYears.find(
      (fy) => fy.id === (viewingFiscalYearId ?? building?.activeFiscalYearId)
    ) ?? null;

  // Subscribe to all buildings the user has a role in
  useEffect(() => {
    if (!user) {
      setBuildings([]);
      setLoadingBuildings(false);
      return;
    }
    const unsub = subscribeToCollection('buildings', (docs) => {
      const accessible = docs.filter((b) => b.roles && b.roles[user.uid]);
      setBuildings(accessible);
      setLoadingBuildings(false);
    });
    return unsub;
  }, [user]);

  // Auto-select the first building
  useEffect(() => {
    if (buildings.length > 0 && !building) {
      setBuilding(buildings[0]);
    }
    if (buildings.length === 0) {
      setBuilding(null);
    }
  }, [buildings]);

  // Subscribe to live building doc (so activeFiscalYearId updates reflect immediately)
  useEffect(() => {
    if (!building?.id) return;
    const unsub = subscribeToDocument(`buildings/${building.id}`, (doc) => {
      if (doc) setBuilding(doc);
    });
    return unsub;
  }, [building?.id]);

  // Subscribe to all fiscal years for the selected building
  useEffect(() => {
    if (!building?.id) {
      setFiscalYears([]);
      return;
    }
    const unsub = subscribeToCollection(
      `buildings/${building.id}/fiscalYears`,
      setFiscalYears,
      orderBy('startDate', 'desc')
    );
    return unsub;
  }, [building?.id]);

  // Reset viewing year when building changes
  useEffect(() => {
    setViewingFiscalYearId(null);
  }, [building?.id]);

  function selectBuilding(b) {
    setBuilding(b);
    setFiscalYears([]);
    setViewingFiscalYearId(null);
  }

  async function activateFiscalYear(fyId) {
    if (!building?.id) return;
    await updateDocument(`buildings/${building.id}`, { activeFiscalYearId: fyId });
    // Also switch the viewing year to the newly activated one
    setViewingFiscalYearId(fyId);
  }

  return (
    <BuildingContext.Provider
      value={{
        building,
        fiscalYear,
        fiscalYears,
        viewingFiscalYearId,
        setViewingFiscalYearId,
        activateFiscalYear,
        buildings,
        loadingBuildings,
        selectBuilding,
      }}
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
