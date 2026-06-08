import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useReactTable, getCoreRowModel, getFilteredRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@bookleaf/ui/components/button';
import { Input } from '@bookleaf/ui/components/input';
import { Label } from '@bookleaf/ui/components/label';
import { Badge } from '@bookleaf/ui/components/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@bookleaf/ui/components/dialog';
import { Plus, Pencil, ToggleLeft, ToggleRight, KeyRound, Search } from 'lucide-react';

const memberSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  id_number: z.string().min(1, 'ID is required'),
  role: z.string().default('member'),
  pin: z.string().min(4, 'PIN must be at least 4 digits'),
  department: z.string().optional(),
  user_type: z.string().optional(),
});
type MemberForm = z.infer<typeof memberSchema>;
type Member = { id: number; name: string; id_number: string; role: string; is_active: boolean; department: string | null; user_type: string | null };

export default function Members() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;
  const [search, setSearch] = useState('');
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [resetPinId, setResetPinId] = useState<number | null>(null);
  const [newPin, setNewPin] = useState('');

  const { data: members = [], isLoading } = useQuery(trpc.admin.members.list.queryOptions({ institutionId: iid, q: search }));
  const invalidate = () => qc.invalidateQueries({ queryKey: trpc.admin.members.list.queryKey({ institutionId: iid }) });

  const createMutation = useMutation(trpc.admin.members.create.mutationOptions({ onSuccess: () => { invalidate(); setIsAddOpen(false); } }));
  const updateMutation = useMutation(trpc.admin.members.update.mutationOptions({ onSuccess: () => { invalidate(); setEditMember(null); } }));
  const toggleMutation = useMutation(trpc.admin.members.setActive.mutationOptions({ onSuccess: () => invalidate() }));
  const resetPinMutation = useMutation(trpc.admin.members.resetPin.mutationOptions({ onSuccess: () => { setResetPinId(null); setNewPin(''); } }));

  const columns: ColumnDef<Member>[] = [
    { accessorKey: 'name', header: 'Name', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
    { accessorKey: 'id_number', header: 'ID' },
    { accessorKey: 'role', header: 'Role', cell: ({ getValue }) => <Badge variant="outline" className="capitalize">{getValue() as string}</Badge> },
    { accessorKey: 'department', header: 'Dept', cell: ({ getValue }) => (getValue() as string) || '—' },
    { accessorKey: 'is_active', header: 'Status', cell: ({ getValue }) => <Badge variant={getValue() ? 'default' : 'secondary'}>{getValue() ? 'Active' : 'Inactive'}</Badge> },
    { id: 'actions', cell: ({ row }) => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditMember(row.original)} title="Edit"><Pencil size={13} /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleMutation.mutate({ id: row.original.id, isActive: !row.original.is_active })} title={row.original.is_active ? 'Deactivate' : 'Activate'}>{row.original.is_active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}</Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setResetPinId(row.original.id)} title="Reset PIN"><KeyRound size={13} /></Button>
      </div>
    )},
  ];

  const table = useReactTable({ data: members as Member[], columns, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel() });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Members</h1><p className="text-muted-foreground text-sm mt-1">{(members as Member[]).length} members</p></div>
        <Button onClick={() => setIsAddOpen(true)} size="sm"><Plus size={15} className="mr-1.5" />Add Member</Button>
      </div>
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search members…" className="pl-8 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => <tr key={hg.id}>{hg.headers.map((h) => <th key={h.id} className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}
          </thead>
          <tbody className="divide-y">
            {isLoading ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
              : table.getRowModel().rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No members found.</td></tr>
              : table.getRowModel().rows.map((row) => <tr key={row.id} className="hover:bg-muted/30">{row.getVisibleCells().map((cell) => <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Dialog */}
      <MemberDialog open={isAddOpen || !!editMember} onClose={() => { setIsAddOpen(false); setEditMember(null); }} isEdit={!!editMember}
        defaultValues={editMember ? { name: editMember.name, id_number: editMember.id_number, role: editMember.role, pin: '', department: editMember.department ?? '', user_type: editMember.user_type ?? '' } : undefined}
        onSubmit={(data) => editMember ? updateMutation.mutate({ id: editMember.id, data }) : createMutation.mutate({ data: { ...data, institution_id: iid } })}
        isPending={createMutation.isPending || updateMutation.isPending} error={createMutation.error || updateMutation.error} />

      {/* Reset PIN Dialog */}
      <Dialog open={!!resetPinId} onOpenChange={(o) => !o && setResetPinId(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Reset PIN</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2"><Label>New PIN (min 4 digits)</Label><Input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPinId(null)}>Cancel</Button>
            <Button onClick={() => resetPinId && resetPinMutation.mutate({ id: resetPinId, newPin })} disabled={newPin.length < 4 || resetPinMutation.isPending}>{resetPinMutation.isPending ? 'Saving…' : 'Reset'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MemberDialog({ open, onClose, isEdit, defaultValues, onSubmit, isPending, error }: { open: boolean; onClose: () => void; isEdit: boolean; defaultValues?: Partial<MemberForm>; onSubmit: (d: MemberForm) => void; isPending: boolean; error: unknown }) {
  const schema = isEdit ? memberSchema.omit({ pin: true }) : memberSchema;
  const { register, handleSubmit, reset, formState: { errors } } = useForm<MemberForm>({ resolver: zodResolver(schema as any), defaultValues: defaultValues ?? { role: 'member' } });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Member' : 'Add Member'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1"><Label>Name *</Label><Input {...register('name')} />{errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}</div>
            <div className="space-y-1"><Label>Library ID *</Label><Input {...register('id_number')} />{errors.id_number && <p className="text-xs text-destructive">{errors.id_number.message}</p>}</div>
            {!isEdit && <div className="space-y-1"><Label>PIN *</Label><Input type="password" {...register('pin')} />{errors.pin && <p className="text-xs text-destructive">{errors.pin.message}</p>}</div>}
            <div className="space-y-1"><Label>Role</Label><Input {...register('role')} /></div>
            <div className="space-y-1"><Label>Department</Label><Input {...register('department')} /></div>
          </div>
          {error && <p className="text-xs text-destructive">{getTRPCErrorMessage(error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); reset(); }}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
