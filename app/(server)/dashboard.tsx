import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View, Image, StatusBar } from 'react-native';
import { ServerStatusCard } from '../../src/components/common/ServerStatusCard';
import { queryKeys } from '../../src/lib/queryKeys';
import { BorrowService } from '../../src/services/BorrowService';
import { ReportService } from '../../src/services/ReportService';
import { useAppStore } from '../../src/store/appStore';

const MASCOT = require('../../assets/images/bookleaf-mascot.png');

interface Stats {
  total_books: number;
  available_copies: number;
  borrowed_copies: number;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { currentUser, institution, settings } = useAppStore();

  const { data: stats } = useQuery({
    queryKey: queryKeys.dashboard(institution?.id ?? 0),
    queryFn: () => ReportService.inventorySummary(institution!.id) as Promise<Stats>,
    enabled: !!institution,
  });

  const { data: overdueAll = [] } = useQuery({
    queryKey: queryKeys.overdue(),
    queryFn: BorrowService.getOverdue,
  });

  const overdue = overdueAll.slice(0, 5);
  const firstName = currentUser?.name?.split(' ')[0] ?? 'there';
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'librarian';

  return (
    <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ paddingBottom: 32 }}>
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      {/* Header */}
      <View className="bg-brand px-5 pb-6 rounded-b-[28px]" style={{ paddingTop: 52 }}>
        <View className="flex-row items-end justify-between">
          <View className="flex-1">
            <Text className="text-xs font-semibold text-[#A8D5A2] tracking-widest uppercase mb-1">
              Good day,
            </Text>
            <Text className="text-2xl font-extrabold text-white">{firstName}</Text>
            <Text className="text-sm text-[#A8D5A2] mt-0.5 font-medium">
              {settings?.institution_name}
            </Text>
          </View>
          <Image source={MASCOT} className="w-24 h-24 -mb-2" resizeMode="contain" />
        </View>
      </View>

      <View className="px-4 mt-4 gap-4">
        {/* Server status */}
        {isAdmin && institution && <ServerStatusCard institutionId={institution.id} />}

        {/* Stats */}
        <View className="flex-row gap-3">
          <StatCard label="Total Books" value={stats?.total_books ?? 0} accent="#2A5C33" bg="#E2EFE0" />
          <StatCard label="Available" value={stats?.available_copies ?? 0} accent="#5CB85C" bg="#DCFCE7" />
          <StatCard label="Borrowed" value={stats?.borrowed_copies ?? 0} accent="#D97706" bg="#FEF3C7" />
          <StatCard label="Overdue" value={overdue.length} accent="#DC2626" bg="#FEE2E2" />
        </View>

        {/* Quick Actions */}
        <View className="bg-white rounded-2xl p-4"
          style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
          <Text className="text-base font-bold text-[#1C2B1E] mb-3">Quick Actions</Text>
          <View className="flex-row gap-3">
            <ActionButton
              label="Check Out"
              emoji="📤"
              color="#2A5C33"
              onPress={() => router.push('/(server)/borrow')}
            />
            <ActionButton
              label="Return"
              emoji="📥"
              color="#5CB85C"
              onPress={() => router.push('/(server)/borrow')}
            />
            <ActionButton
              label="Add Book"
              emoji="📚"
              color="#3A7A45"
              onPress={() => router.push('/(server)/books')}
            />
          </View>
        </View>

        {/* Overdue */}
        <View className="bg-white rounded-2xl p-4"
          style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-base font-bold text-[#1C2B1E]">Overdue Books</Text>
            {overdue.length > 0 && (
              <View className="bg-red-100 rounded-full px-2.5 py-0.5">
                <Text className="text-xs font-bold text-red-600">{overdue.length}</Text>
              </View>
            )}
          </View>

          {overdue.length === 0 ? (
            <View className="items-center py-4">
              <Text className="text-2xl mb-1">✅</Text>
              <Text className="text-sm text-[#7A9A7E] font-medium">No overdue books</Text>
            </View>
          ) : (
            overdue.map((record, index) => (
              <View
                key={record.id}
                className={`flex-row items-center py-3 ${index > 0 ? 'border-t border-[#F1F5F9]' : ''}`}
              >
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-[#1C2B1E]">{record.book_title}</Text>
                  <Text className="text-xs text-[#5A7A5E] mt-0.5">
                    {record.member_name} · {record.member_id_number}
                  </Text>
                </View>
                <View className="bg-red-100 rounded-lg px-2.5 py-1 ml-3">
                  <Text className="text-xs font-bold text-red-600">
                    {new Date(record.due_date).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value, accent, bg }: { label: string; value: number; accent: string; bg: string }) {
  return (
    <View
      className="flex-1 rounded-2xl p-3 items-center"
      style={{
        backgroundColor: bg,
        elevation: 1,
        shadowColor: accent,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      }}
    >
      <Text className="text-2xl font-extrabold" style={{ color: accent }}>{value}</Text>
      <Text className="text-[10px] font-semibold text-center mt-0.5" style={{ color: accent + 'CC' }}>
        {label}
      </Text>
    </View>
  );
}

function ActionButton({ label, emoji, color, onPress }: { label: string; emoji: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      className="flex-1 rounded-xl py-3 items-center gap-1"
      style={{ backgroundColor: color }}
      onPress={onPress}
    >
      <Text className="text-lg">{emoji}</Text>
      <Text className="text-white text-xs font-bold">{label}</Text>
    </TouchableOpacity>
  );
}
