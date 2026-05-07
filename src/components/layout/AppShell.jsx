import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useBuilding } from '../../contexts/BuildingContext';
import { APP_NAME } from '../../config';
import UserMenu from './UserMenu';

const NAV_ITEMS = [
  { to: '/', label: 'Summary', icon: ChartIcon, end: true },
  { to: '/transactions', label: 'Transactions', icon: ListIcon },
  { to: '/staff', label: 'Staff', icon: UsersIcon },
  { to: '/vendors', label: 'Vendors', icon: StoreIcon },
  { to: '/admin', label: 'Admin', icon: SettingsIcon },
];

export default function AppShell({ onNewExpense }) {
  const { building } = useBuilding();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 w-56 bg-white border-r border-gray-200 flex flex-col
          transform transition-transform duration-200 ease-in-out
          md:static md:translate-x-0 md:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="h-16 flex items-center px-4 border-b border-gray-100 flex-shrink-0">
          <span className="text-lg font-bold text-blue-600">{APP_NAME}</span>
        </div>

        {building && (
          <div className="px-4 py-2 border-b border-gray-100 flex-shrink-0">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Building</p>
            <p className="text-sm font-medium text-gray-800 truncate">{building.name}</p>
          </div>
        )}

        <YearPicker />

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setSidebarOpen(false)}
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

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden text-gray-500 hover:text-gray-700 p-1"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
            {building && (
              <span className="text-sm text-gray-500 hidden sm:block">{building.name}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onNewExpense}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <PlusIcon className="w-4 h-4" />
              <span className="hidden sm:inline">New Expense</span>
              <span className="sm:hidden">+</span>
            </button>
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ── Year picker ───────────────────────────────────────────────────────────────

function YearPicker() {
  const { fiscalYear, fiscalYears, viewingFiscalYearId, setViewingFiscalYearId, building } =
    useBuilding();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!fiscalYear || fiscalYears.length === 0) return null;

  const isViewingActive =
    !viewingFiscalYearId || viewingFiscalYearId === building?.activeFiscalYearId;

  return (
    <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0 relative" ref={ref}>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Fiscal Year</p>
      <button
        onClick={() => fiscalYears.length > 1 && setOpen((o) => !o)}
        className={`w-full flex items-center justify-between text-left rounded-md px-2 py-1 transition-colors ${
          fiscalYears.length > 1 ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
        }`}
      >
        <span className="text-sm font-medium text-gray-800 truncate">{fiscalYear.label}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
          {isViewingActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" title="Active year" />
          )}
          {!isViewingActive && (
            <span className="text-xs text-amber-600 font-medium">history</span>
          )}
          {fiscalYears.length > 1 && (
            <ChevronIcon className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          )}
        </div>
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-full mt-1 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
          {fiscalYears.map((fy) => {
            const isActive = fy.id === building?.activeFiscalYearId;
            const isSelected =
              fy.id === (viewingFiscalYearId ?? building?.activeFiscalYearId);
            return (
              <button
                key={fy.id}
                onClick={() => {
                  setViewingFiscalYearId(fy.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 ${
                  isSelected ? 'text-blue-700 font-medium' : 'text-gray-700'
                }`}
              >
                <span className="truncate">{fy.label}</span>
                <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                  {isActive && (
                    <span className="text-xs text-green-600 font-medium">active</span>
                  )}
                  {isSelected && <CheckIcon className="w-3.5 h-3.5 text-blue-600" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

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
function MenuIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
function ChevronIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
function CheckIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
