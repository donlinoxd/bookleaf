import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import Login from '@/pages/Login';
import AppShell from '@/components/layout/AppShell';
import Dashboard from '@/pages/Dashboard';
import Books from '@/pages/Books';
import Members from '@/pages/Members';
import Circulation from '@/pages/Circulation';
import Settings from '@/pages/Settings';
import Setup from '@/pages/Setup';
import Reservations from '@/pages/Reservations';
import Reports      from '@/pages/Reports';
import Gate         from '@/pages/Gate';
import Inventory    from '@/pages/Inventory';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const router = createHashRouter([
  { path: '/login', element: <Login /> },
  { path: '/setup', element: <Setup /> },
  {
    path: '/',
    element: <RequireAuth><AppShell /></RequireAuth>,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'books', element: <Books /> },
      { path: 'members', element: <Members /> },
      { path: 'circulation', element: <Circulation /> },
      { path: 'settings',      element: <Settings /> },
      { path: 'reservations',  element: <Reservations /> },
      { path: 'reports',       element: <Reports /> },
      { path: 'gate',          element: <Gate /> },
      { path: 'inventory',     element: <Inventory /> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
