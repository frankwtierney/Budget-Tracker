import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSystem } from '../../contexts/SystemContext';
import { logout } from '../../lib/auth';

export default function UserMenu() {
  const { user } = useAuth();
  const { isSuperAdmin } = useSystem();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? '??';
  const avatarRing = isSuperAdmin
    ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-white'
    : '';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
        title={isSuperAdmin ? 'Signed in as Super Admin' : undefined}
      >
        <span
          className={`w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-semibold ${avatarRing}`}
        >
          {initials}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            {isSuperAdmin && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Super Admin
              </p>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
