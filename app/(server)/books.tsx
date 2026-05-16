import { useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BookService } from '../../src/services/BookService';
import { useAppStore } from '../../src/store/appStore';
import { Book } from '../../src/types';
import { queryKeys } from '../../src/lib/queryKeys';

export default function BooksScreen() {
  const router = useRouter();
  const institution = useAppStore((s) => s.institution);
  const [query, setQuery] = useState('');

  const { data: books = [], isFetching, refetch } = useQuery({
    queryKey: queryKeys.books(institution?.id ?? 0, query),
    queryFn: () => query.trim()
      ? BookService.search(institution!.id, query)
      : BookService.getAll(institution!.id),
    enabled: !!institution,
  });

  const renderBook = ({ item }: { item: Book }) => (
    <TouchableOpacity style={styles.bookItem} onPress={() => router.push(`/(server)/book/${item.id}`)}>
      <View style={styles.coverPlaceholder}>
        <Text style={styles.coverInitial}>{item.title[0]}</Text>
      </View>
      <View style={styles.bookInfo}>
        <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.bookAuthor}>{item.author}</Text>
        {item.genre && <Text style={styles.bookGenre}>{item.genre}</Text>}
        <View style={styles.availabilityRow}>
          <View style={[styles.badge, item.available_copies > 0 ? styles.badgeGreen : styles.badgeRed]}>
            <Text style={styles.badgeText}>
              {item.available_copies > 0 ? `${item.available_copies} available` : 'Unavailable'}
            </Text>
          </View>
          <Text style={styles.totalCopies}>{item.total_copies} copies total</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Books</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/(server)/book/add')}>
          <Text style={styles.addButtonText}>+ Add Book</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search title, author, ISBN, genre..."
        clearButtonMode="while-editing"
      />

      <FlatList
        data={books}
        keyExtractor={(b) => String(b.id)}
        renderItem={renderBook}
        contentContainerStyle={styles.list}
        onRefresh={refetch}
        refreshing={isFetching}
        ListEmptyComponent={<Text style={styles.empty}>{isFetching ? 'Loading...' : 'No books found'}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 56, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title: { fontSize: 20, fontWeight: '700', color: '#1E293B' },
  addButton: { backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  addButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  search: { margin: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, fontSize: 15 },
  list: { padding: 12, gap: 10 },
  bookItem: { backgroundColor: '#FFFFFF', borderRadius: 12, flexDirection: 'row', padding: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05 },
  coverPlaceholder: { width: 48, height: 64, backgroundColor: '#EFF6FF', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  coverInitial: { fontSize: 22, fontWeight: '700', color: '#2563EB' },
  bookInfo: { flex: 1, marginLeft: 12 },
  bookTitle: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  bookAuthor: { fontSize: 13, color: '#64748B', marginTop: 2 },
  bookGenre: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  availabilityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeGreen: { backgroundColor: '#DCFCE7' },
  badgeRed: { backgroundColor: '#FEE2E2' },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  totalCopies: { fontSize: 11, color: '#94A3B8' },
  empty: { textAlign: 'center', color: '#94A3B8', marginTop: 60 },
});
