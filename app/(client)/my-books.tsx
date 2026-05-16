import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, FlatList } from 'react-native';
import { useAppStore } from '../../src/store/appStore';

interface BorrowInfo {
  id: number;
  book_title: string;
  book_author: string;
  due_date: string;
  returned_at: string | null;
}

export default function MyBooksScreen() {
  const serverUrl = useAppStore((s) => s.serverUrl);
  const [idNumber, setIdNumber] = useState('');
  const [borrows, setBorrows] = useState<BorrowInfo[]>([]);
  const [fines, setFines] = useState<number>(0);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLookup = async () => {
    if (!idNumber.trim() || !serverUrl) return;
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/members/${encodeURIComponent(idNumber.trim())}/borrows`);
      if (!res.ok) { Alert.alert('Not Found', 'No member found with that ID'); return; }
      const data = await res.json();
      setBorrows(data.borrows);
      setFines(data.total_fines ?? 0);
      setSearched(true);
    } catch {
      Alert.alert('Error', 'Could not reach the library server.');
    } finally {
      setLoading(false);
    }
  };

  const isOverdue = (dueDate: string) => new Date(dueDate) < new Date();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Books</Text>
        <Text style={styles.subtitle}>Enter your ID to view borrowed books</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={idNumber}
            onChangeText={setIdNumber}
            placeholder="Your ID number"
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.btn} onPress={handleLookup} disabled={loading}>
            <Text style={styles.btnText}>{loading ? '...' : 'Look up'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {searched && (
        fines > 0 ? (
          <View style={styles.finesBanner}>
            <Text style={styles.finesText}>Outstanding fines: ₱{fines.toFixed(2)}</Text>
            <Text style={styles.finesHint}>Please settle with the librarian</Text>
          </View>
        ) : null
      )}

      <FlatList
        data={borrows}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.borrowCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bookTitle}>{item.book_title}</Text>
              <Text style={styles.bookAuthor}>{item.book_author}</Text>
              {item.returned_at ? (
                <Text style={styles.returned}>Returned {new Date(item.returned_at).toLocaleDateString()}</Text>
              ) : (
                <Text style={[styles.dueDate, isOverdue(item.due_date) && styles.overdue]}>
                  {isOverdue(item.due_date) ? 'OVERDUE — ' : ''}Due {new Date(item.due_date).toLocaleDateString()}
                </Text>
              )}
            </View>
            {!item.returned_at && (
              <View style={[styles.statusDot, isOverdue(item.due_date) ? styles.dotRed : styles.dotGreen]} />
            )}
          </View>
        )}
        ListEmptyComponent={
          searched ? <Text style={styles.empty}>No borrowed books found</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#1E293B', padding: 20, paddingTop: 56 },
  title: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  subtitle: { fontSize: 13, color: '#94A3B8', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, fontSize: 15 },
  btn: { backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  btnText: { color: '#FFFFFF', fontWeight: '600' },
  finesBanner: { backgroundColor: '#FEF2F2', borderLeftWidth: 4, borderLeftColor: '#DC2626', padding: 14, margin: 12 },
  finesText: { fontSize: 15, fontWeight: '700', color: '#DC2626' },
  finesHint: { fontSize: 12, color: '#991B1B', marginTop: 2 },
  list: { padding: 12, gap: 10 },
  borrowCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  bookTitle: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  bookAuthor: { fontSize: 13, color: '#64748B', marginTop: 2 },
  dueDate: { fontSize: 12, color: '#64748B', marginTop: 4 },
  overdue: { color: '#DC2626', fontWeight: '700' },
  returned: { fontSize: 12, color: '#16A34A', marginTop: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dotGreen: { backgroundColor: '#16A34A' },
  dotRed: { backgroundColor: '#DC2626' },
  empty: { textAlign: 'center', color: '#94A3B8', marginTop: 60 },
});
