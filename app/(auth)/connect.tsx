import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { MdnsService, type DiscoveredServer } from '../../src/services/MdnsService';

export default function ConnectScreen() {
  const router = useRouter();
  const setServerUrl = useAppStore((s) => s.setServerUrl);

  const [servers, setServers] = useState<DiscoveredServer[]>([]);
  const [scanning, setScanning] = useState(true);

  const [ip, setIp] = useState('');
  const [port, setPort] = useState('3000');
  const [connecting, setConnecting] = useState(false);

  const scanStarted = useRef(false);

  useEffect(() => {
    if (scanStarted.current) return;
    scanStarted.current = true;

    MdnsService.startScan(
      (found) => {
        setServers((prev) => {
          const exists = prev.some((s) => s.name === found.name);
          return exists ? prev.map((s) => (s.name === found.name ? found : s)) : [...prev, found];
        });
      },
      (removedName) => {
        setServers((prev) => prev.filter((s) => s.name !== removedName));
      },
      () => {
        setScanning(false);
      },
    );

    // Stop scan after 15 s to preserve battery
    const timer = setTimeout(() => setScanning(false), 15000);

    return () => {
      clearTimeout(timer);
      MdnsService.stopScan();
    };
  }, []);

  const connect = async (url: string) => {
    setConnecting(true);
    try {
      const res = await fetch(`${url}/ping`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setServerUrl(url);
        router.replace('/(client)/home');
      } else {
        Alert.alert('Connection Failed', 'Server responded with an error.');
      }
    } catch {
      Alert.alert('Connection Failed', 'Could not reach the server. Make sure you are on the same Wi-Fi network.');
    } finally {
      setConnecting(false);
    }
  };

  const handleManualConnect = () => {
    if (!ip.trim()) {
      Alert.alert('Error', 'Please enter the server IP address');
      return;
    }
    connect(`http://${ip.trim()}:${port.trim()}`);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Connect to Library</Text>
      <Text style={styles.subtitle}>Searching for Bookleaf servers on your Wi-Fi network</Text>

      {/* Auto-discovered servers */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Nearby Servers</Text>
          {scanning && <ActivityIndicator size="small" color="#2563EB" />}
        </View>

        {servers.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {scanning ? 'Scanning…' : 'No servers found. Make sure the librarian has started the server.'}
            </Text>
          </View>
        ) : (
          servers.map((s) => (
            <TouchableOpacity
              key={s.name}
              style={styles.serverCard}
              onPress={() => connect(s.url)}
              disabled={connecting}
            >
              <View>
                <Text style={styles.serverName}>{s.name}</Text>
                <Text style={styles.serverUrl}>{s.url}</Text>
              </View>
              <Text style={styles.connectArrow}>{connecting ? '…' : '›'}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Manual fallback */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Enter IP Manually</Text>
        <Text style={styles.label}>Server IP Address</Text>
        <TextInput
          style={styles.input}
          value={ip}
          onChangeText={setIp}
          placeholder="e.g. 192.168.1.100"
          keyboardType="numeric"
          autoCapitalize="none"
        />
        <Text style={styles.label}>Port</Text>
        <TextInput
          style={styles.input}
          value={port}
          onChangeText={setPort}
          placeholder="3000"
          keyboardType="numeric"
        />
        <TouchableOpacity style={styles.button} onPress={handleManualConnect} disabled={connecting}>
          <Text style={styles.buttonText}>{connecting ? 'Connecting…' : 'Connect'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#F8FAFC', padding: 24, paddingTop: 40 },
  title: { fontSize: 26, fontWeight: '700', color: '#1E293B', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8, marginBottom: 28 },

  section: { marginBottom: 28 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#374151' },

  emptyBox: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16,
    borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center',
  },
  emptyText: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },

  serverCard: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#BFDBFE',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  serverName: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  serverUrl: { fontSize: 12, color: '#64748B', marginTop: 2 },
  connectArrow: { fontSize: 24, color: '#2563EB', fontWeight: '300' },

  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 12,
  },
  button: {
    backgroundColor: '#2563EB', borderRadius: 10, padding: 16, alignItems: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
