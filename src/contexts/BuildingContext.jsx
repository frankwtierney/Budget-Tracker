import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  subscribeToDocument,
  subscribeToCollection,
  where,
} from '../lib/firestore';

const OrgContext = createContext(null);

// Single context that provides the full Department → Area → Building hierarchy
// the user has access to, plus the currently selected scope (which budget the
// pages render). Existing pages keep using useBuilding() — that returns the
// selected building when scope === 'building', else null.

export function BuildingProvider({ children }) {
  const { user } = useAuth();
  const [userDoc, setUserDoc] = useState(null);
  const [departments, setDepartments] = useState({});
  const [areas, setAreas] = useState({});
  const [buildings, setBuildings] = useState({});
  const [complexes, setComplexes] = useState({});
  const [fiscalYear, setFiscalYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState(null); // { level, id } or null

  // 1. Subscribe to user doc
  useEffect(() => {
    if (!user) {
      setUserDoc(null);
      setLoading(false);
      return;
    }
    const unsub = subscribeToDocument(`users/${user.uid}`, setUserDoc);
    return unsub;
  }, [user]);

  // 2. Subscribe to each accessible doc by ID (single-record reads pass rules)
  const deptIdsKey = (userDoc?.departmentIds ?? []).join(',');
  const areaIdsKey = (userDoc?.areaIds ?? []).join(',');
  const buildingIdsKey = (userDoc?.buildingIds ?? []).join(',');

  useEffect(() => {
    if (!user || !userDoc) return;

    const deptIds = userDoc.departmentIds ?? [];
    const areaIds = userDoc.areaIds ?? [];
    const buildingIds = userDoc.buildingIds ?? [];

    if (deptIds.length === 0 && areaIds.length === 0 && buildingIds.length === 0) {
      setDepartments({});
      setAreas({});
      setBuildings({});
      setLoading(false);
      return;
    }

    const unsubs = [];

    const subscribeMap = (ids, path, setter) => {
      ids.forEach((id) => {
        const unsub = subscribeToDocument(`${path}/${id}`, (d) => {
          setter((prev) => {
            if (!d) {
              const next = { ...prev };
              delete next[id];
              return next;
            }
            return { ...prev, [id]: d };
          });
        });
        unsubs.push(unsub);
      });
    };

    subscribeMap(deptIds, 'departments', setDepartments);
    subscribeMap(areaIds, 'areas', setAreas);
    subscribeMap(buildingIds, 'buildings', setBuildings);

    setLoading(false);

    return () => unsubs.forEach((u) => u());
  }, [user, userDoc, deptIdsKey, areaIdsKey, buildingIdsKey]);

  // 3. Subscribe to complexes for each accessible department
  const deptKeys = Object.keys(departments).sort().join(',');
  useEffect(() => {
    const deptIds = Object.keys(departments);
    if (deptIds.length === 0) {
      setComplexes({});
      return;
    }
    const unsubs = [];
    deptIds.forEach((deptId) => {
      const unsub = subscribeToCollection(
        'complexes',
        (docs) => {
          setComplexes((prev) => {
            const next = { ...prev };
            // Remove old entries for this dept, then add fresh
            Object.keys(next).forEach((k) => {
              if (next[k]?.departmentId === deptId) delete next[k];
            });
            docs.forEach((d) => {
              next[d.id] = d;
            });
            return next;
          });
        },
        where('departmentId', '==', deptId)
      );
      unsubs.push(unsub);
    });
    return () => unsubs.forEach((u) => u());
  }, [deptKeys]);

  // 4. Default scope: prefer user's home building, else first building, else first area, else department
  useEffect(() => {
    if (scope) return;
    const buildingIds = Object.keys(buildings);
    const areaIds = Object.keys(areas);
    const deptIds = Object.keys(departments);
    const homeId = userDoc?.homeBuildingId;
    if (homeId && buildings[homeId]) {
      setScope({ level: 'building', id: homeId });
    } else if (buildingIds.length > 0) {
      setScope({ level: 'building', id: buildingIds[0] });
    } else if (areaIds.length > 0) {
      setScope({ level: 'area', id: areaIds[0] });
    } else if (deptIds.length > 0) {
      setScope({ level: 'department', id: deptIds[0] });
    }
  }, [buildings, areas, departments, scope, userDoc?.homeBuildingId]);

  // 5. Active fiscal year for the active department
  const activeDept = useMemo(() => {
    if (scope?.level === 'department') return departments[scope.id];
    if (scope?.level === 'area') {
      const a = areas[scope.id];
      return a ? departments[a.departmentId] : null;
    }
    if (scope?.level === 'complex') {
      const c = complexes[scope.id];
      return c ? departments[c.departmentId] : null;
    }
    if (scope?.level === 'building') {
      const b = buildings[scope.id];
      return b ? departments[b.departmentId] : null;
    }
    return Object.values(departments)[0] ?? null;
  }, [scope, departments, areas, buildings, complexes]);

  useEffect(() => {
    if (!activeDept?.activeFiscalYearId) {
      setFiscalYear(null);
      return;
    }
    const unsub = subscribeToDocument(
      `departments/${activeDept.id}/fiscalYears/${activeDept.activeFiscalYearId}`,
      setFiscalYear
    );
    return unsub;
  }, [activeDept?.id, activeDept?.activeFiscalYearId]);

  // Backward-compat surface for existing pages that read `building`
  const building = useMemo(() => {
    if (scope?.level === 'building') return buildings[scope.id] ?? null;
    return null;
  }, [scope, buildings]);

  const buildingsList = useMemo(() => Object.values(buildings), [buildings]);
  const areasList = useMemo(() => Object.values(areas), [areas]);
  const complexesList = useMemo(() => Object.values(complexes), [complexes]);
  const departmentsList = useMemo(() => Object.values(departments), [departments]);

  function selectScope(level, id) {
    setScope({ level, id });
  }

  // Legacy: select a building by full doc (existing AppShell uses this)
  function selectBuilding(b) {
    if (b?.id) setScope({ level: 'building', id: b.id });
  }

  return (
    <OrgContext.Provider
      value={{
        // Hierarchy
        departments: departmentsList,
        areas: areasList,
        complexes: complexesList,
        buildings: buildingsList,
        // Maps for fast id lookup
        departmentsById: departments,
        areasById: areas,
        complexesById: complexes,
        buildingsById: buildings,
        // Selection
        scope,
        selectScope,
        activeDepartment: activeDept,
        // Backward-compat for existing pages
        building,
        loadingBuildings: loading,
        selectBuilding,
        fiscalYear,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within BuildingProvider');
  return ctx;
}

// Backward-compat alias used by existing pages.
export function useBuilding() {
  return useOrg();
}
