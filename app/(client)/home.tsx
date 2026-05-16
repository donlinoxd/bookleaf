import { useState, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';

interface BookResult {
  id: number;
  title: string;
  author: string;
  genre: string | null;
  year: number | null;
  available_copies: number;
  total_copies: number;
}

export default function ClientHomeScreen() {
  const router = useRouter();
  const serverUrl = useAppStore((s) => s.serverUrl);
  const [query, setQuery] = useState('');
  const [books, setBooks] = useState<BookResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !serverUrl) return;
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/books?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setBooks(data);
      setSearched(true);
    } catch {
      Alert.alert('Error', 'Could not reach the library server. Check your Wi-Fi connection.');
    } finally {
      setLoading(false);
    }
  }, [query, serverUrl]);

  const renderBook = ({ item }: { item: BookResult }) => (
    <View style={styles.bookCard}>
      <View style={styles.coverPlaceholder}>
        <Text style={styles.coverInitial}>{item.title[0]}</Text>
      </View>
      <View style={styles.bookInfo}>
        <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.bookAuthor}>{item.author}</Text>
        {item.genre && <Text style={styles.bookMeta}>{item.genre}</Text>}
        {item.year && <Text style={styles.bookMeta}>{item.year}</Text>}
        <View style={[styles.badge, item.available_copies > 0 ? styles.badgeGreen : styles.badgeRed]}>
          <Text style={styles.badgeText}>
            {item.available_copies > 0 ? `${item.available_copies} Available` : 'Not Available'}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Library Catalog</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search books, authors, genres..."
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} disabled={loading}>
            <Text style={styles.searchBtnText}>{loading ? '...' : 'Search'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={books}
        keyExtractor={(b) => String(b.id)}
        renderItem={renderBook}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              {!searched ? 'Search the catalog above' : `No results for "${query}"`}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#1E293B', padding: 20, paddingTop: 56 },
  title: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 14 },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, fontSize: 15 },
  searchBtn: { backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  searchBtnText: { color: '#FFFFFF', fontWeight: '600' },
  list: { padding: 12, gap: 10 },
  bookCard: { backgroundColor: '#FFFFFF', borderRadius: 12, flexDirection: 'row', padding: 12, elevation: 1 },
  coverPlaceholder: { width: 52, height: 68, backgroundColor: '#EFF6FF', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  coverInitial: { fontSize: 22, fontWeight: '700', color: '#2563EB' },
  bookInfo: { flex: 1, marginLeft: 12 },
  bookTitle: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  bookAuthor: { fontSize: 13, color: '#64748B', marginTop: 2 },
  bookMeta: { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  badge: { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  badgeGreen: { backgroundColor: '#DCFCE7' },
  badgeRed: { backgroundColor: '#FEE2E2' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  emptyWrap: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyText: { color: '#94A3B8', fontSize: 15 },
});
