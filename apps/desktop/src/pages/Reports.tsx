import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';

type TabId = 'circulation' | 'collection' | 'fines' | 'patron';

const TABS: { id: TabId; label: string }[] = [
  { id: 'circulation', label: 'Circulation' },
  { id: 'collection', label: 'Collection' },
  { id: 'fines', label: 'Fines' },
  { id: 'patron', label: 'Patron' },
];

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
    </div>
  );
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-6 text-center text-muted-foreground text-sm">
        Loading…
      </td>
    </tr>
  );
}

function TableEmpty({ cols, message = 'No records.' }: { cols: number; message?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-6 text-center text-muted-foreground text-sm">
        {message}
      </td>
    </tr>
  );
}

function SectionTable({ title, headers, children }: { title: string; headers: string[]; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
              {headers.map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function CirculationTab({ iid }: { iid: number }) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.admin.reports.circulation.queryOptions({ institutionId: iid })
  );

  const ov = (data as any)?.overview;
  const topBorrowers: any[] = (data as any)?.topBorrowers ?? [];
  const mostBorrowed: any[] = (data as any)?.mostBorrowed ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard label="Total Borrows" value={isLoading ? '—' : ov?.total_borrows ?? 0} />
        <StatCard label="Currently Borrowed" value={isLoading ? '—' : ov?.currently_borrowed ?? 0} />
        <StatCard label="Overdue" value={isLoading ? '—' : ov?.overdue ?? 0} />
        <StatCard label="Returned" value={isLoading ? '—' : ov?.returned ?? 0} />
        <StatCard label="Active Borrowers" value={isLoading ? '—' : ov?.active_borrowers ?? 0} />
      </div>

      <SectionTable title="Top Borrowers" headers={['Member', 'ID', 'Total', 'Active']}>
        {isLoading ? (
          <TableSkeleton cols={4} />
        ) : topBorrowers.length === 0 ? (
          <TableEmpty cols={4} />
        ) : (
          topBorrowers.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2 font-medium">{r.user_name}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.user_id_number}</td>
              <td className="px-3 py-2">{r.total_borrows}</td>
              <td className="px-3 py-2">{r.active_borrows}</td>
            </tr>
          ))
        )}
      </SectionTable>

      <SectionTable title="Most Borrowed Books" headers={['Title', 'Author', 'Count']}>
        {isLoading ? (
          <TableSkeleton cols={3} />
        ) : mostBorrowed.length === 0 ? (
          <TableEmpty cols={3} />
        ) : (
          mostBorrowed.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2 font-medium">{r.title}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.author}</td>
              <td className="px-3 py-2">{r.borrow_count}</td>
            </tr>
          ))
        )}
      </SectionTable>
    </div>
  );
}

function CollectionTab({ iid }: { iid: number }) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.admin.reports.collection.queryOptions({ institutionId: iid })
  );

  const ov = (data as any)?.overview;
  const byType: any[] = (data as any)?.byMaterialType ?? [];
  const byYear: any[] = (data as any)?.byPublicationYear ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
        <StatCard label="Total Titles" value={isLoading ? '—' : ov?.total_titles ?? 0} />
        <StatCard label="Total Copies" value={isLoading ? '—' : ov?.total_copies ?? 0} />
        <StatCard label="Available" value={isLoading ? '—' : ov?.available_copies ?? 0} />
        <StatCard label="Borrowed" value={isLoading ? '—' : ov?.borrowed_copies ?? 0} />
        <StatCard label="Damaged" value={isLoading ? '—' : ov?.damaged_copies ?? 0} />
        <StatCard label="Lost" value={isLoading ? '—' : ov?.lost_copies ?? 0} />
      </div>

      <SectionTable title="By Material Type" headers={['Type', 'Titles', 'Copies']}>
        {isLoading ? (
          <TableSkeleton cols={3} />
        ) : byType.length === 0 ? (
          <TableEmpty cols={3} />
        ) : (
          byType.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2 font-medium capitalize">{r.material_type?.toLowerCase().replace('_', ' ')}</td>
              <td className="px-3 py-2">{r.titles}</td>
              <td className="px-3 py-2">{r.copies}</td>
            </tr>
          ))
        )}
      </SectionTable>

      <SectionTable title="By Publication Year" headers={['Period', 'Count']}>
        {isLoading ? (
          <TableSkeleton cols={2} />
        ) : byYear.length === 0 ? (
          <TableEmpty cols={2} />
        ) : (
          byYear.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2 font-medium">{r.bucket}</td>
              <td className="px-3 py-2">{r.titles}</td>
            </tr>
          ))
        )}
      </SectionTable>
    </div>
  );
}

function FinesTab({ iid }: { iid: number }) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.admin.reports.fines.queryOptions({ institutionId: iid })
  );

  const sm = (data as any)?.summary;
  const topDebtors: any[] = (data as any)?.topDebtors ?? [];
  const details: any[] = ((data as any)?.details ?? []).slice(0, 20);

  const fmt = (n: number) => `₱${Number(n ?? 0).toFixed(2)}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard label="Total Fines (₱)" value={isLoading ? '—' : fmt(sm?.total_fines)} />
        <StatCard label="Collected (₱)" value={isLoading ? '—' : fmt(sm?.total_collected)} />
        <StatCard label="Pending (₱)" value={isLoading ? '—' : fmt(sm?.total_pending)} />
        <StatCard label="Paid Count" value={isLoading ? '—' : sm?.paid_count ?? 0} />
        <StatCard label="Unpaid Count" value={isLoading ? '—' : sm?.unpaid_count ?? 0} />
      </div>

      <SectionTable title="Top Debtors" headers={['Member', 'ID', 'Total (₱)', 'Pending (₱)']}>
        {isLoading ? (
          <TableSkeleton cols={4} />
        ) : topDebtors.length === 0 ? (
          <TableEmpty cols={4} />
        ) : (
          topDebtors.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2 font-medium">{r.user_name}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.user_id_number}</td>
              <td className="px-3 py-2">{fmt(r.total_fines)}</td>
              <td className="px-3 py-2 text-destructive">{fmt(r.pending)}</td>
            </tr>
          ))
        )}
      </SectionTable>

      <SectionTable title="Recent Fine Records" headers={['Member', 'Book', 'Amount', 'Status', 'Returned At']}>
        {isLoading ? (
          <TableSkeleton cols={5} />
        ) : details.length === 0 ? (
          <TableEmpty cols={5} />
        ) : (
          details.map((r) => (
            <tr key={r.fine_id} className="border-b border-border last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2 font-medium">{r.member_name}</td>
              <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{r.book_title}</td>
              <td className="px-3 py-2">{fmt(r.amount)}</td>
              <td className="px-3 py-2">
                {r.paid ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Paid</span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Unpaid</span>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {r.returned_at ? new Date(r.returned_at).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))
        )}
      </SectionTable>
    </div>
  );
}

function PatronTab({ iid }: { iid: number }) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.admin.reports.patron.queryOptions({ institutionId: iid })
  );

  const ov = (data as any)?.overview;
  const byType: any[] = (data as any)?.byType ?? [];
  const byDept: any[] = (data as any)?.byDepartment ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard label="Total Members" value={isLoading ? '—' : ov?.total_members ?? 0} />
        <StatCard label="Active" value={isLoading ? '—' : ov?.active_members ?? 0} />
        <StatCard label="Inactive" value={isLoading ? '—' : ov?.inactive_members ?? 0} />
        <StatCard label="Active Borrowers" value={isLoading ? '—' : ov?.active_borrowers ?? 0} />
        <StatCard label="Never Borrowed" value={isLoading ? '—' : ov?.never_borrowed ?? 0} />
      </div>

      <SectionTable title="By Member Type" headers={['Type', 'Count', 'Active']}>
        {isLoading ? (
          <TableSkeleton cols={3} />
        ) : byType.length === 0 ? (
          <TableEmpty cols={3} />
        ) : (
          byType.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2 font-medium capitalize">{r.user_type}</td>
              <td className="px-3 py-2">{r.count}</td>
              <td className="px-3 py-2">{r.active}</td>
            </tr>
          ))
        )}
      </SectionTable>

      <SectionTable title="By Department" headers={['Department', 'Count', 'Active Borrowers']}>
        {isLoading ? (
          <TableSkeleton cols={3} />
        ) : byDept.length === 0 ? (
          <TableEmpty cols={3} />
        ) : (
          byDept.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2 font-medium">{r.department || '—'}</td>
              <td className="px-3 py-2">{r.count}</td>
              <td className="px-3 py-2">{r.active_borrowers}</td>
            </tr>
          ))
        )}
      </SectionTable>
    </div>
  );
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState<TabId>('circulation');
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">Library analytics and statistics</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'circulation' && <CirculationTab iid={iid} />}
      {activeTab === 'collection' && <CollectionTab iid={iid} />}
      {activeTab === 'fines' && <FinesTab iid={iid} />}
      {activeTab === 'patron' && <PatronTab iid={iid} />}
    </div>
  );
}
