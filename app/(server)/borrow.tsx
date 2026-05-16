import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { UserService } from '../../src/services/UserService';
import { BookService } from '../../src/services/BookService';
import { BorrowService } from '../../src/services/BorrowService';
import { User, Book } from '../../src/types';

type Mode = 'checkout' | 'return';

export default function BorrowScreen() {
  const [mode, setMode] = useState<Mode>('checkout');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Borrow / Return</Text>
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'checkout' && styles.toggleActive]}
            onPress={() => setMode('checkout')}
          >
            <Text style={[styles.toggleText, mode === 'checkout' && styles.toggleTextActive]}>Check Out</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'return' && styles.toggleActive]}
            onPress={() => setMode('return')}
          >
            <Text style={[styles.toggleText, mode === 'return' && styles.toggleTextActive]}>Return</Text>
          </TouchableOpacity>
        </View>
      </View>

      {mode === 'checkout' ? <CheckoutForm /> : <ReturnForm />}
    </View>
  );
}

function CheckoutForm() {
  const [memberQuery, setMemberQuery] = useState('');
  const [bookQuery, setBookQuery] = useState('');
  const [member, setMember] = useState<User | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(false);

  const lookupMember = async () => {
    const found = await UserService.getByIdNumber(memberQuery.trim());
    if (!found) return Alert.alert('Not Found', 'No member with that ID');
    setMember(found);
  };

  const lookupBook = async () => {
    if (!bookQuery.trim()) return;
    const db_books = await BookService.search(1, bookQuery.trim());
    if (!db_books.length) return Alert.alert('Not Found', 'No book found');
    setBook(db_books[0]);
  };

  const handleCheckout = async () => {
    if (!member || !book) return Alert.alert('Error', 'Please select a member and book');
    setLoading(true);
    try {
      const canBorrow = await BorrowService.canBorrow(member.id);
      if (!canBorrow.allowed) return Alert.alert('Cannot Borrow', canBorrow.reason);

      const copy = await BookService.getAvailableCopy(book.id);
      if (!copy) return Alert.alert('Unavailable', 'No available copies of this book');

      await BorrowService.borrowBook(copy.id, member.id);
      Alert.alert('Success', `"${book.title}" checked out to ${member.name}`);
      setMember(null);
      setBook(null);
      setMemberQuery('');
      setBookQuery('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.form}>
      <Text style={styles.stepLabel}>1. Find Member</Text>
      <View style={styles.row}>
        <TextInput style={[styles.input, { flex: 1 }]} value={memberQuery} onChangeText={setMemberQuery} placeholder="Enter member ID number" />
        <TouchableOpacity style={styles.lookupBtn} onPress={lookupMember}>
          <Text style={styles.lookupBtnText}>Find</Text>
        </TouchableOpacity>
      </View>
      {member && <ResultCard label={member.name} sub={`${member.role} • ID: ${member.id_number}`} color="#EFF6FF" />}

      <Text style={styles.stepLabel}>2. Find Book</Text>
      <View style={styles.row}>
        <TextInput style={[styles.input, { flex: 1 }]} value={bookQuery} onChangeText={setBookQuery} placeholder="Title, author, or ISBN" />
        <TouchableOpacity style={styles.lookupBtn} onPress={lookupBook}>
          <Text style={styles.lookupBtnText}>Find</Text>
        </TouchableOpacity>
      </View>
      {book && <ResultCard label={book.title} sub={`${book.author} • ${book.available_copies} available`} color={book.available_copies > 0 ? '#F0FDF4' : '#FEF2F2'} />}

      <TouchableOpacity style={[styles.actionBtn, { opacity: (member && book) ? 1 : 0.5 }]} onPress={handleCheckout} disabled={loading || !member || !book}>
        <Text style={styles.actionBtnText}>{loading ? 'Processing...' : 'Check Out Book'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function ReturnForm() {
  const [memberQuery, setMemberQuery] = useState('');
  const [member, setMember] = useState<User | null>(null);
  const [activeBorrows, setActiveBorrows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const lookupMember = async () => {
    const found = await UserService.getByIdNumber(memberQuery.trim());
    if (!found) return Alert.alert('Not Found', 'No member with that ID');
    setMember(found);
    const borrows = await BorrowService.getActiveByUser(found.id);
    setActiveBorrows(borrows);
  };

  const handleReturn = async (borrowId: number, bookTitle: string) => {
    setLoading(true);
    try {
      const fine = await BorrowService.returnBook(borrowId);
      if (fine) {
        Alert.alert('Book Returned', `"${bookTitle}" returned.\nFine: ₱${fine.amount.toFixed(2)}`);
      } else {
        Alert.alert('Book Returned', `"${bookTitle}" returned successfully.`);
      }
      if (member) {
        const borrows = await BorrowService.getActiveByUser(member.id);
        setActiveBorrows(borrows);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.form}>
      <Text style={styles.stepLabel}>Find Member</Text>
      <View style={styles.row}>
        <TextInput style={[styles.input, { flex: 1 }]} value={memberQuery} onChangeText={setMemberQuery} placeholder="Enter member ID number" />
        <TouchableOpacity style={styles.lookupBtn} onPress={lookupMember}>
          <Text style={styles.lookupBtnText}>Find</Text>
        </TouchableOpacity>
      </View>
      {member && <ResultCard label={member.name} sub={`${activeBorrows.length} books borrowed`} color="#EFF6FF" />}

      {activeBorrows.map(b => (
        <View key={b.id} style={styles.borrowItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.borrowTitle}>{b.book_title}</Text>
            <Text style={styles.borrowDue}>Due: {new Date(b.due_date).toLocaleDateString()}</Text>
            {new Date(b.due_date) < new Date() && <Text style={styles.overdue}>OVERDUE</Text>}
          </View>
          <TouchableOpacity style={styles.returnBtn} onPress={() => handleReturn(b.id, b.book_title)} disabled={loading}>
            <Text style={styles.returnBtnText}>Return</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

function ResultCard({ label, sub, color }: { label: string; sub: string; color: string }) {
  return (
    <View style={[styles.resultCard, { backgroundColor: color }]}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={styles.resultSub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#FFFFFF', padding: 16, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title: { fontSize: 20, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
  toggle: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 8, padding: 3 },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  toggleActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, elevation: 2 },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  toggleTextActive: { color: '#2563EB' },
  form: { padding: 16 },
  stepLabel: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 8, marginTop: 16 },
  row: { flexDirection: 'row', gap: 8 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, fontSize: 15 },
  lookupBtn: { backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  lookupBtnText: { color: '#FFFFFF', fontWeight: '600' },
  resultCard: { borderRadius: 10, padding: 12, marginTop: 8 },
  resultLabel: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  resultSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  actionBtn: { backgroundColor: '#2563EB', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 24 },
  actionBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  borrowItem: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14, marginTop: 10, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  borrowTitle: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  borrowDue: { fontSize: 12, color: '#64748B', marginTop: 2 },
  overdue: { fontSize: 11, fontWeight: '700', color: '#DC2626', marginTop: 2 },
  returnBtn: { backgroundColor: '#16A34A', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  returnBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
});
