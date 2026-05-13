import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { BuildingProvider } from './contexts/BuildingContext';
import { useBuilding } from './contexts/BuildingContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AppShell from './components/layout/AppShell';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Staff from './pages/Staff';
import Vendors from './pages/Vendors';
import Events from './pages/Events';
import Admin from './pages/Admin';
import ExpenseModal from './components/expense/ExpenseModal';

function AppRoutes() {
  const { building, departments, loadingBuildings } = useBuilding();
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);

  if (loadingBuildings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // No department yet → send to setup wizard
  if (departments.length === 0) {
    return (
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <Routes>
        <Route element={<AppShell onNewExpense={() => setExpenseModalOpen(true)} />}>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="staff" element={<Staff />} />
          <Route path="vendors" element={<Vendors />} />
          <Route path="events" element={<Events />} />
          <Route path="admin/*" element={<Admin />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <ExpenseModal
        isOpen={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        building={building}
      />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <BuildingProvider>
                  <AppRoutes />
                </BuildingProvider>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
