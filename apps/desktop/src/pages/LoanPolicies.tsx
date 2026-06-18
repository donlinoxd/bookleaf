import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@bookleaf/ui/components/button';
import { Input } from '@bookleaf/ui/components/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@bookleaf/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@bookleaf/ui/components/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bookleaf/ui/components/select';
import { Trash2, Plus } from 'lucide-react';
import type { LoanRule, CategoryLimit } from '@bookleaf/types';

const USER_TYPE_OPTS = ['ANY', 'student', 'faculty', 'alumni', 'external'] as const;
const MATERIAL_TYPE_OPTS = ['ANY', 'BOOK', 'SERIAL', 'ARTICLE', 'AUDIOVISUAL', 'MAP', 'MANUSCRIPT', 'DIGITAL', 'THESIS', 'OTHER'] as const;

const blankRule = (): Omit<LoanRule, 'id' | 'institution_id'> => ({
  user_type: 'ANY', material_type: 'ANY', loan_period_days: 7, type_limit: null,
  max_renewals: 2, renewal_period_days: null, fine_per_day: 5, grace_period_days: 0,
  fine_max: null, is_loanable: true, is_holdable: true,
});

export default function LoanPolicies() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;
  const [draft, setDraft] = useState<Omit<LoanRule, 'id' | 'institution_id'>>(blankRule());

  const rulesQ = useQuery(trpc.admin.loanRules.listRules.queryOptions({ institutionId: iid }));
  const limitsQ = useQuery(trpc.admin.loanRules.getCategoryLimits.queryOptions({ institutionId: iid }));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: trpc.admin.loanRules.listRules.queryKey({ institutionId: iid }) });
    qc.invalidateQueries({ queryKey: trpc.admin.loanRules.getCategoryLimits.queryKey({ institutionId: iid }) });
  };

  const upsertRule = useMutation(trpc.admin.loanRules.upsertRule.mutationOptions({ onSuccess: invalidate }));
  const deleteRule = useMutation(trpc.admin.loanRules.deleteRule.mutationOptions({ onSuccess: invalidate }));
  const upsertLimit = useMutation(trpc.admin.loanRules.upsertCategoryLimit.mutationOptions({ onSuccess: invalidate }));

  const rules = (rulesQ.data ?? []) as LoanRule[];
  const limits = (limitsQ.data ?? []) as CategoryLimit[];

  const numOrNull = (s: string) => (s === '' ? null : Number(s));

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Loan Policies</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rules matrix</CardTitle>
          <CardDescription>Per patron category × material type. Blank cells fall back to the most general matching rule (ANY).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead><TableHead>Material</TableHead><TableHead>Period</TableHead>
                <TableHead>Type limit</TableHead><TableHead>Renewals</TableHead><TableHead>Fine/day</TableHead>
                <TableHead>Grace</TableHead><TableHead>Fine cap</TableHead><TableHead>Loanable</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.user_type}</TableCell>
                  <TableCell>{r.material_type}</TableCell>
                  <TableCell>{r.loan_period_days}d</TableCell>
                  <TableCell>{r.type_limit ?? '—'}</TableCell>
                  <TableCell>{r.max_renewals}</TableCell>
                  <TableCell>₱{r.fine_per_day}</TableCell>
                  <TableCell>{r.grace_period_days}d</TableCell>
                  <TableCell>{r.fine_max == null ? '—' : `₱${r.fine_max}`}</TableCell>
                  <TableCell>{r.is_loanable ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => deleteRule.mutate({ id: r.id })} aria-label="Delete rule">
                      <Trash2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium">Add / overwrite a rule</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs">Category</label>
                <Select value={draft.user_type} onValueChange={(v) => setDraft({ ...draft, user_type: v as LoanRule['user_type'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{USER_TYPE_OPTS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs">Material</label>
                <Select value={draft.material_type} onValueChange={(v) => setDraft({ ...draft, material_type: v as LoanRule['material_type'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MATERIAL_TYPE_OPTS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><label className="text-xs">Loan period (days)</label><Input type="number" value={draft.loan_period_days} onChange={(e) => setDraft({ ...draft, loan_period_days: Number(e.target.value) })} /></div>
              <div className="space-y-1"><label className="text-xs">Type limit (blank = none)</label><Input type="number" value={draft.type_limit ?? ''} onChange={(e) => setDraft({ ...draft, type_limit: numOrNull(e.target.value) })} /></div>
              <div className="space-y-1"><label className="text-xs">Max renewals</label><Input type="number" value={draft.max_renewals} onChange={(e) => setDraft({ ...draft, max_renewals: Number(e.target.value) })} /></div>
              <div className="space-y-1"><label className="text-xs">Fine per day</label><Input type="number" step="0.01" value={draft.fine_per_day} onChange={(e) => setDraft({ ...draft, fine_per_day: Number(e.target.value) })} /></div>
              <div className="space-y-1"><label className="text-xs">Grace (days)</label><Input type="number" value={draft.grace_period_days} onChange={(e) => setDraft({ ...draft, grace_period_days: Number(e.target.value) })} /></div>
              <div className="space-y-1"><label className="text-xs">Fine cap (blank = none)</label><Input type="number" step="0.01" value={draft.fine_max ?? ''} onChange={(e) => setDraft({ ...draft, fine_max: numOrNull(e.target.value) })} /></div>
            </div>
            {upsertRule.error && <p className="text-xs text-destructive">{getTRPCErrorMessage(upsertRule.error)}</p>}
            <Button onClick={() => upsertRule.mutate({ institutionId: iid, data: draft })} disabled={upsertRule.isPending} className="flex items-center gap-2">
              <Plus size={15} /> Save rule
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Category ceilings</CardTitle>
          <CardDescription>Overall borrowing limit and fines-block threshold per category (₱0 threshold = fines never block).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {USER_TYPE_OPTS.map((ut) => {
            const existing = limits.find(l => l.user_type === ut);
            return <CategoryLimitRow key={ut} userType={ut} existing={existing}
              onSave={(overall, threshold) => upsertLimit.mutate({ institutionId: iid, data: { id: existing?.id, user_type: ut, overall_limit: overall, fines_block_threshold: threshold } })}
              pending={upsertLimit.isPending} />;
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function CategoryLimitRow({ userType, existing, onSave, pending }: {
  userType: string; existing?: CategoryLimit; onSave: (overall: number | null, threshold: number) => void; pending: boolean;
}) {
  const [overall, setOverall] = useState<string>(existing?.overall_limit?.toString() ?? '');
  const [threshold, setThreshold] = useState<string>(existing?.fines_block_threshold?.toString() ?? '0');
  return (
    <div className="grid grid-cols-4 gap-3 items-end">
      <div className="text-sm font-medium">{userType}</div>
      <div className="space-y-1"><label className="text-xs">Overall limit (blank = none)</label><Input type="number" value={overall} onChange={(e) => setOverall(e.target.value)} /></div>
      <div className="space-y-1"><label className="text-xs">Fines block ≥ ₱</label><Input type="number" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></div>
      <Button variant="outline" disabled={pending} onClick={() => onSave(overall === '' ? null : Number(overall), Number(threshold || '0'))}>Save</Button>
    </div>
  );
}
