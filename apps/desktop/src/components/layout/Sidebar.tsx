import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Users, ArrowLeftRight, Settings, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTRPC } from '@/lib/trpc';
import { useMutation } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/books', icon: BookOpen, label: 'Books' },
  { to: '/members', icon: Users, label: 'Members' },
  { to: '/circulation', icon: ArrowLeftRight, label: 'Circulation' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const { user, token, clearSession } = useAuthStore();
  const navigate = useNavigate();
  const trpc = useTRPC();

  const logoutMutation = useMutation(
    trpc.auth.logout.mutationOptions({
      onSettled: () => {
        clearSession();
        navigate('/login', { replace: true });
      },
    }),
  );

  const handleLogout = () => {
    if (token) logoutMutation.mutate();
    else { clearSession(); navigate('/login', { replace: true }); }
  };

  return (
    <aside className="w-56 h-screen flex flex-col bg-card border-r border-border shrink-0">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">B</span>
          </div>
          <span className="font-bold text-foreground">Bookleaf</span>
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user?.name ?? 'Librarian'}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.role ?? ''}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
