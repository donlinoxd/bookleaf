import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@bookleaf/ui/components/button';
import { Input } from '@bookleaf/ui/components/input';
import { Label } from '@bookleaf/ui/components/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@bookleaf/ui/components/dialog';

const checkoutSchema = z.object({ copyId: z.coerce.number().min(1, 'Required'), userId: z.coerce.number().min(1, 'Required') });
type CheckoutForm = z.infer<typeof checkoutSchema>;
type Borrow = { id: number; user_name: string; user_id_number: string; book_title: string; borrowed_at: string; due_date: string };

export default function Circulation() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;
  const [tab, setTab] = useState<'active' | 'overdue'>('active');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [returnId, setReturnId] = useState<number | null>(null);
  const [payFineId, setPayFineId] = useState<number | null>(null);

  const { data: activeBorrows = [], isLoading: loadingActive } = useQuery(trpc.admin.circulation.activeBorrows.queryOptions({ institutionId: iid }));
  const { data: overdueBorrows = [], isLoading: loadingOverdue } = useQuery(trpc.admin.circulation.overdueBorrows.queryOptions({ institutionId: iid }));

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: trpc.admin.circulation.activeBorrows.queryKey({ institutionId: iid }) });
    qc.invalidateQueries({ queryKey: trpc.admin.circulation.overdueBorrows.queryKey({ institutionId: iid }) });
  };

  const checkoutMutation = useMutation(trpc.admin.circulation.checkout.mutationOptions({ onSuccess: () => { invalidateAll(); setIsCheckoutOpen(false); } }));
  const returnMutation = useMutation(trpc.admin.circulation.return.mutationOptions({ onSuccess: () => { invalidateAll(); setReturnId(null); } }));
  const payFineMutation = useMutation(trpc.admin.circulation.payFine.mutationOptions({ onSuccess: () => { invalidateAll(); setPayFineId(null); } }));

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CheckoutForm>({ resolver: zodResolver(checkoutSchema) });

  const columns: ColumnDef<Borrow>[] = [
    { accessorKey: 'book_title', header: 'Book', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
    { accessorKey: 'user_name', header: 'Patron' },
    { accessorKey: 'user_id_number', header: 'ID' },
    { accessorKey: 'borrowed_at', header: 'Borrowed', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
    { accessorKey: 'due_date', header: 'Due', cell: ({ getValue }) => { const d = new Date(getValue() as string); return <span className={d < new Date() ? 'text-destructive font-medium' : ''}>{d.toLocaleDateString()}</span>; } },
    { id: 'actions', cell: ({ row }) => (
      <div className="flex gap-1">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReturnId(row.original.id)}>Return</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPayFineId(row.original.id)}>Pay Fine</Button>
      </div>
    )},
  ];

  const currentData = (tab === 'active' ? activeBorrows : overdueBorrows) as Borrow[];
  const isLoading = tab === 'active' ? loadingActive : loadingOverdue;
  const table = useReactTable({ data: currentData, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Circulation</h1>
        <Button onClick={() => setIsCheckoutOpen(true)} size="sm">Checkout Book</Button>
      </div>
      <div className="flex gap-1 border-b">
        {(['active', 'overdue'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t === 'active' ? `Active (${(activeBorrows as Borrow[]).length})` : `Overdue (${(overdueBorrows as Borrow[]).length})`}
          </button>
        ))}
      </div>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => <tr key={hg.id}>{hg.headers.map((h) => <th key={h.id} className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}
          </thead>
          <tbody className="divide-y">
            {isLoading ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
              : table.getRowModel().rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No records.</td></tr>
              : table.getRowModel().rows.map((row) => <tr key={row.id} className="hover:bg-muted/30">{row.getVisibleCells().map((cell) => <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
          </tbody>
        </table>
      </div>

      {/* Checkout Dialog */}
      <Dialog open={isCheckoutOpen} onOpenChange={(o) => { if (!o) { setIsCheckoutOpen(false); reset(); } }}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Checkout Book</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => checkoutMutation.mutate({ copyId: d.copyId, userId: d.userId }))} className="space-y-3 py-2">
            <div className="space-y-1"><Label>Copy ID</Label><Input type="number" {...register('copyId')} />{errors.copyId && <p className="text-xs text-destructive">{errors.copyId.message}</p>}</div>
            <div className="space-y-1"><Label>Member ID (numeric)</Label><Input type="number" {...register('userId')} />{errors.userId && <p className="text-xs text-destructive">{errors.userId.message}</p>}</div>
            {checkoutMutation.error && <p className="text-xs text-destructive">{getTRPCErrorMessage(checkoutMutation.error)}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setIsCheckoutOpen(false); reset(); }}>Cancel</Button>
              <Button type="submit" disabled={checkoutMutation.isPending}>{checkoutMutation.isPending ? 'Processing…' : 'Checkout'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={!!returnId} onOpenChange={(o) => !o && setReturnId(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Return Book?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Mark borrowing #{returnId} as returned.</p>
          {returnMutation.error && <p className="text-xs text-destructive">{getTRPCErrorMessage(returnMutation.error)}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnId(null)}>Cancel</Button>
            <Button onClick={() => returnId && returnMutation.mutate({ borrowingId: returnId, condition: 'good' })} disabled={returnMutation.isPending}>{returnMutation.isPending ? 'Processing…' : 'Confirm Return'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay Fine Dialog */}
      <Dialog open={!!payFineId} onOpenChange={(o) => !o && setPayFineId(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Mark Fine as Paid?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Clear outstanding fines for borrowing #{payFineId}.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFineId(null)}>Cancel</Button>
            <Button onClick={() => payFineId && payFineMutation.mutate({ borrowingId: payFineId })} disabled={payFineMutation.isPending}>{payFineMutation.isPending ? 'Processing…' : 'Confirm'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
