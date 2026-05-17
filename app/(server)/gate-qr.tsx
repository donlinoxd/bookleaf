import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import { GateService } from '../../src/services/GateService';
import { useAppStore } from '../../src/store/appStore';
import { queryKeys } from '../../src/lib/queryKeys';
import { getLocalIpAddress } from '../../src/utils/networkInfo';
import { GateLog } from '../../src/types';

const BRAND = '#2A5C33';
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

  // Compute unique visitors and currently inside count
  const byUser = new Map<number, string>();
  for (const log of logs) {
    if (!byUser.has(log.user_id)) byUser.set(log.user_id, log.direction);
  }
  const uniqueVisitors = byUser.size;
  const insideNow = [...byUser.values()].filter((d) => d === 'in').length;

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F9F4' }}>
      <StatusBar barStyle="light-content" backgroundColor={BRAND} />

      {/* Header */}
      <View style={{ backgroundColor: BRAND, paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color="#A8D5A2" />
          </TouchableOpacity>
          <Text style={{ color: '#A8D5A2', fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Gate Attendance
          </Text>
        </View>
        <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '800' }}>Entrance QR</Text>
        <Text style={{ color: '#A8D5A2', fontSize: 13, marginTop: 4 }}>
          Display this QR at the entrance so patrons can check in or out.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={LEAF} />}
      >
        {/* QR Card */}
        <View style={{
          backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24,
          alignItems: 'center', gap: 16,
          elevation: 3, shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8,
        }}>
          {gateUrl ? (
            <>
              <QRCode value={gateUrl} size={200} color="#1E293B" backgroundColor="#FFFFFF" />
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 12, color: '#94A3B8', letterSpacing: 0.5 }}>GATE URL</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1C2B1E', letterSpacing: 0.3 }}>{gateUrl}</Text>
              </View>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
                onPress={() => getLocalIpAddress().then((ip) => setGateUrl(`http://${ip}:${PORT}/gate`))}
              >
                <Ionicons name="refresh-outline" size={15} color="#64748B" />
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B' }}>Refresh IP</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={{ height: 200, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={LEAF} />
            </View>
          )}
        </View>

        {/* Today's stats */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatCard label="Unique Visitors" value={uniqueVisitors} accent={BRAND} bg="#E2EFE0" />
          <StatCard label="Inside Now" value={insideNow} accent={LEAF} bg="#DCFCE7" />
          <StatCard label="Log Entries" value={logs.length} accent="#3A7A45" bg="#F0FDF4" />
        </View>

        {/* Today's log */}
        <View style={{
          backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden',
          elevation: 2, shadowColor: BRAND, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4,
        }}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#1C2B1E' }}>Today's Log</Text>
          </View>

          {isLoading ? (
            <View style={{ padding: 32, alignItems: 'center' }}>
              <ActivityIndicator color={LEAF} />
            </View>
          ) : logs.length === 0 ? (
            <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
              <Ionicons name="people-outline" size={40} color="#C8DFC5" />
              <Text style={{ fontSize: 13, color: '#7A9A7E', fontWeight: '600' }}>No entries today yet</Text>
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
    <View style={{
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: isLast ? 0 : 1, borderBottomColor: '#F1F5F9',
    }}>
      <View style={{
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: isIn ? '#DCFCE7' : '#FEF3C7',
        alignItems: 'center', justifyContent: 'center', marginRight: 12,
      }}>
        <Ionicons name={isIn ? 'log-in-outline' : 'log-out-outline'} size={18} color={isIn ? '#16A34A' : '#D97706'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1C2B1E' }}>{log.user_name}</Text>
        <Text style={{ fontSize: 11, color: '#7A9A7E', marginTop: 1 }}>{log.user_id_number}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <View style={{
          backgroundColor: isIn ? '#DCFCE7' : '#FEF3C7',
          borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
        }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: isIn ? '#16A34A' : '#D97706' }}>
            {isIn ? 'IN' : 'OUT'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={methodIcon[log.method] as any} size={11} color="#94A3B8" />
          <Text style={{ fontSize: 11, color: '#94A3B8' }}>{time}</Text>
        </View>
      </View>
    </View>
  );
}

function StatCard({ label, value, accent, bg }: { label: string; value: number; accent: string; bg: string }) {
  return (
    <View style={{
      flex: 1, borderRadius: 16, padding: 14, alignItems: 'center',
      backgroundColor: bg, elevation: 1,
      shadowColor: accent, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2,
    }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: accent }}>{value}</Text>
      <Text style={{ fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 2, color: accent + 'CC' }}>{label}</Text>
    </View>
  );
}
