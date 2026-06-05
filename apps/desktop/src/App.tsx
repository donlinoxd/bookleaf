import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import Login from '@/pages/Login';
import AppShell from '@/components/layout/AppShell';
import Dashboard from '@/pages/Dashboard';
import Books from '@/pages/Books';
import Members from '@/pages/Members';
import Circulation from '@/pages/Circulation';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const router = createHashRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <RequireAuth><AppShell /></RequireAuth>,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'books', element: <Books /> },
      { path: 'members', element: <Members /> },
      { path: 'circulation', element: <Circulation /> },
      { path: 'settings', element: <div className="p-6"><h1 className="text-2xl font-bold">Settings</h1><p className="text-muted-foreground mt-2">Coming in Task 10</p></div> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
