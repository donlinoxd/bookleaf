import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, LogOut, ChevronDown, BookOpen, Users, Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTRPC } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { useQuery, useMutation } from '@tanstack/react-query';
import { cn } from '@bookleaf/ui/lib/utils';

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/books': 'Books',
  '/members': 'Members',
  '/circulation': 'Circulation',
  '/settings': 'Settings',
  '/reservations': 'Reservations',
  '/reports':      'Reports',
  '/gate':         'Gate',
  '/inventory':    'Inventory',
};

function useServerStatus() {
  const [status, setStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch('http://localhost:3000/ping', { signal: AbortSignal.timeout(3000) });
        if (!cancelled) setStatus(res.ok ? 'online' : 'offline');
      } catch {
        if (!cancelled) setStatus('offline');
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  return status;
}

function useInstitutionName() {
  const [name, setName] = useState('');
  useEffect(() => {
    fetch('http://localhost:3000/info')
      .then(r => r.json())
      .then(d => setName(d.institutionName ?? ''))
      .catch(() => {});
  }, []);
  return name;
}

function useIsMaximized() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const win = getCurrentWindow();
    win.isMaximized().then(setMaximized).catch(() => {});
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setMaximized).catch(() => {});
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);
  return maximized;
}

export default function TitleBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const pageTitle = ROUTE_TITLES[location.pathname] ?? '';
  const institutionName = useInstitutionName();
  const serverStatus = useServerStatus();
  const isMaximized = useIsMaximized();
  const trpc = useTRPC();
  const { user, token, clearSession } = useAuthStore();
  const institutionId = user?.institution_id ?? 0;

  // ── Window controls ───────────────────────────────────────────────────────
  const win = getCurrentWindow();
  const handleMinimize = () => win.minimize();
  const handleMaximize = () => win.toggleMaximize();
  const handleClose    = () => win.close();

  // ── Search ────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  const searchEnabled = debouncedQuery.length >= 2 && !!institutionId;

  const { data: bookResults } = useQuery({
    ...trpc.admin.books.list.queryOptions({ institutionId, q: debouncedQuery }),
    enabled: searchEnabled,
  });

  const { data: memberResults } = useQuery({
    ...trpc.admin.members.list.queryOptions({ institutionId, q: debouncedQuery }),
    enabled: searchEnabled,
  });

  const hasResults = (bookResults?.length ?? 0) + (memberResults?.length ?? 0) > 0;

  // ── Notifications ─────────────────────────────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const { data: overdue } = useQuery({
    ...trpc.admin.circulation.overdueBorrows.queryOptions({ institutionId }),
    enabled: !!institutionId,
    refetchInterval: 60_000,
  });

  const { data: reservations } = useQuery({
    ...trpc.admin.circulation.pendingReservations.queryOptions({ institutionId }),
    enabled: !!institutionId,
    refetchInterval: 60_000,
  });

  const notifCount = (overdue?.length ?? 0) + (reservations?.length ?? 0);

  // ── User menu ─────────────────────────────────────────────────────────────
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  const logoutMutation = useMutation(
    trpc.auth.logout.mutationOptions({
      onSettled: () => { clearSession(); navigate('/login', { replace: true }); },
    }),
  );

  const handleLogout = () => {
    setUserOpen(false);
    if (token) logoutMutation.mutate();
    else { clearSession(); navigate('/login', { replace: true }); }
  };

  // ── Close dropdowns on outside click ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header
      data-tauri-drag-region
      className="h-10 bg-card border-b border-border flex items-center shrink-0 select-none z-50"
    >
      {/* Brand (left — synced with sidebar width) */}
      <div
        data-tauri-drag-region
        className="w-56 flex items-center gap-2 px-4 shrink-0 h-full"
      >
        <div className="w-5 h-5 bg-primary rounded flex items-center justify-center shrink-0">
          <span className="text-primary-foreground font-bold text-[10px]">B</span>
        </div>
        <span className="font-semibold text-foreground text-sm">Bookleaf</span>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-border shrink-0" />

      {/* Institution › Page title */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-1.5 px-3 min-w-0 shrink-0 h-full"
      >
        {institutionName && (
          <>
            <span className="text-xs text-muted-foreground truncate max-w-[160px]">{institutionName}</span>
            <span className="text-muted-foreground/50 text-xs">›</span>
          </>
        )}
        <span className="text-xs font-semibold text-foreground whitespace-nowrap">{pageTitle}</span>
      </div>

      {/* Spacer (drag region) */}
      <div data-tauri-drag-region className="flex-1 h-full" />

      {/* Search */}
      <div ref={searchRef} className="relative w-52 mr-2">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search…"
          value={query}
          onChange={e => { setQuery(e.target.value); setSearchOpen(true); }}
          onFocus={() => query.length >= 2 && setSearchOpen(true)}
          className="w-full h-7 pl-7 pr-2.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
        />

        {searchOpen && searchEnabled && (
          <div className="absolute top-full mt-1 right-0 w-72 bg-card border border-border rounded-lg shadow-xl overflow-hidden max-h-72 overflow-y-auto z-50">
            {bookResults && bookResults.length > 0 && (
              <section>
                <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40 flex items-center gap-1.5">
                  <BookOpen size={9} /> Books
                </p>
                {(bookResults as any[]).slice(0, 5).map(book => (
                  <button
                    key={book.id}
                    onClick={() => { setSearchOpen(false); setQuery(''); navigate('/books'); }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors flex flex-col gap-0.5"
                  >
                    <span className="font-medium truncate">{book.title}</span>
                    <span className="text-muted-foreground truncate">{book.author}</span>
                  </button>
                ))}
              </section>
            )}

            {memberResults && memberResults.length > 0 && (
              <section className={bookResults && bookResults.length > 0 ? 'border-t border-border' : ''}>
                <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40 flex items-center gap-1.5">
                  <Users size={9} /> Members
                </p>
                {(memberResults as any[]).slice(0, 5).map(member => (
                  <button
                    key={member.id}
                    onClick={() => { setSearchOpen(false); setQuery(''); navigate('/members'); }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors flex flex-col gap-0.5"
                  >
                    <span className="font-medium truncate">{member.name}</span>
                    <span className="text-muted-foreground truncate">{member.id_number} · {member.user_type}</span>
                  </button>
                ))}
              </section>
            )}

            {!hasResults && (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                No results for &ldquo;{debouncedQuery}&rdquo;
              </p>
            )}
          </div>
        )}
      </div>

      {/* Server status */}
      <div className={cn(
        'flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium mr-1.5 select-none',
        serverStatus === 'online'  ? 'bg-green-50 text-green-700'  :
        serverStatus === 'offline' ? 'bg-red-50 text-red-600'      :
        'bg-muted text-muted-foreground',
      )}>
        <span className={cn(
          'w-1.5 h-1.5 rounded-full',
          serverStatus === 'online'  ? 'bg-green-500 animate-pulse' :
          serverStatus === 'offline' ? 'bg-red-500'                 :
          'bg-muted-foreground',
        )} />
        {serverStatus === 'online' ? 'Online' : serverStatus === 'offline' ? 'Offline' : '…'}
      </div>

      {/* Notification bell */}
      <div ref={notifRef} className="relative mr-0.5">
        <button
          onClick={() => setNotifOpen(o => !o)}
          className="relative p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Notifications"
        >
          <Bell size={14} />
          {notifCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
              {notifCount > 9 ? '9+' : notifCount}
            </span>
          )}
        </button>

        {notifOpen && (
          <div className="absolute right-0 top-full mt-1 w-72 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-50">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <p className="text-xs font-semibold">Notifications</p>
              {notifCount > 0 && <span className="text-[11px] text-muted-foreground">{notifCount} alert{notifCount !== 1 ? 's' : ''}</span>}
            </div>
            <div className="max-h-60 overflow-y-auto">
              {overdue && overdue.length > 0 && (
                <section>
                  <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40">
                    Overdue ({overdue.length})
                  </p>
                  {(overdue as any[]).slice(0, 5).map(b => (
                    <button key={b.id} onClick={() => { setNotifOpen(false); navigate('/circulation'); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors">
                      <span className="font-medium truncate block">{b.book_title}</span>
                      <span className="text-destructive">{b.user_name} · Due {b.due_date ? new Date(b.due_date).toLocaleDateString() : '—'}</span>
                    </button>
                  ))}
                </section>
              )}
              {reservations && reservations.length > 0 && (
                <section className={(overdue?.length ?? 0) > 0 ? 'border-t border-border' : ''}>
                  <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40">
                    Pending Reservations ({reservations.length})
                  </p>
                  {(reservations as any[]).slice(0, 5).map(r => (
                    <button key={r.id} onClick={() => { setNotifOpen(false); navigate('/circulation'); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors">
                      <span className="font-medium truncate block">{r.book_title}</span>
                      <span className="text-muted-foreground">Reserved by {r.user_name}</span>
                    </button>
                  ))}
                </section>
              )}
              {notifCount === 0 && (
                <p className="px-3 py-5 text-xs text-muted-foreground text-center">All clear — no alerts</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* User dropdown */}
      <div ref={userRef} className="relative mr-1">
        <button
          onClick={() => setUserOpen(o => !o)}
          className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded hover:bg-accent transition-colors"
        >
          <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center shrink-0">
            <span className="text-primary-foreground text-[9px] font-bold">
              {user?.name?.[0]?.toUpperCase() ?? 'L'}
            </span>
          </div>
          <span className="text-xs font-medium text-foreground hidden sm:block">{user?.name ?? 'Librarian'}</span>
          <ChevronDown size={10} className="text-muted-foreground" />
        </button>

        {userOpen && (
          <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-50">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-xs font-medium truncate">{user?.name}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut size={12} />
              Sign out
            </button>
          </div>
        )}
      </div>

      {/* Window controls */}
      <div className="flex h-full shrink-0 ml-1">
        <button
          onClick={handleMinimize}
          className="w-10 h-full flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Minimize"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={handleMaximize}
          className="w-10 h-full flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          <Square size={11} strokeWidth={1.5} />
        </button>
        <button
          onClick={handleClose}
          className="w-10 h-full flex items-center justify-center text-muted-foreground hover:bg-destructive hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={13} />
        </button>
      </div>
    </header>
  );
}
