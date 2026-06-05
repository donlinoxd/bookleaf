import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import Login from '@/pages/Login';
import AppShell from '@/components/layout/AppShell';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Placeholder pages for Tasks 5-10
const Placeholder = ({ name }: { name: string }) => (
  <div className="p-6"><h1 className="text-2xl font-bold">{name}</h1><p className="text-muted-foreground mt-2">Coming soon</p></div>
);

const router = createHashRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <RequireAuth><AppShell /></RequireAuth>,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Placeholder name="Dashboard" /> },
      { path: 'books', element: <Placeholder name="Books" /> },
      { path: 'members', element: <Placeholder name="Members" /> },
      { path: 'circulation', element: <Placeholder name="Circulation" /> },
      { path: 'settings', element: <Placeholder name="Settings" /> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
