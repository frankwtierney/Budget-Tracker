import { Routes, Route, NavLink } from 'react-router-dom';
import { useBuilding } from '../contexts/BuildingContext';
import { useSystem } from '../contexts/SystemContext';
import CategoryEditor from '../components/admin/CategoryEditor';
import AllocationEditor from '../components/admin/AllocationEditor';
import StrategyTypeEditor from '../components/admin/StrategyTypeEditor';
import StaffRoster from '../components/admin/StaffRoster';
import VendorList from '../components/admin/VendorList';
import PaymentSourcesList from '../components/admin/PaymentSourcesList';
import BuildingSettings from '../components/admin/BuildingSettings';
import SystemPanel from '../components/admin/system/SystemPanel';

const ADMIN_NAV = [
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/allocations', label: 'Allocations' },
  { to: '/admin/strategies', label: 'Strategy Types' },
  { to: '/admin/staff', label: 'Staff Roster' },
  { to: '/admin/vendors', label: 'Vendors' },
  { to: '/admin/payment-sources', label: 'Payment Sources' },
  { to: '/admin/settings', label: 'Building Settings' },
];

export default function Admin() {
  const { building } = useBuilding();
  const { isSuperAdmin, isUnclaimed } = useSystem();

  if (!building) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;
  }

  // Show System tab to existing Super Admins, or to anyone when no Super Admin
  // exists yet (so the first user can claim ownership).
  const showSystem = isSuperAdmin || isUnclaimed;
  const nav = showSystem
    ? [...ADMIN_NAV, { to: '/admin/system', label: 'System' }]
    : ADMIN_NAV;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
        <p className="text-sm text-gray-500 mt-1">{building.name}</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {nav.map(({ to, label }) => (
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
        <Route path="categories" element={<CategoryEditor />} />
        <Route path="allocations" element={<AllocationEditor building={building} />} />
        <Route path="strategies" element={<StrategyTypeEditor />} />
        <Route path="staff" element={<StaffRoster building={building} />} />
        <Route path="vendors" element={<VendorList building={building} />} />
        <Route path="payment-sources" element={<PaymentSourcesList />} />
        <Route path="settings" element={<BuildingSettings building={building} />} />
        {showSystem && <Route path="system/*" element={<SystemPanel />} />}
        <Route index element={<CategoryEditor />} />
      </Routes>
    </div>
  );
}
