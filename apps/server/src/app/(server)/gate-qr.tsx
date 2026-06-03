import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import { GateService } from '../../services/GateService';
import { useAppStore } from '../../store/appStore';
import { queryKeys } from '../../lib/queryKeys';
import { getLocalIpAddress } from '../../utils/networkInfo';
import { GateLog } from '@bookleaf/types';

const LEAF = '#5CB85C';
const PORT = 3000;

export default function GateQrScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const institution = useAppStore((s) => s.institution);
  const [gateUrl, setGateUrl] = useState<string | null>(null);

  useEffect(() => {
    getLocalIpAddress().then((ip) => {
      setGateUrl(`http://${ip}:${PORT}/gate`);
    });
  }, []);

  const { data: logs = [], isLoading, refetch, isRefetching } = useQuery<GateLog[]>({
    queryKey: queryKeys.gateTodayLogs(institution?.id ?? 0),
    queryFn: () => GateService.getTodayLogs(institution!.id),
    enabled: !!institution,
    refetchInterval: 30_000,
  });

  const byUser = new Map<number, string>();
  for (const log of logs) {
    if (!byUser.has(log.user_id)) byUser.set(log.user_id, log.direction);
  }
  const uniqueVisitors = byUser.size;
  const insideNow = [...byUser.values()].filter((d) => d === 'in').length;

  return (
    <View className="flex-1 bg-[#F4F9F4]">
      <StatusBar barStyle="light-content" backgroundColor='#2A5C33' />

      {/* Header */}
      <View
        className="bg-brand px-5 pb-6"
        style={{ paddingTop: insets.top + 16 }}
      >
        <View className="flex-row items-center gap-3 mb-1">
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color="#A8D5A2" />
          </TouchableOpacity>
          <Text className="text-[#A8D5A2] text-[11px] font-semibold tracking-[1.2px] uppercase">
            Gate Attendance
          </Text>
        </View>
        <Text className="text-white text-[24px] font-extrabold">Entrance QR</Text>
        <Text className="text-[#A8D5A2] text-[13px] mt-1">
          Display this QR at the entrance so patrons can check in or out.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={LEAF} />}
      >
        {/* QR Card */}
        <View
          className="bg-white rounded-[20px] p-6 items-center gap-4"
          style={{
            elevation: 3,
            shadowColor: '#2A5C33',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
          }}
        >
          {gateUrl ? (
            <>
              <QRCode value={gateUrl} size={200} color="#1E293B" backgroundColor="#FFFFFF" />
              <View className="items-center gap-1">
                <Text className="text-[12px] text-[#94A3B8] tracking-[0.5px]">GATE URL</Text>
                <Text className="text-[13px] font-bold text-[#1C2B1E] tracking-[0.3px]">{gateUrl}</Text>
              </View>
              <TouchableOpacity
                className="flex-row items-center gap-[6px] bg-[#F1F5F9] rounded-[10px] px-[14px] py-2"
                onPress={() => getLocalIpAddress().then((ip) => setGateUrl(`http://${ip}:${PORT}/gate`))}
              >
                <Ionicons name="refresh-outline" size={15} color="#64748B" />
                <Text className="text-[12px] font-semibold text-[#64748B]">Refresh IP</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View className="h-[200px] items-center justify-center">
              <ActivityIndicator color={LEAF} />
            </View>
          )}
        </View>

        {/* Today's stats */}
        <View className="flex-row gap-3">
          <StatCard label="Unique Visitors" value={uniqueVisitors} accent='#2A5C33' bg="#E2EFE0" />
          <StatCard label="Inside Now" value={insideNow} accent={LEAF} bg="#DCFCE7" />
          <StatCard label="Log Entries" value={logs.length} accent="#3A7A45" bg="#F0FDF4" />
        </View>

        {/* Today's log */}
        <View
          className="bg-white rounded-2xl overflow-hidden"
          style={{
            elevation: 2,
            shadowColor: '#2A5C33',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.07,
            shadowRadius: 4,
          }}
        >
          <View className="px-4 py-[14px] border-b border-[#F1F5F9]">
            <Text className="text-[14px] font-extrabold text-[#1C2B1E]">Today's Log</Text>
          </View>

          {isLoading ? (
            <View className="p-8 items-center">
              <ActivityIndicator color={LEAF} />
            </View>
          ) : logs.length === 0 ? (
            <View className="p-8 items-center gap-2">
              <Ionicons name="people-outline" size={40} color="#C8DFC5" />
              <Text className="text-[13px] text-[#7A9A7E] font-semibold">No entries today yet</Text>
            </View>
          ) : (
            logs.map((log, index) => (
              <LogRow key={log.id} log={log} isLast={index === logs.length - 1} />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function LogRow({ log, isLast }: { log: GateLog; isLast: boolean }) {
  const isIn = log.direction === 'in';
  const time = new Date(log.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const methodIcon: Record<string, string> = { app: 'phone-portrait-outline', browser: 'globe-outline', manual: 'scan-outline' };

  return (
    <View
      className="flex-row items-center px-4 py-3"
      style={{ borderBottomWidth: isLast ? 0 : 1, borderBottomColor: '#F1F5F9' }}
    >
      <View
        className="w-9 h-9 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: isIn ? '#DCFCE7' : '#FEF3C7' }}
      >
        <Ionicons
          name={isIn ? 'log-in-outline' : 'log-out-outline'}
          size={18}
          color={isIn ? '#16A34A' : '#D97706'}
        />
      </View>
      <View className="flex-1">
        <Text className="text-[13px] font-bold text-[#1C2B1E]">{log.user_name}</Text>
        <Text className="text-[11px] text-[#7A9A7E] mt-[1px]">{log.user_id_number}</Text>
      </View>
      <View className="items-end gap-1">
        <View
          className="rounded-[6px] px-2 py-[2px]"
          style={{ backgroundColor: isIn ? '#DCFCE7' : '#FEF3C7' }}
        >
          <Text className="text-[10px] font-bold" style={{ color: isIn ? '#16A34A' : '#D97706' }}>
            {isIn ? 'IN' : 'OUT'}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Ionicons name={methodIcon[log.method] as any} size={11} color="#94A3B8" />
          <Text className="text-[11px] text-[#94A3B8]">{time}</Text>
        </View>
      </View>
    </View>
  );
}

function StatCard({ label, value, accent, bg }: { label: string; value: number; accent: string; bg: string }) {
  return (
    <View
      className="flex-1 rounded-2xl p-[14px] items-center"
      style={{
        backgroundColor: bg,
        elevation: 1,
        shadowColor: accent,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      }}
    >
      <Text className="text-[22px] font-extrabold" style={{ color: accent }}>{value}</Text>
      <Text className="text-[10px] font-semibold text-center mt-[2px]" style={{ color: accent + 'CC' }}>{label}</Text>
    </View>
  );
}
