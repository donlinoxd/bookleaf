import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, NativeModules } from 'react-native';
import { ServerBridge } from '../../services/ServerBridge';
import { useAppStore } from '../../store/appStore';

type ServerStatus = 'idle' | 'starting' | 'running' | 'error' | 'stopped';

interface Props {
  institutionId: number;
}

async function getLocalIp(): Promise<string> {
  try {
    if (Platform.OS === 'android') {
      const { NetworkInfo } = NativeModules;
      if (NetworkInfo?.getIPAddress) {
        return await new Promise<string>((resolve) => NetworkInfo.getIPAddress(resolve, () => resolve('unknown')));
      }
    }
  } catch { /* fall through */ }
  return 'unknown';
}

export function ServerStatusCard({ institutionId }: Props) {
  const [status, setStatus] = useState<ServerStatus>('idle');
  const [detail, setDetail] = useState('');
  const [ip, setIp] = useState('');
  const port = 3000;

  useEffect(() => {
    getLocalIp().then(setIp);
  }, []);

  const handleStart = () => {
    ServerBridge.start(institutionId, (s, d) => {
      setStatus(s);
      if (d) setDetail(d);
    });
  };

  const handleStop = () => {
    ServerBridge.stop();
    setStatus('stopped');
  };

  const statusColor: Record<ServerStatus, string> = {
    idle: '#94A3B8',
    starting: '#D97706',
    running: '#16A34A',
    error: '#DC2626',
    stopped: '#64748B',
  };

  const isRunning = status === 'running';

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: statusColor[status] }]} />
        <Text style={styles.statusText}>
          Server{' '}
          {status === 'idle' ? 'not started'
            : status === 'starting' ? 'starting...'
            : status === 'running' ? 'running'
            : status === 'error' ? `error: ${detail}`
            : 'stopped'}
        </Text>
        <TouchableOpacity
          style={[styles.btn, isRunning ? styles.btnStop : styles.btnStart]}
          onPress={isRunning ? handleStop : handleStart}
        >
          <Text style={styles.btnText}>{isRunning ? 'Stop' : 'Start'}</Text>
        </TouchableOpacity>
      </View>

      {isRunning && ip !== 'unknown' && (
        <View style={styles.ipBox}>
          <Text style={styles.ipLabel}>Clients connect to:</Text>
          <Text style={styles.ipAddress}>{ip}:{port}</Text>
          <Text style={styles.ipHint}>Share this with students/teachers on the same Wi-Fi</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { flex: 1, fontSize: 14, color: '#374151', fontWeight: '500' },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  btnStart: { backgroundColor: '#2563EB' },
  btnStop: { backgroundColor: '#DC2626' },
  btnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  ipBox: { marginTop: 12, backgroundColor: '#F0FDF4', borderRadius: 8, padding: 12 },
  ipLabel: { fontSize: 12, color: '#16A34A', fontWeight: '600' },
  ipAddress: { fontSize: 20, fontWeight: '700', color: '#15803D', letterSpacing: 1, marginTop: 2 },
  ipHint: { fontSize: 11, color: '#4ADE80', marginTop: 4 },
});
