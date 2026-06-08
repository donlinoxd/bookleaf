import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@bookleaf/ui/components/button';
import { Input } from '@bookleaf/ui/components/input';
import { Label } from '@bookleaf/ui/components/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@bookleaf/ui/components/card';
import { Separator } from '@bookleaf/ui/components/separator';
import { Upload, CheckCircle2 } from 'lucide-react';

const settingsSchema = z.object({
  institution_name: z.string().min(1, 'Institution name is required'),
  fine_per_day: z.coerce.number().min(0),
  max_borrow_days: z.coerce.number().min(1),
  max_books_per_member: z.coerce.number().min(1),
  grace_period_days: z.coerce.number().min(0),
  max_renewals: z.coerce.number().min(0),
});
type SettingsForm = z.infer<typeof settingsSchema>;

export default function Settings() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;
  const [importResult, setImportResult] = useState<{ tablesImported: number; rowsImported: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const { data: savedSettings } = useQuery(trpc.admin.settings.get.queryOptions({ institutionId: iid }));

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { fine_per_day: 5, max_borrow_days: 7, max_books_per_member: 3, grace_period_days: 0, max_renewals: 2, institution_name: '' },
  });

  useEffect(() => {
    if (savedSettings) reset(savedSettings as SettingsForm);
  }, [savedSettings, reset]);

  const updateMutation = useMutation(trpc.admin.settings.update.mutationOptions({
    onSuccess: () => qc.invalidateQueries({ queryKey: trpc.admin.settings.get.queryKey({ institutionId: iid }) }),
  }));

  const importMutation = useMutation(trpc.admin.backup.importSQLite.mutationOptions({
    onSuccess: (result) => {
      setImportResult(result);
      setImportError(null);
      qc.invalidateQueries();
    },
    onError: (e) => setImportError(getTRPCErrorMessage(e)),
  }));

  const handleImport = async () => {
    setImportResult(null);
    setImportError(null);
    try {
      const selected = await open({
        title: 'Select library.db exported from Android',
        filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
        multiple: false,
      });
      if (!selected) return;
      const filePath = typeof selected === 'string' ? selected : (selected as string[])[0];
      importMutation.mutate({ filePath });
    } catch {
      setImportError('Failed to open file picker.');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Library Settings</CardTitle>
          <CardDescription>Configure your institution's borrowing rules</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((d) => updateMutation.mutate({ institutionId: iid, data: d }))} className="space-y-4">
            <div className="space-y-1">
              <Label>Institution Name</Label>
              <Input {...register('institution_name')} />
              {errors.institution_name && <p className="text-xs text-destructive">{errors.institution_name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Fine per Day</Label><Input type="number" step="0.01" {...register('fine_per_day')} /></div>
              <div className="space-y-1"><Label>Max Borrow Days</Label><Input type="number" {...register('max_borrow_days')} /></div>
              <div className="space-y-1"><Label>Max Books per Member</Label><Input type="number" {...register('max_books_per_member')} /></div>
              <div className="space-y-1"><Label>Grace Period (days)</Label><Input type="number" {...register('grace_period_days')} /></div>
              <div className="space-y-1"><Label>Max Renewals</Label><Input type="number" {...register('max_renewals')} /></div>
            </div>
            {updateMutation.error && <p className="text-xs text-destructive">{getTRPCErrorMessage(updateMutation.error)}</p>}
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving…' : 'Save Settings'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import from Android</CardTitle>
          <CardDescription>
            Migrate your library data from the Bookleaf Android app. Export{' '}
            <code className="text-xs bg-muted px-1 rounded">library.db</code> from the Android
            app's Settings screen, then select it here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={handleImport} disabled={importMutation.isPending} className="flex items-center gap-2">
            <Upload size={15} />
            {importMutation.isPending ? 'Importing…' : 'Select database file…'}
          </Button>

          {importResult && (
            <div className="flex items-start gap-2 p-3 bg-secondary rounded-lg text-sm">
              <CheckCircle2 size={16} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">Import successful</p>
                <p className="text-muted-foreground">
                  {importResult.tablesImported} tables, {importResult.rowsImported} rows imported. Refresh the app to see your data.
                </p>
              </div>
            </div>
          )}

          {importError && <p className="text-sm text-destructive">{importError}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
