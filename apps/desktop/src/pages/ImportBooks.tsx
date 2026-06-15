import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { parseSpreadsheet } from '@/lib/importParse';
import { autoGuessMapping, applyMapping, IMPORT_FIELDS, IGNORE } from '@/lib/importMapping';
import type { ImportField } from '@/lib/importMapping';
import type { DuplicateStrategy, ImportRow, PreviewStats, RowVerdict } from '@bookleaf/types';
import { Button } from '@bookleaf/ui/components/button';

type Step = 'upload' | 'map' | 'preview' | 'result';

export default function ImportBooks() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const institutionId = user?.institution_id ?? 1;

  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState('import');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, ImportField | typeof IGNORE>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<RowVerdict[]>([]);
  const [stats, setStats] = useState<PreviewStats | null>(null);
  const [strategy, setStrategy] = useState<DuplicateStrategy>('skip');

  const previewMut = useMutation(trpc.admin.books.importPreview.mutationOptions());
  const commitMut = useMutation(trpc.admin.books.importCommit.mutationOptions());

  const hasIsbnMatch = verdicts.some(v => v.status === 'duplicate_existing' && v.matchedBy === 'isbn');

  async function onFile(file: File) {
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const parsed = await parseSpreadsheet(buf, file.name);
      setFilename(file.name);
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setMapping(autoGuessMapping(parsed.headers));
      setStep('map');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the file.');
    }
  }

  const requiredMapped =
    Object.values(mapping).includes('title') && Object.values(mapping).includes('author');

  async function runPreview() {
    setError(null);
    const rows: ImportRow[] = applyMapping(rawRows, mapping as Record<string, string>);
    try {
      const res = await previewMut.mutateAsync({ institutionId, rows });
      setSessionId(res.sessionId);
      setVerdicts(res.verdicts);
      setStats(res.stats);
      setStep('preview');
    } catch (e) {
      setError(getTRPCErrorMessage(e));
    }
  }

  async function runCommit() {
    if (!sessionId) return;
    setError(null);
    try {
      await commitMut.mutateAsync({ sessionId, duplicateStrategy: strategy, filename });
      setStep('result');
    } catch (e) {
      setError(getTRPCErrorMessage(e));
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-brand">Import Books</h1>
      {error && <p className="text-red-600">{error}</p>}

      {step === 'upload' && (
        <div className="space-y-2">
          <p>Choose a .csv or .xlsx file (up to 10,000 rows).</p>
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={e => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
          />
        </div>
      )}

      {step === 'map' && (
        <div className="space-y-3">
          <p>{rawRows.length} rows detected. Map each column:</p>
          <div className="grid grid-cols-2 gap-2 max-w-xl">
            {headers.map(h => (
              <div key={h} className="contents">
                <span className="font-medium">{h}</span>
                <select
                  className="border rounded px-2 py-1"
                  value={mapping[h]}
                  onChange={e => setMapping({ ...mapping, [h]: e.target.value as ImportField | typeof IGNORE })}
                >
                  <option value={IGNORE}>(Ignore)</option>
                  {IMPORT_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            ))}
          </div>
          {!requiredMapped && <p className="text-amber-600">Map both Title and Author to continue.</p>}
          <Button disabled={!requiredMapped || previewMut.isPending} onClick={() => void runPreview()}>
            {previewMut.isPending ? 'Checking…' : 'Preview'}
          </Button>
        </div>
      )}

      {step === 'preview' && stats && (
        <div className="space-y-3">
          <div className="flex gap-4">
            <Stat label="Valid" value={stats.valid} />
            <Stat label="Duplicate (existing)" value={stats.duplicateExisting} />
            <Stat label="Duplicate (in file)" value={stats.duplicateFile} />
            <Stat label="Invalid" value={stats.invalid} />
          </div>
          <p>Will create <b>{stats.willCreateResources}</b> books and <b>{stats.willCreateCopies}</b> copies.</p>

          <fieldset className="space-y-1">
            <legend className="font-medium">For books already in the catalog:</legend>
            {(['skip', 'add_copies', 'force_create_duplicate'] as DuplicateStrategy[]).map(s => (
              <label key={s} className="block">
                <input
                  type="radio" name="strategy" value={s} checked={strategy === s}
                  disabled={s === 'force_create_duplicate' && hasIsbnMatch}
                  onChange={() => setStrategy(s)}
                />{' '}
                {s === 'skip' && `Skip them (skip ${stats.duplicateExisting} rows)`}
                {s === 'add_copies' && `Add copies to existing (${stats.perStrategy.add_copies.copies} copies)`}
                {s === 'force_create_duplicate' &&
                  `Import as new${hasIsbnMatch ? ' — unavailable: some matches are by ISBN' : ` (${stats.perStrategy.force_create_duplicate.resources} new books)`}`}
              </label>
            ))}
          </fieldset>

          <Button disabled={commitMut.isPending} onClick={() => void runCommit()}>
            {commitMut.isPending ? 'Importing…' : 'Import'}
          </Button>
        </div>
      )}

      {step === 'result' && commitMut.data && (
        <div className="space-y-2">
          <p className="text-brand font-medium">Import complete.</p>
          <p>Created {commitMut.data.created} books, added {commitMut.data.copiesAdded} copies, skipped {commitMut.data.skipped.length} rows.</p>
          {commitMut.data.skipped.length > 0 && (
            <details>
              <summary>Skipped rows</summary>
              <ul className="list-disc ml-6">
                {commitMut.data.skipped.map(s => (
                  <li key={s.rowIndex}>Row {s.rowIndex + 2}: {s.reasons.join('; ')}</li>
                ))}
              </ul>
            </details>
          )}
          <Button onClick={() => navigate(-1)}>Back to Books</Button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-mint-dark px-3 py-2">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}
