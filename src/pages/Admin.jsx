import { useState, useEffect } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { useBuilding } from '../contexts/BuildingContext';
import { subscribeToCollection, where, orderBy } from '../lib/firestore';
import CategoryEditor from '../components/admin/CategoryEditor';
import StaffRoster from '../components/admin/StaffRoster';
import BuildingSettings from '../components/admin/BuildingSettings';
import ReconciliationView from '../components/admin/ReconciliationView';
import CsvImport from '../components/admin/CsvImport';

const ADMIN_NAV = [
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/staff', label: 'Staff Roster' },
  { to: '/admin/reconciliation', label: 'Reconciliation' },
  { to: '/admin/import', label: 'Import CSV' },
  { to: '/admin/settings', label: 'Building Settings' },
];

function ReconciliationWrapper({ building }) {
  const { fiscalYear } = useBuilding();
  if (!fiscalYear) return <div className="text-gray-400">No active fiscal year.</div>;
  return <ReconciliationView building={building} fiscalYear={fiscalYear} />;
}

function CsvImportWrapper({ building }) {
  const { fiscalYear } = useBuilding();
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);

  useEffect(() => {
    if (!building?.id || !fiscalYear?.id) return;
    const unsubCats = subscribeToCollection(
      `buildings/${building.id}/categories`,
      setCategories,
      where('fiscalYearId', '==', fiscalYear.id),
      orderBy('order', 'asc')
    );
    const unsubVendors = subscribeToCollection(
      `buildings/${building.id}/vendors`,
      setVendors,
      orderBy('name', 'asc')
    );
    return () => { unsubCats(); unsubVendors(); };
  }, [building?.id, fiscalYear?.id]);

  if (!fiscalYear) return <div className="text-gray-400">No active fiscal year.</div>;

  return (
    <CsvImport
      building={building}
      fiscalYear={fiscalYear}
      categories={categories}
      existingVendors={vendors}
    />
  );
}

export default function Admin() {
  const { building } = useBuilding();

  if (!building) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
        <p className="text-sm text-gray-500 mt-1">{building.name}</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {ADMIN_NAV.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>

      <Routes>
        <Route path="categories" element={<CategoryEditor building={building} />} />
        <Route path="staff" element={<StaffRoster building={building} />} />
        <Route path="reconciliation" element={<ReconciliationWrapper building={building} />} />
        <Route path="import" element={<CsvImportWrapper building={building} />} />
        <Route path="settings" element={<BuildingSettings building={building} />} />
        <Route index element={<CategoryEditor building={building} />} />
      </Routes>
    </div>
  );
}
