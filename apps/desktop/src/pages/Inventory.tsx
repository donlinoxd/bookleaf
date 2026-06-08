import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

// ── Types matching actual server return shapes ────────────────────────────────

type ActiveSession = {
  id: number;
  institution_id: number;
  status: string;
  started_at: string;
  ended_at: string | null;
};

type ScanResult = {
  scanCount: number;
  resource: { id: number; title: string; author: string } | null;
};

type GhostCopy = { isbn: string; title: string; db_available: number; scan_count: number };
type PhantomReturn = { isbn: string; title: string; db_available: number; scan_count: number };
type ExtraCopy = { isbn: string; title: string; total_copies: number; scan_count: number };
type UnknownScan = { isbn: string; scan_count: number };

type FinishResult = {
  total_scanned: number;
  unique_isbns_scanned: number;
  ghost_copies: GhostCopy[];
  phantom_returns: PhantomReturn[];
  extra_copies: ExtraCopy[];
  unknown_scans: UnknownScan[];
};

type ScanEntry = { isbn: string; title: string | null; found: boolean; count: number };

// ── Component ─────────────────────────────────────────────────────────────────

export default function Inventory() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;

  const [isbn, setIsbn] = useState('');
  const [lastScan, setLastScan] = useState<{ isbn: string; title: string | null; found: boolean } | null>(null);
  const [recentScans, setRecentScans] = useState<ScanEntry[]>([]);
  const [reportData, setReportData] = useState<FinishResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: rawSession, isLoading: sessionLoading } = useQuery(
    trpc.admin.inventory.activeSession.queryOptions({ institutionId: iid })
  );
  const activeSession = rawSession as ActiveSession | null | undefined;

  const invalidateSession = () =>
    qc.invalidateQueries({ queryKey: trpc.admin.inventory.activeSession.queryKey({ institutionId: iid }) });

  const startMutation = useMutation(
    trpc.admin.inventory.startSession.mutationOptions({
      onSuccess: () => invalidateSession(),
    })
  );

  const scanMutation = useMutation(
    trpc.admin.inventory.scan.mutationOptions({
      onSuccess: (rawData, variables) => {
        const data = rawData as ScanResult;
        const entry: ScanEntry = {
          isbn: variables.isbn,
          title: data.resource?.title ?? null,
          found: data.resource !== null,
          count: data.scanCount,
        };
        setLastScan({ isbn: variables.isbn, title: data.resource?.title ?? null, found: data.resource !== null });
        setRecentScans((prev) => [entry, ...prev].slice(0, 10));
        setIsbn('');
        setTimeout(() => inputRef.current?.focus(), 0);
      },
    })
  );

  const finishMutation = useMutation(
    trpc.admin.inventory.finishSession.mutationOptions({
      onSuccess: (rawData) => {
        const data = rawData as FinishResult;
        setReportData(data);
        setRecentScans([]);
        setLastScan(null);
        invalidateSession();
      },
    })
  );

  // Auto-focus input when entering active phase
  useEffect(() => {
    if (activeSession && !reportData) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [activeSession, reportData]);

  const handleScan = () => {
    if (!isbn.trim() || !activeSession) return;
    scanMutation.mutate({ sessionId: activeSession.id, isbn: isbn.trim(), institutionId: iid });
  };

  const handleStartNew = () => {
    setReportData(null);
    setRecentScans([]);
    setLastScan(null);
    invalidateSession();
  };

  // Derive phase
  const phase = reportData !== null ? 'finished' : activeSession ? 'active' : 'idle';

  if (sessionLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  /* ── Phase 1: Idle ── */
  if (phase === 'idle') {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="rounded-lg border bg-card p-8 max-w-sm w-full text-center space-y-4 shadow-sm">
          <h2 className="text-xl font-bold">Inventory Audit</h2>
          <p className="text-sm text-muted-foreground">
            Start a new session to scan and verify your physical collection
          </p>
          {startMutation.error && (
            <p className="text-xs text-destructive">{getTRPCErrorMessage(startMutation.error)}</p>
          )}
          <Button
            onClick={() => startMutation.mutate({ institutionId: iid })}
            disabled={startMutation.isPending}
            className="w-full"
          >
            {startMutation.isPending ? 'Starting…' : 'Start New Session'}
          </Button>
        </div>
      </div>
    );
  }

  /* ── Phase 2: Active ── */
  if (phase === 'active' && activeSession) {
    return (
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Inventory Audit</h1>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={finishMutation.isPending}
          >
            {finishMutation.isPending ? 'Finishing…' : 'Finish Session'}
          </Button>
        </div>

        {/* Session info bar */}
        <div className="rounded-md border bg-muted/30 px-4 py-2 flex items-center gap-4 text-sm">
          <span className="font-medium">Session #{activeSession.id}</span>
          <span className="text-muted-foreground">
            Started {new Date(activeSession.started_at).toLocaleString()}
          </span>
        </div>

        {/* Scan input */}
        <div className="rounded-lg border bg-card p-5 space-y-3 shadow-sm">
          <p className="text-sm font-medium">Scan ISBN / Barcode</p>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
              placeholder="Enter or scan ISBN…"
              className="text-base"
              disabled={scanMutation.isPending}
              autoFocus
            />
            <Button onClick={handleScan} disabled={scanMutation.isPending || !isbn.trim()}>
              {scanMutation.isPending ? 'Scanning…' : 'Scan'}
            </Button>
          </div>

          {/* Last scan feedback */}
          {scanMutation.error && (
            <p className="text-xs text-destructive">{getTRPCErrorMessage(scanMutation.error)}</p>
          )}
          {lastScan && !scanMutation.isPending && (
            lastScan.found ? (
              <p className="text-sm text-green-600 font-medium">✓ {lastScan.title}</p>
            ) : (
              <p className="text-sm text-amber-600 font-medium">⚠ Unknown ISBN: {lastScan.isbn}</p>
            )
          )}
        </div>

        {/* Recent scans table */}
        {recentScans.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Recent Scans</p>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {['ISBN', 'Title', 'Scans', 'Status'].map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentScans.map((s, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs">{s.isbn}</td>
                      <td className="px-3 py-2">{s.title ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2">{s.count}</td>
                      <td className="px-3 py-2">
                        {s.found ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Found</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Unknown</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Finish confirmation dialog */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Finish Session?</AlertDialogTitle>
              <AlertDialogDescription>
                This will generate a discrepancy report and close the session. Continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirmOpen(false);
                  finishMutation.mutate({ sessionId: activeSession.id });
                }}
              >
                Finish Session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  /* ── Phase 3: Finished (discrepancy report) ── */
  if (phase === 'finished' && reportData) {
    const theadCells = (headers: string[]) => (
      <thead className="bg-muted/50">
        <tr>
          {headers.map((h) => (
            <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
              {h}
            </th>
          ))}
        </tr>
      </thead>
    );

    const emptyRow = (cols: number) => (
      <tr>
        <td colSpan={cols} className="px-3 py-4 text-center text-muted-foreground text-sm">
          None
        </td>
      </tr>
    );

    const tableWrap = (children: React.ReactNode) => (
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">{children}</table>
      </div>
    );

    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Inventory Report</h1>
          <Button onClick={handleStartNew} size="sm">
            Start New Session
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <div className="rounded-lg border bg-card p-4 shadow-sm text-center">
            <p className="text-3xl font-bold">{reportData.total_scanned}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Scanned</p>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-sm text-center">
            <p className="text-3xl font-bold">{reportData.unique_isbns_scanned}</p>
            <p className="text-xs text-muted-foreground mt-1">Unique ISBNs</p>
          </div>
        </div>

        {/* Ghost Copies */}
        <div className="space-y-2">
          <div>
            <h2 className="font-semibold">Ghost Copies</h2>
            <p className="text-xs text-muted-foreground">In DB as available but not found during scan</p>
          </div>
          {tableWrap(
            <>
              {theadCells(['ISBN', 'Title', 'Available', 'Scanned'])}
              <tbody className="divide-y">
                {reportData.ghost_copies.length === 0
                  ? emptyRow(4)
                  : reportData.ghost_copies.map((r) => (
                      <tr key={r.isbn} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs">{r.isbn}</td>
                        <td className="px-3 py-2">{r.title}</td>
                        <td className="px-3 py-2">{r.db_available}</td>
                        <td className="px-3 py-2">{r.scan_count}</td>
                      </tr>
                    ))}
              </tbody>
            </>
          )}
        </div>

        {/* Phantom Returns */}
        <div className="space-y-2">
          <div>
            <h2 className="font-semibold">Phantom Returns</h2>
            <p className="text-xs text-muted-foreground">Scanned more than copies currently borrowed</p>
          </div>
          {tableWrap(
            <>
              {theadCells(['ISBN', 'Title', 'Available (DB)', 'Scanned'])}
              <tbody className="divide-y">
                {reportData.phantom_returns.length === 0
                  ? emptyRow(4)
                  : reportData.phantom_returns.map((r) => (
                      <tr key={r.isbn} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs">{r.isbn}</td>
                        <td className="px-3 py-2">{r.title}</td>
                        <td className="px-3 py-2">{r.db_available}</td>
                        <td className="px-3 py-2">{r.scan_count}</td>
                      </tr>
                    ))}
              </tbody>
            </>
          )}
        </div>

        {/* Extra Copies */}
        <div className="space-y-2">
          <div>
            <h2 className="font-semibold">Extra Copies</h2>
            <p className="text-xs text-muted-foreground">Scanned more than total copies in DB</p>
          </div>
          {tableWrap(
            <>
              {theadCells(['ISBN', 'Title', 'Total', 'Scanned'])}
              <tbody className="divide-y">
                {reportData.extra_copies.length === 0
                  ? emptyRow(4)
                  : reportData.extra_copies.map((r) => (
                      <tr key={r.isbn} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs">{r.isbn}</td>
                        <td className="px-3 py-2">{r.title}</td>
                        <td className="px-3 py-2">{r.total_copies}</td>
                        <td className="px-3 py-2">{r.scan_count}</td>
                      </tr>
                    ))}
              </tbody>
            </>
          )}
        </div>

        {/* Unknown Scans */}
        <div className="space-y-2">
          <div>
            <h2 className="font-semibold">Unknown Scans</h2>
            <p className="text-xs text-muted-foreground">Scanned ISBNs not found in catalog</p>
          </div>
          {tableWrap(
            <>
              {theadCells(['ISBN', 'Scanned'])}
              <tbody className="divide-y">
                {reportData.unknown_scans.length === 0
                  ? emptyRow(2)
                  : reportData.unknown_scans.map((r) => (
                      <tr key={r.isbn} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs">{r.isbn}</td>
                        <td className="px-3 py-2">{r.scan_count}</td>
                      </tr>
                    ))}
              </tbody>
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}
