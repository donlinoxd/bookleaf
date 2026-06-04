import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Placeholder pages — will be replaced in subsequent tasks
const LoginPage = () => (
  <div className="min-h-screen flex items-center justify-center">
    <p className="text-muted-foreground">Login coming in Task 3</p>
  </div>
);

const DashboardPage = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold">Dashboard</h1>
    <p className="text-muted-foreground mt-2">App shell and pages coming in Tasks 4–10</p>
  </div>
);

const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <RequireAuth><DashboardPage /></RequireAuth>,
    children: [],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
