import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@bookleaf/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@bookleaf/ui/components/dialog';
import { useState } from 'react';

type Reservation = {
  id: number;
  book_title: string;
  user_name: string;
  user_id_number: string;
  reserved_at: string;
};

export default function Reservations() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;
  const [cancelId, setCancelId] = useState<number | null>(null);

  const { data: reservations = [], isLoading } = useQuery(
    trpc.admin.circulation.pendingReservations.queryOptions({ institutionId: iid })
  );

  const cancelMutation = useMutation(
    trpc.admin.circulation.cancelReservation.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.admin.circulation.pendingReservations.queryKey({ institutionId: iid }) });
        setCancelId(null);
      },
    })
  );

  const columns: ColumnDef<Reservation>[] = [
    { accessorKey: 'book_title', header: 'Book Title', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
    { accessorKey: 'user_name', header: 'Member' },
    { accessorKey: 'user_id_number', header: 'ID Number' },
    { accessorKey: 'reserved_at', header: 'Reserved At', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="destructive"
          className="h-7 text-xs"
          onClick={() => setCancelId(row.original.id)}
        >
          Cancel
        </Button>
      ),
    },
  ];

  const table = useReactTable({ data: reservations as Reservation[], columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Pending Reservations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading ? 'Loading…' : `${(reservations as Reservation[]).length} pending reservation${(reservations as Reservation[]).length === 1 ? '' : 's'}`}
        </p>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No pending reservations</td></tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Cancel Reservation?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">This will cancel reservation #{cancelId}. The patron will need to reserve again if they still want the book.</p>
          {cancelMutation.error && <p className="text-xs text-destructive">{getTRPCErrorMessage(cancelMutation.error)}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelId(null)}>Keep</Button>
            <Button
              variant="destructive"
              onClick={() => cancelId && cancelMutation.mutate({ reservationId: cancelId })}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? 'Cancelling…' : 'Cancel Reservation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
