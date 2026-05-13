import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useBuilding } from '../../contexts/BuildingContext';
import { APP_NAME } from '../../config';
import UserMenu from './UserMenu';

const NAV_ITEMS = [
  { to: '/', label: 'Summary', icon: ChartIcon, end: true },
  { to: '/transactions', label: 'Transactions', icon: ListIcon },
  { to: '/events', label: 'Events', icon: CalendarIcon },
  { to: '/staff', label: 'Staff', icon: UsersIcon },
  { to: '/vendors', label: 'Vendors', icon: StoreIcon },
  { to: '/admin', label: 'Admin', icon: SettingsIcon },
];

export default function AppShell({ onNewExpense }) {
  const {
    building,
    scope,
    selectScope,
    departments,
    areas,
    buildings,
    complexes,
    activeDepartment,
  } = useBuilding();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const scopeKey = scope ? `${scope.level}:${scope.id}` : '';

  function handleScopeChange(e) {
    const [level, id] = e.target.value.split(':');
    if (level && id) selectScope(level, id);
  }

  // Group buildings by area for the dropdown
  const buildingsByArea = areas.reduce((acc, a) => {
    acc[a.id] = buildings.filter((b) => b.areaId === a.id);
    return acc;
  }, {});

  // Active scope label (shown in header)
  const scopeLabel = (() => {
    if (!scope) return '';
    if (scope.level === 'department') return departments.find((d) => d.id === scope.id)?.shortName ?? '';
    if (scope.level === 'area') {
      const a = areas.find((x) => x.id === scope.id);
      return a ? `${a.code} — ${a.name}` : '';
    }
    if (scope.level === 'complex') {
      const c = complexes.find((x) => x.id === scope.id);
      return c ? `Complex: ${c.name}` : '';
    }
    if (scope.level === 'building') {
      const b = buildings.find((x) => x.id === scope.id);
      return b ? `${b.code} — ${b.name}` : '';
    }
    return '';
  })();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-gray-200">
        <div className="h-16 flex items-center px-4 border-b border-gray-100">
          <span className="text-lg font-bold text-blue-600">{APP_NAME}</span>
        </div>
        {activeDepartment && (
          <div className="px-4 py-3 border-b border-gray-100 space-y-2">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Viewing</p>
            <select
              value={scopeKey}
              onChange={handleScopeChange}
              className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <optgroup label="Department">
                {departments.map((d) => (
                  <option key={d.id} value={`department:${d.id}`}>
                    {d.shortName ?? d.name}
                  </option>
                ))}
              </optgroup>
              {areas.length > 0 && (
                <optgroup label="Areas">
                  {areas.map((a) => (
                    <option key={a.id} value={`area:${a.id}`}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {complexes.length > 0 && (
                <optgroup label="Complexes">
                  {complexes.map((c) => (
                    <option key={c.id} value={`complex:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {areas.map((a) =>
                (buildingsByArea[a.id] ?? []).length > 0 ? (
                  <optgroup key={a.id} label={`Buildings — ${a.code}`}>
                    {buildingsByArea[a.id].map((b) => (
                      <option key={b.id} value={`building:${b.id}`}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null
              )}
            </select>
            <p className="text-xs text-gray-500 truncate">{scopeLabel}</p>
          </div>
        )}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden text-gray-500 hover:text-gray-700"
              onClick={() => setSidebarOpen(true)}
            >
              <MenuIcon className="w-5 h-5" />
            </button>
            {scopeLabel && (
              <span className="text-sm text-gray-500 hidden sm:block">{scopeLabel}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onNewExpense}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <PlusIcon className="w-4 h-4" />
              New Expense
            </button>
            <UserMenu />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function ChartIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function ListIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}

function UsersIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function StoreIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function SettingsIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function PlusIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function CalendarIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function MenuIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
