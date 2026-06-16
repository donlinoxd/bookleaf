import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@bookleaf/ui/components/button';
import { Input } from '@bookleaf/ui/components/input';
import { Label } from '@bookleaf/ui/components/label';
import { Badge } from '@bookleaf/ui/components/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@bookleaf/ui/components/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@bookleaf/ui/components/alert-dialog';
import { Plus, Pencil, Trash2, Merge, Search } from 'lucide-react';

const TABS = [
  { key: 'name', label: 'Names', types: ['personal', 'corporate', 'geographic'] as const, createType: 'personal' as const },
  { key: 'subject', label: 'Subjects', types: ['subject'] as const, createType: 'subject' as const },
  { key: 'publisher', label: 'Publishers', types: ['publisher'] as const, createType: 'publisher' as const },
];

type Authority = { id: number; name: string; name_type: string; variants: string[] | null; usage_count: number };

export default function Authorities() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;
  const [tab, setTab] = useState(TABS[0]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Authority | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [mergeIds, setMergeIds] = useState<number[]>([]);

  const typeArg = tab.key === 'name' ? undefined : tab.createType;
  const { data: allRows = [] } = useQuery(trpc.admin.authorities.list.queryOptions({ institutionId: iid, type: typeArg, q: search }));
  const rows = (allRows as Authority[]).filter(r => (tab.types as readonly string[]).includes(r.name_type));

  const invalidate = () => qc.invalidateQueries({ queryKey: trpc.admin.authorities.list.queryKey() });
  const createMut = useMutation(trpc.admin.authorities.create.mutationOptions({ onSuccess: () => { invalidate(); setIsAddOpen(false); } }));
  const updateMut = useMutation(trpc.admin.authorities.update.mutationOptions({ onSuccess: () => { invalidate(); setEditing(null); } }));
  const deleteMut = useMutation(trpc.admin.authorities.delete.mutationOptions({ onSuccess: () => { invalidate(); setDeleteId(null); } }));
  const mergeMut = useMutation(trpc.admin.authorities.merge.mutationOptions({ onSuccess: () => { invalidate(); setMergeIds([]); } }));

  function toggleMerge(id: number) {
    setMergeIds((cur) => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }
  function doMerge() {
    if (mergeIds.length < 2) return;
    const [survivorId, ...loserIds] = mergeIds;
    mergeMut.mutate({ survivorId, loserIds });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Authorities</h1><p className="text-muted-foreground text-sm mt-1">Controlled names, subjects & publishers</p></div>
        <div className="flex gap-2">
          {mergeIds.length >= 2 && (
            <Button variant="outline" size="sm" onClick={doMerge} disabled={mergeMut.isPending}>
              <Merge size={15} className="mr-1.5" />Merge {mergeIds.length} (keep first)
            </Button>
          )}
          <Button onClick={() => setIsAddOpen(true)} size="sm"><Plus size={15} className="mr-1.5" />Add</Button>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t); setMergeIds([]); }}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab.key === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search…" className="pl-8 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Name</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Type</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Variants</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Used</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No authorities.</td></tr>
              : rows.map(r => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-3 py-2"><input type="checkbox" checked={mergeIds.includes(r.id)} onChange={() => toggleMerge(r.id)} /></td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2"><Badge variant="secondary">{r.name_type}</Badge></td>
                <td className="px-3 py-2 text-muted-foreground">{(r.variants ?? []).join('; ') || '—'}</td>
                <td className="px-3 py-2">{r.usage_count}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(r)}><Pencil size={13} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 size={13} /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AuthorityDialog
        open={isAddOpen || !!editing}
        onClose={() => { setIsAddOpen(false); setEditing(null); }}
        editing={editing}
        defaultType={tab.createType}
        onSubmit={(d) => {
          type NameType = 'personal' | 'corporate' | 'geographic' | 'subject' | 'publisher';
          const nameType = d.type as unknown as NameType;
          if (editing)
            updateMut.mutate({ id: editing.id, data: { name: d.name, type: nameType, variants: splitVariants(d.variants) } });
          else
            createMut.mutate({ institutionId: iid, name: d.name, type: nameType, variants: splitVariants(d.variants) });
        }}
        isPending={createMut.isPending || updateMut.isPending}
        error={createMut.error || updateMut.error}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete authority?</AlertDialogTitle>
            <AlertDialogDescription>In-use authorities cannot be deleted — merge or unlink them first.{deleteMut.error ? ` ${getTRPCErrorMessage(deleteMut.error)}` : ''}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteId && deleteMut.mutate({ id: deleteId })}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function splitVariants(raw: string | undefined): string[] {
  return (raw ?? '').split(';').map(s => s.trim()).filter(Boolean);
}

function AuthorityDialog({ open, onClose, editing, defaultType, onSubmit, isPending, error }: {
  open: boolean; onClose: () => void; editing: Authority | null;
  defaultType: 'personal' | 'subject' | 'publisher';
  onSubmit: (d: { name: string; type: string; variants: string }) => void;
  isPending: boolean; error: unknown;
}) {
  const { register, handleSubmit, reset } = useForm<{ name: string; type: string; variants: string }>();
  const isName = (editing ? ['personal', 'corporate', 'geographic'].includes(editing.name_type) : defaultType === 'personal');
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? 'Edit Authority' : 'Add Authority'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => onSubmit({ name: d.name, type: d.type, variants: d.variants }))} className="space-y-3 py-2">
          <div className="space-y-1"><Label>Preferred name *</Label>
            <Input defaultValue={editing?.name ?? ''} {...register('name', { required: true })} /></div>
          <div className="space-y-1"><Label>Type</Label>
            <select defaultValue={editing?.name_type ?? defaultType} {...register('type')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {isName
                ? <><option value="personal">personal</option><option value="corporate">corporate</option><option value="geographic">geographic</option></>
                : <option value={defaultType}>{defaultType}</option>}
            </select></div>
          <div className="space-y-1"><Label>Variants / "use for" (semicolon-separated)</Label>
            <Input defaultValue={(editing?.variants ?? []).join('; ')} {...register('variants')} placeholder="Clemens, Samuel; Mark Twain" /></div>
          {error ? <p className="text-xs text-destructive">{getTRPCErrorMessage(error)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); reset(); }}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
