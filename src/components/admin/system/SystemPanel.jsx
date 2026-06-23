import { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useSystem } from '../../../contexts/SystemContext';
import { useAuth } from '../../../contexts/AuthContext';
import Button from '../../shared/Button';
import StructureEditor from './StructureEditor';
import BuildingTypesEditor from './BuildingTypesEditor';

const SYSTEM_NAV = [
  { to: '/admin/system/structure', label: 'Structure' },
  { to: '/admin/system/types', label: 'Building Types' },
  { to: '/admin/system/periods', label: 'Periods' },
];

export default function SystemPanel() {
  const { loading, isSuperAdmin, isUnclaimed, claimSuperAdmin } = useSystem();
  const { user } = useAuth();

  if (loading) {
    return <div className="text-sm text-gray-400">Loading system settings…</div>;
  }

  if (isUnclaimed) {
    return <ClaimOwnership onClaim={claimSuperAdmin} email={user?.email} />;
  }

  if (!isSuperAdmin) {
    return <NotAuthorized />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">System</h2>
        <p className="text-sm text-gray-500">
          Organization-wide settings managed by Super Admins.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {SYSTEM_NAV.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
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
        <Route path="structure" element={<StructureEditor />} />
        <Route path="types" element={<BuildingTypesEditor />} />
        <Route path="periods" element={<Placeholder title="Periods" />} />
        <Route index element={<Navigate to="structure" replace />} />
      </Routes>
    </div>
  );
}

function ClaimOwnership({ onClaim, email }) {
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState('');

  async function handleClaim() {
    setClaiming(true);
    setError('');
    try {
      await onClaim();
    } catch (err) {
      console.error(err);
      setError(err.message ?? 'Failed to claim Super Admin');
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="max-w-md space-y-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
      <h3 className="text-base font-semibold text-amber-900">Set up System Settings</h3>
      <p className="text-sm text-amber-800">
        No Super Admin exists yet. Claim ownership as{' '}
        <span className="font-medium">{email}</span> to manage building types,
        period names, and the building list.
      </p>
      <p className="text-xs text-amber-700 bg-amber-100/60 border border-amber-200 rounded px-2 py-1.5">
        <span className="font-semibold">Heads up:</span> Super Admin is a global
        role tied to your account — not to any specific building or department.
        It applies across the entire organization.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={handleClaim} loading={claiming} disabled={claiming}>
        Claim Super Admin
      </Button>
    </div>
  );
}

function NotAuthorized() {
  return (
    <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4 max-w-md">
      System settings can only be managed by a Super Admin. Contact your
      organization's Super Admin for access.
    </div>
  );
}

function Placeholder({ title }) {
  return (
    <div className="text-sm text-gray-400 italic">
      {title} editor — coming in the next phase.
    </div>
  );
}
