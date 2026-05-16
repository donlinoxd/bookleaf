import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';

export default function ConnectScreen() {
  const router = useRouter();
  const setServerUrl = useAppStore((s) => s.setServerUrl);
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('3000');
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    if (!ip.trim()) {
      Alert.alert('Error', 'Please enter the server IP address');
      return;
    }
    setLoading(true);
    const url = `http://${ip.trim()}:${port.trim()}`;
    try {
      const response = await fetch(`${url}/ping`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        setServerUrl(url);
        router.replace('/(client)/home');
      } else {
        Alert.alert('Connection Failed', 'Server responded with an error');
      }
    } catch {
      Alert.alert('Connection Failed', 'Could not reach the server. Make sure you are on the same Wi-Fi network.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connect to Library</Text>
      <Text style={styles.subtitle}>Enter the server's IP address shown on the librarian's device</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Server IP Address</Text>
        <TextInput
          style={styles.input}
          value={ip}
          onChangeText={setIp}
          placeholder="e.g. 192.168.1.100"
          keyboardType="numeric"
        />
        <Text style={styles.label}>Port</Text>
        <TextInput
          style={styles.input}
          value={port}
          onChangeText={setPort}
          placeholder="3000"
          keyboardType="numeric"
        />
        <TouchableOpacity style={styles.button} onPress={handleConnect} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Connecting...' : 'Connect'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 24, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: '#1E293B', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8, marginBottom: 32 },
  form: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151' },
  input: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 8,
  },
  button: {
    backgroundColor: '#2563EB', borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
