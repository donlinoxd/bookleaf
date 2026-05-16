import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from '../../src/store/appStore';

export default function SetupScreen() {
  const router = useRouter();
  const setMode = useAppStore((s) => s.setMode);

  const selectMode = async (mode: 'server' | 'client') => {
    await AsyncStorage.setItem('app_mode', mode);
    setMode(mode);
    if (mode === 'server') {
      router.replace('/(auth)/register');
    } else {
      router.replace('/(auth)/connect');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Bookleaf</Text>
        <Text style={styles.subtitle}>Choose how this device will be used</Text>
      </View>

      <View style={styles.cards}>
        <TouchableOpacity style={[styles.card, styles.serverCard]} onPress={() => selectMode('server')}>
          <Text style={styles.cardIcon}>📚</Text>
          <Text style={styles.cardTitle}>Bookleaf Server</Text>
          <Text style={styles.cardDesc}>
            This device manages the library.{'\n'}
            Hosts the database and API for all other devices.
          </Text>
          <Text style={styles.cardHint}>For the librarian's device</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.card, styles.clientCard]} onPress={() => selectMode('client')}>
          <Text style={styles.cardIcon}>🔍</Text>
          <Text style={styles.cardTitle}>OPAC Client</Text>
          <Text style={styles.cardDesc}>
            Browse and search the library catalog.{'\n'}
            Connects to the server over Wi-Fi.
          </Text>
          <Text style={styles.cardHint}>For students and teachers</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  title: { fontSize: 32, fontWeight: '700', color: '#1E293B' },
  subtitle: { fontSize: 16, color: '#64748B', marginTop: 8, textAlign: 'center' },
  cards: { gap: 16 },
  card: {
    borderRadius: 16, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  serverCard: { backgroundColor: '#2563EB' },
  clientCard: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#E2E8F0' },
  cardIcon: { fontSize: 36, marginBottom: 12 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
  cardDesc: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 12 },
  cardHint: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic' },
});
