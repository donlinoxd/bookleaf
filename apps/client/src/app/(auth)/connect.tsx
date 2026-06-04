import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store/appStore';
import { MdnsService, type DiscoveredServer } from '../../services/MdnsService';

export default function ConnectScreen() {
  const router = useRouter();
  const { setServerUrl, setInstitutionInfo } = useAppStore();
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const pingRes = await fetch(`${url}/ping`, { signal: controller.signal });
      if (!pingRes.ok) {
        Alert.alert('Connection Failed', 'Server responded with an error.');
        return;
      }
      clearTimeout(timer);

      // Fetch institution info for catalog queries
      let institutionId = 1;
      let institutionName = 'Library';
      try {
        const infoRes = await fetch(`${url}/info`);
        if (infoRes.ok) {
          const info = await infoRes.json();
          institutionId = info.institutionId ?? 1;
          institutionName = info.institutionName ?? 'Library';
        }
      } catch {}

      setServerUrl(url);
      setInstitutionInfo({ institutionId, institutionName });
      router.replace('/(auth)/login');
    } catch {
      Alert.alert('Connection Failed', 'Could not reach the library server. Check the IP address and try again.');
    } finally {
      clearTimeout(timer);
      setConnecting(false);
    }
  };

  const connectManual = () => {
    if (!ip.trim()) { Alert.alert('Enter IP', 'Please enter the server IP address.'); return; }
    connect(`http://${ip.trim()}:${port.trim() || '3000'}`);
  };

  return (
    <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ flexGrow: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />
      <View className="bg-brand px-5 pb-8 pt-[52px] rounded-b-[32px]">
        <Text className="text-2xl font-extrabold text-white">Connect to Library</Text>
        <Text className="text-xs text-[#A8D5A2] mt-1">
          {scanning ? 'Scanning for nearby servers…' : 'Tap a server below or enter the IP manually.'}
        </Text>
      </View>

      <View className="px-5 pt-5 gap-3">
        {scanning && (
          <View className="flex-row items-center gap-2 py-3">
            <ActivityIndicator color="#2A5C33" />
            <Text className="text-sm text-[#7A9A7E]">Scanning for Bookleaf servers…</Text>
          </View>
        )}

        {servers.map((s) => (
          <TouchableOpacity
            key={s.name}
            className="bg-white rounded-2xl px-4 py-4 flex-row items-center justify-between"
            style={{ elevation: 2 }}
            onPress={() => connect(s.url)}
            disabled={connecting}
          >
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 bg-mint rounded-xl items-center justify-center">
                <Ionicons name="server-outline" size={20} color="#2A5C33" />
              </View>
              <View>
                <Text className="text-sm font-bold text-[#1C2B1E]">{s.name}</Text>
                <Text className="text-xs text-[#7A9A7E]">{s.url}</Text>
              </View>
            </View>
            {connecting ? <ActivityIndicator color="#2A5C33" /> : <Ionicons name="chevron-forward" size={18} color="#2A5C33" />}
          </TouchableOpacity>
        ))}

        {!scanning && servers.length === 0 && (
          <View className="items-center py-6 gap-2">
            <Ionicons name="wifi-outline" size={40} color="#C8DFC5" />
            <Text className="text-sm text-[#7A9A7E] text-center">No servers found. Make sure the librarian device is on and on the same Wi-Fi.</Text>
          </View>
        )}

        <View className="bg-white rounded-2xl px-4 py-4 gap-3 mt-2" style={{ elevation: 2 }}>
          <Text className="text-xs font-bold text-brand uppercase tracking-wider">Enter IP Manually</Text>
          <View className="flex-row gap-2">
            <TextInput
              className="flex-1 border border-mint-dark rounded-xl px-3 py-3 text-sm text-[#1C2B1E]"
              placeholder="192.168.1.x"
              value={ip}
              onChangeText={setIp}
              keyboardType="decimal-pad"
              autoCapitalize="none"
            />
            <TextInput
              className="w-20 border border-mint-dark rounded-xl px-3 py-3 text-sm text-[#1C2B1E]"
              placeholder="3000"
              value={port}
              onChangeText={setPort}
              keyboardType="number-pad"
            />
          </View>
          <TouchableOpacity
            className="bg-leaf rounded-xl py-3.5 items-center"
            onPress={connectManual}
            disabled={connecting}
            style={{ elevation: 4, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 }}
          >
            {connecting
              ? <ActivityIndicator color="#fff" />
              : <Text className="text-white font-bold">Connect</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
