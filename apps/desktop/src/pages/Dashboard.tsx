import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Card, CardContent, CardHeader, CardTitle } from '@bookleaf/ui/components/card';
import { BookOpen, Users, AlertTriangle, ArrowLeftRight } from 'lucide-react';

export default function Dashboard() {
  const trpc = useTRPC();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;

  const { data: activeData } = useQuery(trpc.admin.circulation.activeBorrows.queryOptions({ institutionId: iid }));
  const { data: overdueData } = useQuery(trpc.admin.circulation.overdueBorrows.queryOptions({ institutionId: iid }));
  const { data: booksData } = useQuery(trpc.admin.books.list.queryOptions({ institutionId: iid }));
  const { data: membersData } = useQuery(trpc.admin.members.list.queryOptions({ institutionId: iid }));

  const stats = [
    { label: 'Active Borrows', value: (activeData as any[])?.length ?? 0, icon: ArrowLeftRight, color: 'text-blue-600' },
    { label: 'Overdue', value: (overdueData as any[])?.length ?? 0, icon: AlertTriangle, color: 'text-red-600' },
    { label: 'Total Books', value: (booksData as any[])?.length ?? 0, icon: BookOpen, color: 'text-primary' },
    { label: 'Members', value: (membersData as any[])?.length ?? 0, icon: Users, color: 'text-violet-600' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Library overview</p>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon size={16} className={color} />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
