import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Input } from '@bookleaf/ui/components/input';
import { Badge } from '@bookleaf/ui/components/badge';
import { X, Plus } from 'lucide-react';

type AuthorityType = 'personal' | 'corporate' | 'geographic' | 'subject' | 'publisher';
type AuthorityRow = { id: number; name: string; name_type: string };

function useAuthoritySearch(authorityType: AuthorityType, q: string) {
  const trpc = useTRPC();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;
  return useQuery({
    ...trpc.admin.authorities.list.queryOptions({ institutionId: iid, type: authorityType, q }),
    enabled: q.trim().length > 0,
  });
}

function useCreateAuthority(_type?: AuthorityType) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  return useMutation(trpc.admin.authorities.create.mutationOptions({
    onSuccess: () => qc.invalidateQueries({ queryKey: trpc.admin.authorities.list.queryKey() }),
  }));
}

/** Single-select: binds one authority id (or null). */
export function AuthorityPicker({
  type, valueName, onChange, placeholder,
}: {
  type: AuthorityType;
  valueName?: string;
  onChange: (id: number | null, name: string | null) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(valueName ?? '');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const { data: results = [] } = useAuthoritySearch(type, text);
  const createMut = useCreateAuthority(type);

  useEffect(() => { setText(valueName ?? ''); }, [valueName]);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const rows = (results as unknown) as AuthorityRow[];
  const exact = rows.some(r => r.name.toLowerCase() === text.trim().toLowerCase());

  async function create() {
    const created = await createMut.mutateAsync({ institutionId: useAuthStore.getState().user?.institution_id ?? 1, name: text.trim(), type });
    onChange(created.id, text.trim());
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <Input
        value={text}
        placeholder={placeholder}
        onChange={(e) => { const v = e.target.value; setText(v); setOpen(true); onChange(null, v.trim() ? v : null); }}
        onFocus={() => setOpen(true)}
      />
      {open && text.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-md max-h-56 overflow-auto">
          {rows.map(r => (
            <button type="button" key={r.id} className="flex w-full items-center px-3 py-1.5 text-sm hover:bg-muted text-left"
              onClick={() => { onChange(r.id, r.name); setText(r.name); setOpen(false); }}>
              {r.name}
            </button>
          ))}
          {!exact && (
            <button type="button" className="flex w-full items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:bg-muted text-left"
              onClick={create} disabled={createMut.isPending}>
              <Plus size={13} /> Create &quot;{text.trim()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Multi-select: binds an array of authority ids. */
export function AuthorityMultiPicker({
  type, value, onChange, placeholder,
}: {
  type: AuthorityType;
  value: { id: number; name: string }[];
  onChange: (next: { id: number; name: string }[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const { data: results = [] } = useAuthoritySearch(type, text);
  const createMut = useCreateAuthority(type);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const allRows = (results as unknown) as AuthorityRow[];
  const rows = allRows.filter(r => !value.some(v => v.id === r.id));
  const exact = allRows.some(r => r.name.toLowerCase() === text.trim().toLowerCase());

  function add(r: { id: number; name: string }) { onChange([...value, r]); setText(''); }
  async function create() {
    const created = await createMut.mutateAsync({ institutionId: useAuthStore.getState().user?.institution_id ?? 1, name: text.trim(), type });
    add({ id: created.id, name: text.trim() });
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex flex-wrap gap-1 mb-1">
        {value.map(v => (
          <Badge key={v.id} variant="secondary" className="gap-1">
            {v.name}
            <button type="button" onClick={() => onChange(value.filter(x => x.id !== v.id))}><X size={11} /></button>
          </Badge>
        ))}
      </div>
      <Input value={text} placeholder={placeholder}
        onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && text.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-md max-h-56 overflow-auto">
          {rows.map(r => (
            <button type="button" key={r.id} className="flex w-full px-3 py-1.5 text-sm hover:bg-muted text-left"
              onClick={() => add({ id: r.id, name: r.name })}>{r.name}</button>
          ))}
          {!exact && (
            <button type="button" className="flex w-full items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:bg-muted text-left"
              onClick={create} disabled={createMut.isPending}><Plus size={13} /> Create &quot;{text.trim()}&quot;</button>
          )}
        </div>
      )}
    </div>
  );
}
