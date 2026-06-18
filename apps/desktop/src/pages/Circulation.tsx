import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@bookleaf/ui/components/button';
import { Input } from '@bookleaf/ui/components/input';
import type { PatronSummary, CheckoutScanResult, ReturnScanResult } from '@bookleaf/types';

type Borrow = { id: number; user_name: string; user_id_number: string; book_title: string; borrowed_at: string; due_date: string };
type CheckoutLine = { key: number; label: string; ok: boolean; blocked?: Extract<CheckoutScanResult, { reason: 'policy' }>; accession: string };
type ReturnLine = { key: number; label: string; ok: boolean };

export default function Circulation() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;
  const role = user?.role;
  const canOverride = role === 'admin' || role === 'librarian';

  const [mode, setMode] = useState<'checkout' | 'return'>('checkout');

  // ── Checkout session state ──
  const [patron, setPatron] = useState<PatronSummary | null>(null);
  const [cardInput, setCardInput] = useState('');
  const [cardError, setCardError] = useState<string | null>(null);
  const [accInput, setAccInput] = useState('');
  const [coLines, setCoLines] = useState<CheckoutLine[]>([]);
  const [overrideKey, setOverrideKey] = useState<number | null>(null);
  const [overrideNote, setOverrideNote] = useState('');
  const accRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLInputElement>(null);

  // ── Return session state ──
  const [retInput, setRetInput] = useState('');
  const [retLines, setRetLines] = useState<ReturnLine[]>([]);
  const retRef = useRef<HTMLInputElement>(null);

  const { data: activeBorrows = [] } = useQuery(trpc.admin.circulation.activeBorrows.queryOptions({ institutionId: iid }));
  const { data: overdueBorrows = [] } = useQuery(trpc.admin.circulation.overdueBorrows.queryOptions({ institutionId: iid }));
  const invalidateTables = () => {
    qc.invalidateQueries({ queryKey: trpc.admin.circulation.activeBorrows.queryKey({ institutionId: iid }) });
    qc.invalidateQueries({ queryKey: trpc.admin.circulation.overdueBorrows.queryKey({ institutionId: iid }) });
  };

  const checkoutMut = useMutation(trpc.admin.circulation.checkoutByAccession.mutationOptions());
  const returnMut = useMutation(trpc.admin.circulation.returnByAccession.mutationOptions());

  let lineKey = 0;
  const nextKey = () => ++lineKey + Date.now();

  // ── Card scan: resolve patron ──
  const onCardScan = async () => {
    const idNumber = cardInput.trim();
    if (!idNumber) return;
    setCardError(null);
    const summary = await qc.fetchQuery(trpc.admin.circulation.resolvePatron.queryOptions({ idNumber }));
    if (!summary) { setCardError(`No patron with card "${idNumber}".`); return; }
    setPatron(summary);
    setCoLines([]);
    setCardInput('');
    setTimeout(() => accRef.current?.focus(), 0);
  };

  // ── Item scan: checkout ──
  const onAccScan = async (accessionRaw: string, override?: { note: string }) => {
    const accession = accessionRaw.trim();
    if (!accession || !patron) return;
    const res = await checkoutMut.mutateAsync({
      userId: patron.userId, accession,
      ...(override ? { override: true, note: override.note } : {}),
    });
    if (res.ok) {
      setCoLines((p) => [{ key: nextKey(), label: `✓ ${res.title} — due ${new Date(res.due_date).toLocaleDateString()}`, ok: true, accession }, ...p]);
    } else if (res.reason === 'policy') {
      const k = nextKey();
      setCoLines((p) => [{ key: k, label: `✗ ${accession}: blocked`, ok: false, blocked: res, accession }, ...p]);
    } else {
      const msg = res.reason === 'unknown' ? 'unknown item' : res.reason === 'ambiguous' ? 'ambiguous accession' : 'unavailable';
      setCoLines((p) => [{ key: nextKey(), label: `✗ ${accession}: ${msg}`, ok: false, accession }, ...p]);
    }
    setAccInput('');
    setOverrideKey(null);
    setOverrideNote('');
    invalidateTables();
    setTimeout(() => accRef.current?.focus(), 0);
  };

  const resetCheckout = () => {
    setPatron(null); setCoLines([]); setAccInput(''); setCardInput(''); setCardError(null);
    setTimeout(() => cardRef.current?.focus(), 0);
  };

  // ── Item scan: return ──
  const onRetScan = async () => {
    const accession = retInput.trim();
    if (!accession) return;
    const res: ReturnScanResult = await returnMut.mutateAsync({ accession });
    if (res.ok) {
      const fine = res.fine_amount > 0 ? ` — fine ₱${res.fine_amount}` : '';
      setRetLines((p) => [{ key: nextKey(), label: `✓ returned: ${res.title} — ${res.patron_name}${fine}`, ok: true }, ...p]);
    } else {
      const msg = res.reason === 'unknown' ? 'unknown item' : res.reason === 'ambiguous' ? 'ambiguous accession' : 'no active loan';
      setRetLines((p) => [{ key: nextKey(), label: `✗ ${accession}: ${msg}`, ok: false }, ...p]);
    }
    setRetInput('');
    invalidateTables();
    setTimeout(() => retRef.current?.focus(), 0);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Circulation</h1>
        <div className="flex gap-1 rounded-md border p-0.5">
          {(['checkout', 'return'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`px-4 py-1.5 text-sm font-medium rounded ${mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {m === 'checkout' ? 'Checkout' : 'Return'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'checkout' ? (
        <div className="space-y-4">
          {!patron ? (
            <div className="rounded-lg border bg-card p-5 space-y-3 shadow-sm max-w-md">
              <p className="text-sm font-medium">Scan patron card</p>
              <div className="flex gap-2">
                <Input ref={cardRef} autoFocus value={cardInput} onChange={(e) => setCardInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onCardScan()} placeholder="Scan or type card ID…" />
                <Button onClick={onCardScan} disabled={!cardInput.trim()}>Find</Button>
              </div>
              {cardError && <p className="text-xs text-destructive">{cardError}</p>}
            </div>
          ) : (
            <>
              <div className="rounded-lg border bg-card p-4 shadow-sm flex items-center justify-between max-w-2xl">
                <div>
                  <p className="font-semibold">{patron.name} <span className="text-muted-foreground font-normal">· {patron.user_type ?? '—'}</span></p>
                  <p className="text-xs text-muted-foreground">{patron.active_loans} active loan(s) · ₱{patron.unpaid_fines} unpaid {patron.is_active ? '' : '· INACTIVE'}</p>
                </div>
                <Button variant="outline" size="sm" onClick={resetCheckout}>Done / Next patron</Button>
              </div>

              {!patron.is_active ? (
                <p className="text-sm text-destructive">This patron is inactive and cannot borrow.</p>
              ) : (
                <div className="rounded-lg border bg-card p-5 space-y-3 shadow-sm max-w-2xl">
                  <p className="text-sm font-medium">Scan item (accession)</p>
                  <div className="flex gap-2">
                    <Input ref={accRef} autoFocus value={accInput} onChange={(e) => setAccInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAccScan(accInput)} placeholder="Scan or type accession…" disabled={checkoutMut.isPending} />
                    <Button onClick={() => onAccScan(accInput)} disabled={checkoutMut.isPending || !accInput.trim()}>Check out</Button>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {coLines.map((l) => (
                      <li key={l.key} className={l.ok ? 'text-green-600' : 'text-destructive'}>
                        {l.label}
                        {l.blocked && (
                          <ul className="list-disc pl-5 text-xs text-muted-foreground mt-0.5">
                            {l.blocked.violations.map((v) => <li key={v.reason_code}>{v.message}</li>)}
                            {canOverride && (
                              <li className="list-none mt-1">
                                {overrideKey === l.key ? (
                                  <div className="flex gap-2">
                                    <Input value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} placeholder="Override reason…" className="h-7 text-xs" />
                                    <Button size="sm" className="h-7 text-xs" disabled={!overrideNote.trim()} onClick={() => onAccScan(l.accession, { note: overrideNote.trim() })}>Override</Button>
                                  </div>
                                ) : (
                                  <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => { setOverrideKey(l.key); setOverrideNote(''); }}>Override…</Button>
                                )}
                              </li>
                            )}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-5 space-y-3 shadow-sm max-w-2xl">
          <p className="text-sm font-medium">Scan item to return (accession)</p>
          <div className="flex gap-2">
            <Input ref={retRef} autoFocus value={retInput} onChange={(e) => setRetInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onRetScan()} placeholder="Scan or type accession…" disabled={returnMut.isPending} />
            <Button onClick={onRetScan} disabled={returnMut.isPending || !retInput.trim()}>Return</Button>
          </div>
          <ul className="space-y-1 text-sm">
            {retLines.map((l) => <li key={l.key} className={l.ok ? 'text-green-600' : 'text-destructive'}>{l.label}</li>)}
          </ul>
        </div>
      )}

      {/* Reference tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
        {([['Active', activeBorrows], ['Overdue', overdueBorrows]] as const).map(([title, rows]) => (
          <div key={title} className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title} ({(rows as Borrow[]).length})</p>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr>{['Book', 'Patron', 'Due'].map((h) => <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {(rows as Borrow[]).length === 0 ? <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">None.</td></tr>
                    : (rows as Borrow[]).map((b) => (
                      <tr key={b.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{b.book_title}</td>
                        <td className="px-3 py-2">{b.user_name}</td>
                        <td className="px-3 py-2">{new Date(b.due_date).toLocaleDateString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
