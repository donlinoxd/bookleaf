import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable, getCoreRowModel, getFilteredRowModel,
  flexRender, type ColumnDef,
} from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

const bookSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  author: z.string().optional(),
  isbn: z.string().optional(),
  genre: z.string().optional(),
  year: z.coerce.number().optional(),
  publisher: z.string().optional(),
  language: z.string().optional(),
  call_number: z.string().optional(),
  total_copies: z.coerce.number().min(1).default(1),
  material_type: z.string().default('BOOK'),
  is_loanable: z.boolean().default(true),
});
type BookForm = z.infer<typeof bookSchema>;
type Book = { id: number; title: string; author: string | null; genre: string | null; year: number | null; material_type: string; available_copies: number; total_copies: number };

export default function Books() {
  const trpc = useTRPC();
  const qc = useQueryClient();
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
        <Button onClick={() => setIsAddOpen(true)} size="sm"><Plus size={15} className="mr-1.5" />Add Book</Button>
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
      <BookDialog open={isAddOpen || !!editBook} onClose={() => { setIsAddOpen(false); setEditBook(null); }}
        defaultValues={editBook ? { title: editBook.title, author: editBook.author ?? '', genre: editBook.genre ?? '', year: editBook.year ?? undefined, total_copies: editBook.total_copies, material_type: editBook.material_type, is_loanable: true } : undefined}
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

function BookDialog({ open, onClose, defaultValues, onSubmit, isPending, error, title }: { open: boolean; onClose: () => void; defaultValues?: Partial<BookForm>; onSubmit: (d: BookForm) => void; isPending: boolean; error: unknown; title: string }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<BookForm>({ resolver: zodResolver(bookSchema), defaultValues: defaultValues ?? { total_copies: 1, material_type: 'BOOK', is_loanable: true } });
  useEffect(() => { if (open) reset(defaultValues ?? { total_copies: 1, material_type: 'BOOK', is_loanable: true }); }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1"><Label>Title *</Label><Input {...register('title')} />{errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}</div>
            <div className="space-y-1"><Label>Author</Label><Input {...register('author')} /></div>
            <div className="space-y-1"><Label>ISBN</Label><Input {...register('isbn')} /></div>
            <div className="space-y-1"><Label>Genre</Label><Input {...register('genre')} /></div>
            <div className="space-y-1"><Label>Year</Label><Input type="number" {...register('year')} /></div>
            <div className="space-y-1"><Label>Publisher</Label><Input {...register('publisher')} /></div>
            <div className="space-y-1"><Label>Language</Label><Input {...register('language')} placeholder="English" /></div>
            <div className="space-y-1"><Label>Call Number</Label><Input {...register('call_number')} /></div>
            <div className="space-y-1"><Label>Copies</Label><Input type="number" min={1} {...register('total_copies')} /></div>
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
