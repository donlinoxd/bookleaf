import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable, getCoreRowModel, getFilteredRowModel,
  flexRender, type ColumnDef,
} from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@bookleaf/ui/components/button';
import { Input } from '@bookleaf/ui/components/input';
import { Label } from '@bookleaf/ui/components/label';
import { Badge } from '@bookleaf/ui/components/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@bookleaf/ui/components/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@bookleaf/ui/components/alert-dialog';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { AuthorityPicker, AuthorityMultiPicker } from '@/components/AuthorityCombobox';
import { fieldsFor, type FieldDescriptor } from '@/lib/materialFields';
import { buildMaterialSchema } from '@/lib/materialFormSchema';
type Book = { id: number; title: string; author: string | null; genre: string | null; year?: number | null; material_type: string; available_copies: number; total_copies: number; author_authority_id?: number | null; publisher?: string | null; publisher_authority_id?: number | null; subject_headings?: string[] | null; isbn?: string | null; issn?: string | null; subtitle?: string | null; edition?: string | null; volume?: string | null; issue_number?: string | null; series_title?: string | null; doi?: string | null; url?: string | null; language?: string | null; call_number?: string | null; call_number_type?: string | null; description?: string | null; frequency?: string | null; container_title?: string | null; pages?: string | null; thesis_degree?: string | null; thesis_institution?: string | null; thesis_advisor?: string | null };

export default function Books() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;
  const [search, setSearch] = useState('');
  const [editBook, setEditBook] = useState<Book | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data: books = [], isLoading } = useQuery(trpc.admin.books.list.queryOptions({ institutionId: iid, q: search }));
  const invalidate = () => qc.invalidateQueries({ queryKey: trpc.admin.books.list.queryKey({ institutionId: iid }) });

  const createMutation = useMutation(trpc.admin.books.create.mutationOptions({ onSuccess: () => { invalidate(); setIsAddOpen(false); } }));
  const updateMutation = useMutation(trpc.admin.books.update.mutationOptions({ onSuccess: () => { invalidate(); setEditBook(null); } }));
  const deleteMutation = useMutation(trpc.admin.books.delete.mutationOptions({ onSuccess: () => { invalidate(); setDeleteId(null); } }));

  const fetchMarcExport = () =>
    qc.fetchQuery(trpc.admin.books.marcExport.queryOptions({ institutionId: iid, q: search }));

  const exportMarc = async () => {
    const res = await fetchMarcExport();
    const blob = new Blob([res.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'bookleaf-export.xml';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnDef<Book>[] = [
    { accessorKey: 'title', header: 'Title', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
    { accessorKey: 'author', header: 'Author', cell: ({ getValue }) => (getValue() as string) || '—' },
    { accessorKey: 'genre', header: 'Genre', cell: ({ getValue }) => (getValue() as string) || '—' },
    { accessorKey: 'year', header: 'Year', cell: ({ getValue }) => (getValue() as number) || '—' },
    { accessorKey: 'available_copies', header: 'Copies', cell: ({ row }) => <Badge variant={row.original.available_copies > 0 ? 'default' : 'destructive'}>{row.original.available_copies}/{row.original.total_copies}</Badge> },
    { id: 'actions', cell: ({ row }) => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditBook(row.original)}><Pencil size={13} /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(row.original.id)}><Trash2 size={13} /></Button>
      </div>
    )},
  ];

  const table = useReactTable({ data: books as Book[], columns, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel() });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Books</h1><p className="text-muted-foreground text-sm mt-1">{(books as Book[]).length} items</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/books/import')}>Import from file</Button>
          <Button variant="outline" size="sm" onClick={() => void exportMarc()}>Export MARCXML</Button>
          <Button onClick={() => setIsAddOpen(true)} size="sm"><Plus size={15} className="mr-1.5" />Add Book</Button>
        </div>
      </div>
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search books…" className="pl-8 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>{hg.headers.map((h) => <th key={h.id} className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>
            ))}
          </thead>
          <tbody className="divide-y">
            {isLoading ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
              : table.getRowModel().rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No books found.</td></tr>
              : table.getRowModel().rows.map((row) => <tr key={row.id} className="hover:bg-muted/30">{row.getVisibleCells().map((cell) => <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <BookDialog open={isAddOpen || !!editBook} onClose={() => { setIsAddOpen(false); setEditBook(null); }} editing={editBook}
        defaultValues={editBook ? ({ ...editBook, total_copies: editBook.total_copies ?? 1 } as Record<string, unknown>) : undefined}
        onSubmit={(data) => editBook ? updateMutation.mutate({ id: editBook.id, data }) : createMutation.mutate({ institutionId: iid, data, copies: [] })}
        isPending={createMutation.isPending || updateMutation.isPending} error={createMutation.error || updateMutation.error} title={editBook ? 'Edit Book' : 'Add Book'} />
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Book?</AlertDialogTitle><AlertDialogDescription>This will permanently remove the book and all copies.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const MATERIAL_TYPES = ['BOOK', 'SERIAL', 'ARTICLE', 'AUDIOVISUAL', 'MAP', 'MANUSCRIPT', 'DIGITAL', 'THESIS', 'OTHER'] as const;

function BookDialog({ open, onClose, editing, defaultValues, onSubmit, isPending, error, title }: { open: boolean; onClose: () => void; editing?: Book | null; defaultValues?: Record<string, unknown>; onSubmit: (d: Record<string, unknown>) => void; isPending: boolean; error: unknown; title: string }) {
  const [materialType, setMaterialType] = useState<string>(editing?.material_type ?? 'BOOK');
  const fields = fieldsFor(materialType);
  const schema = buildMaterialSchema(fields);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Record<string, unknown>>({ resolver: zodResolver(schema) });

  const [authorAuthority, setAuthorAuthority] = useState<{ id: number | null; name: string | null }>({ id: null, name: null });
  const [publisherAuthority, setPublisherAuthority] = useState<{ id: number | null; name: string | null }>({ id: null, name: null });
  const [subjects, setSubjects] = useState<{ id: number; name: string }[]>([]);
  const [subjectsTouched, setSubjectsTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMaterialType(editing?.material_type ?? 'BOOK');
    reset({ ...(defaultValues as Record<string, unknown> | undefined), total_copies: defaultValues?.total_copies ?? 1 });
    setAuthorAuthority({ id: editing?.author_authority_id ?? null, name: editing?.author ?? null });
    setPublisherAuthority({ id: editing?.publisher_authority_id ?? null, name: editing?.publisher ?? null });
    setSubjects([]);
    setSubjectsTouched(false);
  }, [open, editing, defaultValues]);

  function renderField(f: FieldDescriptor) {
    if (f.kind === 'author-authority') {
      return (
        <div key={f.key} className="col-span-2 space-y-1"><Label>{f.label}</Label>
          <AuthorityPicker type="personal" valueName={authorAuthority.name ?? undefined}
            placeholder={`Search or create ${f.label.toLowerCase()}…`}
            onChange={(id, name) => setAuthorAuthority({ id, name })} />
        </div>
      );
    }
    if (f.kind === 'publisher-authority') {
      return (
        <div key={f.key} className="col-span-2 space-y-1"><Label>{f.label}</Label>
          <AuthorityPicker type="publisher" valueName={publisherAuthority.name ?? undefined}
            placeholder={`Search or create ${f.label.toLowerCase()}…`}
            onChange={(id, name) => setPublisherAuthority({ id, name })} />
        </div>
      );
    }
    if (f.kind === 'subjects') {
      return (
        <div key={f.key} className="col-span-2 space-y-1"><Label>{f.label}</Label>
          <AuthorityMultiPicker type="subject" value={subjects}
            onChange={(next) => { setSubjects(next); setSubjectsTouched(true); }}
            placeholder="Add controlled subjects…" />
        </div>
      );
    }
    if (f.kind === 'select') {
      return (
        <div key={f.key} className="space-y-1"><Label>{f.label}</Label>
          <select {...register(f.key)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">—</option>
            {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {errors[f.key] && <p className="text-xs text-destructive">{String(errors[f.key]?.message)}</p>}
        </div>
      );
    }
    const span = f.kind === 'textarea' ? 'col-span-2' : '';
    return (
      <div key={f.key} className={`${span} space-y-1`}><Label>{f.label}{f.required ? ' *' : ''}</Label>
        {f.kind === 'textarea'
          ? <textarea {...register(f.key)} className="min-h-16 w-full rounded-md border bg-background px-2 py-1 text-sm" />
          : <Input type={f.kind === 'number' ? 'number' : 'text'} {...(f.key === 'total_copies' ? { min: 1 } : {})} {...register(f.key)} />}
        {errors[f.key] && <p className="text-xs text-destructive">{String(errors[f.key]?.message)}</p>}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((data) => onSubmit({
          ...data,
          material_type: materialType,
          // Serial has no author field → persist '' (means "no personal author", not "unknown");
          // a future MARC exporter must not emit an empty 100$a for these.
          author: authorAuthority.name ?? (data.author as string | undefined) ?? '',
          publisher: publisherAuthority.name ?? (data.publisher as string | undefined),
          author_authority_id: authorAuthority.id,
          publisher_authority_id: publisherAuthority.id,
          is_loanable: true,
          ...(subjectsTouched ? { subject_authority_ids: subjects.map((s) => s.id) } : {}),
        }))} className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Material type</Label>
            <select value={materialType} onChange={(e) => setMaterialType(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {MATERIAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {fields.map(renderField)}
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
