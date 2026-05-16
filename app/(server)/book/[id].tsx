import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, TextInput, Modal, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookService } from '../../../src/services/BookService';
import { BorrowService } from '../../../src/services/BorrowService';
import { useAppStore } from '../../../src/store/appStore';
import { Book } from '../../../src/types';
import { queryKeys } from '../../../src/lib/queryKeys';

const CONDITION_COLOR: Record<string, string> = {
  good: '#16A34A',
  damaged: '#D97706',
  lost: '#DC2626',
};

const STATUS_COLOR: Record<string, string> = {
  available: '#16A34A',
  borrowed: '#2563EB',
  reserved: '#7C3AED',
};

export default function BookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useAppStore((s) => s.currentUser);
  const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'librarian';
  const bookId = parseInt(id);

  const [editVisible, setEditVisible] = useState(false);

  const { data: book, isLoading } = useQuery({
    queryKey: queryKeys.book(bookId),
    queryFn: () => BookService.getById(bookId),
    enabled: !!bookId,
  });

  const { data: copies = [] } = useQuery({
    queryKey: queryKeys.bookCopies(bookId),
    queryFn: () => BookService.getCopies(bookId),
    enabled: !!bookId,
  });

  const { data: history = [] } = useQuery({
    queryKey: queryKeys.bookHistory(bookId),
    queryFn: () => BorrowService.getHistoryByBook(bookId),
    enabled: !!bookId,
  });

  const addCopyMutation = useMutation({
    mutationFn: () => BookService.addCopy(bookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.book(bookId) });
      queryClient.invalidateQueries({ queryKey: ['books'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const handleAddCopy = () => {
    Alert.alert('Add Copy', 'Add one more copy of this book?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add', onPress: () => addCopyMutation.mutate() },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!book) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Book not found</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          {isStaff && (
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditVisible(true)}>
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.hero}>
          <View style={styles.coverLarge}>
            <Text style={styles.coverInitial}>{book.title[0]}</Text>
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.bookTitle}>{book.title}</Text>
            <Text style={styles.bookAuthor}>{book.author}</Text>
            {book.publisher && <Text style={styles.bookMeta}>{book.publisher}</Text>}
            {book.year && <Text style={styles.bookMeta}>{book.year}</Text>}
            {book.genre && (
              <View style={styles.genreBadge}>
                <Text style={styles.genreText}>{book.genre}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.availRow}>
          <View style={[styles.availCard, book.available_copies > 0 ? styles.availGreen : styles.availRed]}>
            <Text style={styles.availNum}>{book.available_copies}</Text>
            <Text style={styles.availLabel}>Available</Text>
          </View>
          <View style={styles.availCard}>
            <Text style={styles.availNum}>{book.total_copies}</Text>
            <Text style={styles.availLabel}>Total copies</Text>
          </View>
          <View style={styles.availCard}>
            <Text style={styles.availNum}>{book.total_copies - book.available_copies}</Text>
            <Text style={styles.availLabel}>Borrowed</Text>
          </View>
        </View>

        {book.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{book.description}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Copies ({copies.length})</Text>
            {isStaff && (
              <TouchableOpacity style={styles.addCopyBtn} onPress={handleAddCopy}>
                <Text style={styles.addCopyText}>+ Add copy</Text>
              </TouchableOpacity>
            )}
          </View>
          {copies.map((copy) => (
            <View key={copy.id} style={styles.copyRow}>
              <Text style={styles.copyNum}>Copy #{copy.copy_number}</Text>
              <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[copy.status] + '20' }]}>
                <Text style={[styles.statusText, { color: STATUS_COLOR[copy.status] }]}>
                  {copy.status}
                </Text>
              </View>
              <View style={[styles.condBadge, { backgroundColor: CONDITION_COLOR[copy.condition] + '20' }]}>
                <Text style={[styles.condText, { color: CONDITION_COLOR[copy.condition] }]}>
                  {copy.condition}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Borrowing History ({history.length})</Text>
          {history.length === 0 ? (
            <Text style={styles.emptyText}>No borrowing history yet</Text>
          ) : (
            history.map((record) => (
              <View key={record.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyMember}>{record.member_name}</Text>
                  <Text style={styles.historyId}>{record.member_id_number}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.historyDate}>
                    {new Date(record.borrowed_at).toLocaleDateString()}
                  </Text>
                  {record.returned_at ? (
                    <Text style={styles.historyReturned}>Returned</Text>
                  ) : (
                    <Text style={[styles.historyStatus, new Date(record.due_date) < new Date() && styles.overdueText]}>
                      {new Date(record.due_date) < new Date() ? 'Overdue' : 'Active'}
                    </Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <EditBookModal
        visible={editVisible}
        book={book}
        onClose={() => setEditVisible(false)}
        onSaved={() => setEditVisible(false)}
      />
    </>
  );
}

interface EditModalProps {
  visible: boolean;
  book: Book;
  onClose: () => void;
  onSaved: () => void;
}

function EditBookModal({ visible, book, onClose, onSaved }: EditModalProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [isbn, setIsbn] = useState(book.isbn ?? '');
  const [publisher, setPublisher] = useState(book.publisher ?? '');
  const [year, setYear] = useState(book.year ? String(book.year) : '');
  const [genre, setGenre] = useState(book.genre ?? '');
  const [description, setDescription] = useState(book.description ?? '');

  useEffect(() => {
    setTitle(book.title);
    setAuthor(book.author);
    setIsbn(book.isbn ?? '');
    setPublisher(book.publisher ?? '');
    setYear(book.year ? String(book.year) : '');
    setGenre(book.genre ?? '');
    setDescription(book.description ?? '');
  }, [book]);

  const updateMutation = useMutation({
    mutationFn: () => BookService.update(book.id, {
      title: title.trim(),
      author: author.trim(),
      isbn: isbn.trim() || null,
      publisher: publisher.trim() || null,
      year: year.trim() ? parseInt(year.trim()) : null,
      genre: genre.trim() || null,
      description: description.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.book(book.id) });
      queryClient.invalidateQueries({ queryKey: ['books'] });
      onSaved();
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const handleSave = () => {
    if (!title.trim() || !author.trim()) {
      Alert.alert('Error', 'Title and author are required');
      return;
    }
    updateMutation.mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={modal.container}>
        <View style={modal.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={modal.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={modal.title}>Edit Book</Text>
          <TouchableOpacity onPress={handleSave} disabled={updateMutation.isPending}>
            <Text style={modal.save}>{updateMutation.isPending ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={modal.body}>
          <Field label="Title *" value={title} onChangeText={setTitle} />
          <Field label="Author *" value={author} onChangeText={setAuthor} />
          <Field label="ISBN" value={isbn} onChangeText={setIsbn} keyboardType="numeric" />
          <Field label="Publisher" value={publisher} onChangeText={setPublisher} />
          <Field label="Year" value={year} onChangeText={setYear} keyboardType="numeric" maxLength={4} />
          <Field label="Genre" value={genre} onChangeText={setGenre} />
          <Field label="Description" value={description} onChangeText={setDescription} multiline />
        </ScrollView>
      </View>
    </Modal>
  );
}

function Field({
  label, value, onChangeText, keyboardType, multiline, maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'numeric';
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <View style={field.wrap}>
      <Text style={field.label}>{label}</Text>
      <TextInput
        style={[field.input, multiline && field.multiline]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        maxLength={maxLength}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#DC2626', fontSize: 16 },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  backBtn: { paddingVertical: 4 },
  backText: { fontSize: 15, color: '#2563EB', fontWeight: '600' },
  editBtn: { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  editBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  hero: { flexDirection: 'row', padding: 20, backgroundColor: '#FFFFFF', gap: 16 },
  coverLarge: {
    width: 80, height: 110, backgroundColor: '#EFF6FF', borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  coverInitial: { fontSize: 36, fontWeight: '700', color: '#2563EB' },
  heroInfo: { flex: 1, justifyContent: 'center', gap: 4 },
  bookTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', lineHeight: 24 },
  bookAuthor: { fontSize: 15, color: '#475569' },
  bookMeta: { fontSize: 13, color: '#94A3B8' },
  genreBadge: { alignSelf: 'flex-start', backgroundColor: '#EFF6FF', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  genreText: { fontSize: 12, fontWeight: '600', color: '#2563EB' },
  availRow: { flexDirection: 'row', margin: 16, gap: 10 },
  availCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, alignItems: 'center', elevation: 1 },
  availGreen: { borderTopWidth: 3, borderTopColor: '#16A34A' },
  availRed: { borderTopWidth: 3, borderTopColor: '#DC2626' },
  availNum: { fontSize: 22, fontWeight: '700', color: '#1E293B' },
  availLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },
  section: { backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 12, borderRadius: 12, padding: 16, elevation: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
  description: { fontSize: 14, color: '#475569', lineHeight: 22 },
  addCopyBtn: { backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  addCopyText: { fontSize: 13, fontWeight: '600', color: '#2563EB' },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  copyNum: { fontSize: 14, color: '#374151', flex: 1 },
  statusBadge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  condBadge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  condText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  historyMember: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  historyId: { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  historyDate: { fontSize: 12, color: '#64748B' },
  historyReturned: { fontSize: 12, color: '#16A34A', fontWeight: '600', marginTop: 2 },
  historyStatus: { fontSize: 12, color: '#2563EB', fontWeight: '600', marginTop: 2 },
  overdueText: { color: '#DC2626' },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', paddingVertical: 8 },
});

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, paddingTop: 20, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  cancel: { fontSize: 15, color: '#64748B' },
  save: { fontSize: 15, fontWeight: '700', color: '#2563EB' },
  body: { padding: 16 },
});

const field = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  multiline: { height: 100, paddingTop: 12 },
});
