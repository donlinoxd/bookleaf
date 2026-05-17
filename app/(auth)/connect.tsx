import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
      (found) => setServers((prev) => {
        const exists = prev.some((s) => s.name === found.name);
        return exists ? prev.map((s) => (s.name === found.name ? found : s)) : [...prev, found];
      }),
      (removedName) => setServers((prev) => prev.filter((s) => s.name !== removedName)),
      () => setScanning(false),
    );
    const timer = setTimeout(() => setScanning(false), 15000);
    return () => { clearTimeout(timer); MdnsService.stopScan(); };
  }, []);

  const connect = async (url: string) => {
    setConnecting(true);
    try {
      const res = await fetch(`${url}/ping`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) { setServerUrl(url); router.replace('/(client)/home'); }
      else Alert.alert('Connection Failed', 'Server responded with an error.');
    } catch {
      Alert.alert('Connection Failed', 'Could not reach the server. Make sure you are on the same Wi-Fi network.');
    } finally {
      setConnecting(false);
    }
  };

  const handleManualConnect = () => {
    if (!ip.trim()) { Alert.alert('Error', 'Please enter the server IP address'); return; }
    connect(`http://${ip.trim()}:${port.trim()}`);
  };

  return (
    <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      <View className="bg-brand px-6 pb-8 rounded-b-[32px] pt-[60px]">
        <Text className="text-3xl font-extrabold text-white">Connect to Library</Text>
        <Text className="text-sm text-[#A8D5A2] mt-1">Searching for Bookleaf servers on your Wi-Fi</Text>
      </View>

      <View className="px-5 pt-5 gap-4">
        {/* Auto-discovered */}
        <View className="bg-white rounded-2xl p-4"
          style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
          <View className="flex-row items-center gap-2 mb-3">
            <Text className="text-sm font-bold text-[#1C2B1E]">Nearby Servers</Text>
            {scanning && <ActivityIndicator size="small" color="#2A5C33" />}
          </View>

          {servers.length === 0 ? (
            <View className="bg-bio rounded-xl p-4 items-center">
              <Ionicons name="wifi-outline" size={28} color="#94A3B8" />
              <Text className="text-xs text-[#94A3B8] text-center mt-2 leading-4">
                {scanning ? 'Scanning for servers…' : 'No servers found. Make sure the librarian has started the server.'}
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {servers.map((s) => (
                <TouchableOpacity
                  key={s.name}
                  className="bg-mint rounded-xl px-4 py-3 flex-row items-center justify-between"
                  onPress={() => connect(s.url)}
                  disabled={connecting}
                  activeOpacity={0.75}
                >
                  <View>
                    <Text className="text-sm font-bold text-brand">{s.name}</Text>
                    <Text className="text-xs text-[#5A7A5E] mt-0.5">{s.url}</Text>
                  </View>
                  <Text className="text-2xl text-brand">{connecting ? '…' : '›'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Manual */}
        <View className="bg-white rounded-2xl p-4 gap-3"
          style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
          <Text className="text-sm font-bold text-[#1C2B1E]">Enter IP Manually</Text>

          <View>
            <Text className="text-xs font-bold text-brand uppercase tracking-widest mb-1.5">Server IP Address</Text>
            <TextInput
              className="bg-bio border border-mint rounded-xl px-4 py-3 text-base text-[#1C2B1E]"
              value={ip}
              onChangeText={setIp}
              placeholder="e.g. 192.168.1.100"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              autoCapitalize="none"
            />
          </View>
          <View>
            <Text className="text-xs font-bold text-brand uppercase tracking-widest mb-1.5">Port</Text>
            <TextInput
              className="bg-bio border border-mint rounded-xl px-4 py-3 text-base text-[#1C2B1E]"
              value={port}
              onChangeText={setPort}
              placeholder="3000"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
            />
          </View>

          <TouchableOpacity
            className="bg-leaf rounded-xl py-3.5 items-center"
            onPress={handleManualConnect}
            disabled={connecting}
            style={{ elevation: 3, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }}
          >
            <Text className="text-white font-bold">{connecting ? 'Connecting…' : 'Connect'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
