import { useState, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { BookService } from '../../src/services/BookService';
import { useAppStore } from '../../src/store/appStore';
import { Book } from '../../src/types';

export default function OPACScreen() {
  const router = useRouter();
  const institution = useAppStore((s) => s.institution);
  const settings = useAppStore((s) => s.settings);
  const [books, setBooks] = useState<Book[]>([]);
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!institution || !query.trim()) return;
    const results = await BookService.search(institution.id, query.trim());
    setBooks(results);
    setSearched(true);
  }, [institution, query]);

  const renderBook = ({ item }: { item: Book }) => (
    <TouchableOpacity style={styles.bookCard} onPress={() => router.push(`/(server)/book/${item.id}`)}>
      <View style={styles.coverPlaceholder}>
        <Text style={styles.coverInitial}>{item.title[0]}</Text>
      </View>
      <View style={styles.bookInfo}>
        <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.bookAuthor}>{item.author}</Text>
        {item.genre && <Text style={styles.bookGenre}>{item.genre}</Text>}
        {item.year && <Text style={styles.bookYear}>{item.year}</Text>}
        <View style={[styles.availBadge, item.available_copies > 0 ? styles.availGreen : styles.availRed]}>
          <Text style={styles.availText}>
            {item.available_copies > 0 ? `${item.available_copies} Available` : 'Not Available'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.libraryName}>{settings?.institution_name ?? 'Library'}</Text>
        <Text style={styles.subtitle}>Public Catalog</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search books, authors, genres..."
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
            <Text style={styles.searchBtnText}>Search</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={books}
        keyExtractor={(b) => String(b.id)}
        renderItem={renderBook}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {!searched
              ? <Text style={styles.emptyText}>Search the catalog above</Text>
              : <Text style={styles.emptyText}>No books found for "{query}"</Text>
            }
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#1E293B', padding: 20, paddingTop: 56 },
  libraryName: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  subtitle: { fontSize: 13, color: '#94A3B8', marginBottom: 16 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, fontSize: 15 },
  searchBtn: { backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  searchBtnText: { color: '#FFFFFF', fontWeight: '600' },
  list: { padding: 12, gap: 10 },
  bookCard: { backgroundColor: '#FFFFFF', borderRadius: 12, flexDirection: 'row', padding: 12, elevation: 1 },
  coverPlaceholder: { width: 56, height: 72, backgroundColor: '#EFF6FF', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  coverInitial: { fontSize: 24, fontWeight: '700', color: '#2563EB' },
  bookInfo: { flex: 1, marginLeft: 12 },
  bookTitle: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  bookAuthor: { fontSize: 13, color: '#64748B', marginTop: 2 },
  bookGenre: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  bookYear: { fontSize: 12, color: '#94A3B8' },
  availBadge: { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  availGreen: { backgroundColor: '#DCFCE7' },
  availRed: { backgroundColor: '#FEE2E2' },
  availText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  emptyContainer: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyText: { color: '#94A3B8', fontSize: 15 },
});
