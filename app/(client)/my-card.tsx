import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useAppStore } from '../../src/store/appStore';
import { MemberCard } from '../../src/components/members/MemberCard';

export default function MyCardScreen() {
  const serverUrl = useAppStore((s) => s.serverUrl);
  const [idNumber, setIdNumber] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [name, setName] = useState('');
  const role = 'member';
  const [loading, setLoading] = useState(false);

  const handleLookup = async () => {
    const id = idNumber.trim();
    if (!id) return;
    if (!serverUrl) {
      Alert.alert('Not Connected', 'Connect to a library server first.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/members/${encodeURIComponent(id)}/borrows`);
      if (!res.ok) { Alert.alert('Not Found', 'No member found with that ID.'); return; }
      const data = await res.json();
      setName(data.member_name ?? id);
      setSubmitted(id);
    } catch {
      Alert.alert('Error', 'Could not reach the library server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>My Library Card</Text>
        <Text style={styles.subtitle}>Enter your ID to generate your QR card</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={idNumber}
            onChangeText={setIdNumber}
            placeholder="Your ID number"
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={handleLookup}
          />
          <TouchableOpacity style={styles.btn} onPress={handleLookup} disabled={loading}>
            <Text style={styles.btnText}>{loading ? '…' : 'Get Card'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {submitted ? (
        <View style={styles.cardWrapper}>
          <MemberCard
            name={name || submitted}
            idNumber={submitted}
            role={role}
            institutionName="Library Card"
          />
          <Text style={styles.hint}>
            Show this QR code to the librarian when borrowing or returning books.
          </Text>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🪪</Text>
          <Text style={styles.emptyText}>Your QR card will appear here</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingBottom: 40 },
  header: { backgroundColor: '#1E293B', padding: 20, paddingTop: 56, gap: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  subtitle: { fontSize: 13, color: '#94A3B8', marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, fontSize: 15 },
  btn: { backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  btnText: { color: '#FFFFFF', fontWeight: '600' },
  cardWrapper: { padding: 20, gap: 16 },
  hint: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 19 },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 15, color: '#94A3B8' },
});
