import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { open } from '@tauri-apps/plugin-dialog';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { Button } from '@bookleaf/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@bookleaf/ui/components/card';
import { Upload, CheckCircle2, ArrowLeft } from 'lucide-react';

export default function Setup() {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const [importResult, setImportResult] = useState<{ tablesImported: number; rowsImported: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const importMutation = useMutation(trpc.admin.backup.importSQLite.mutationOptions({
    onSuccess: (result) => {
      setImportResult(result);
      setImportError(null);
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
    <div className="min-h-screen bg-background flex flex-col">
      <div data-tauri-drag-region className="h-8 w-full shrink-0" />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">B</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">Bookleaf Desktop</h1>
              <p className="text-sm text-muted-foreground">First-time setup</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Import from Android</CardTitle>
              <CardDescription>
                If you have an existing library on the Bookleaf Android app, export{' '}
                <code className="text-xs bg-muted px-1 rounded">library.db</code> from its Settings
                screen and import it here to migrate all books, members, and records.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="outline"
                onClick={handleImport}
                disabled={importMutation.isPending}
                className="flex items-center gap-2 w-full"
              >
                <Upload size={15} />
                {importMutation.isPending ? 'Importing…' : 'Select database file…'}
              </Button>

              {importResult && (
                <div className="flex items-start gap-2 p-3 bg-secondary rounded-lg text-sm">
                  <CheckCircle2 size={16} className="text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-foreground">Import successful</p>
                    <p className="text-muted-foreground">
                      {importResult.tablesImported} tables, {importResult.rowsImported} rows imported.
                    </p>
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => navigate('/login', { replace: true })}
                    >
                      Go to sign in →
                    </Button>
                  </div>
                </div>
              )}

              {importError && <p className="text-sm text-destructive">{importError}</p>}
            </CardContent>
          </Card>

          <button
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
            onClick={() => navigate('/login', { replace: true })}
          >
            <ArrowLeft size={14} />
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
