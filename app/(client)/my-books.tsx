import { useState } from 'react';
import { Alert, FlatList, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

  const active = borrows.filter((b) => !b.returned_at);

  return (
    <View className="flex-1 bg-bio">
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      <View className="bg-brand px-5 pb-5 rounded-b-[28px]" style={{ paddingTop: 52 }}>
        <Text className="text-2xl font-extrabold text-white mb-1">My Books</Text>
        <Text className="text-xs text-[#A8D5A2] mb-4">Enter your ID to view borrowed books</Text>
        <View className="flex-row bg-white rounded-2xl overflow-hidden"
          style={{ elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 }}>
          <TextInput
            className="flex-1 px-4 py-3.5 text-sm text-[#1C2B1E]"
            value={idNumber}
            onChangeText={setIdNumber}
            placeholder="Your ID number"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={handleLookup}
          />
          <TouchableOpacity className="bg-leaf px-5 justify-center" onPress={handleLookup} disabled={loading}>
            <Text className="text-white font-bold text-sm">{loading ? '…' : 'Look up'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={borrows}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 10 }}
        ListHeaderComponent={
          searched ? (
            <>
              {fines > 0 && (
                <View className="bg-red-50 border-l-4 border-red-500 rounded-r-2xl px-4 py-3 mb-2">
                  <Text className="text-sm font-bold text-red-600">Outstanding fines: ₱{fines.toFixed(2)}</Text>
                  <Text className="text-xs text-red-400 mt-0.5">Please settle with the librarian</Text>
                </View>
              )}
              {active.length > 0 && (
                <View className="flex-row items-center gap-2 mb-2 mt-1">
                  <View className="w-2 h-2 rounded-full bg-leaf" />
                  <Text className="text-xs font-bold text-brand uppercase tracking-wider">Currently Borrowed</Text>
                </View>
              )}
            </>
          ) : null
        }
        renderItem={({ item }) => {
          const overdue = !item.returned_at && isOverdue(item.due_date);
          const done = !!item.returned_at;
          return (
            <View className="bg-white rounded-2xl px-4 py-3.5 flex-row items-center"
              style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
              <View className={`w-9 h-9 rounded-full items-center justify-center mr-3 ${done ? 'bg-[#E2EFE0]' : overdue ? 'bg-red-100' : 'bg-mint'}`}>
                <Ionicons
                  name={done ? 'checkmark' : overdue ? 'alert' : 'book'}
                  size={16}
                  color={done ? '#2A5C33' : overdue ? '#DC2626' : '#2A5C33'}
                />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-[#1C2B1E]" numberOfLines={1}>{item.book_title}</Text>
                <Text className="text-xs text-[#5A7A5E] mt-0.5">{item.book_author}</Text>
                {done ? (
                  <Text className="text-xs text-leaf font-medium mt-1">
                    Returned {new Date(item.returned_at!).toLocaleDateString()}
                  </Text>
                ) : (
                  <Text className={`text-xs font-semibold mt-1 ${overdue ? 'text-red-600' : 'text-[#7A9A7E]'}`}>
                    {overdue ? 'OVERDUE — ' : ''}Due {new Date(item.due_date).toLocaleDateString()}
                  </Text>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          searched ? (
            <View className="items-center pt-12">
              <Ionicons name="bookmark-outline" size={48} color="#C8DFC5" />
              <Text className="text-sm text-[#94A3B8] mt-3">No borrowed books found</Text>
            </View>
          ) : (
            <View className="items-center pt-12">
              <Ionicons name="search-outline" size={48} color="#C8DFC5" />
              <Text className="text-sm font-bold text-brand mt-3 mb-1">Look up your account</Text>
              <Text className="text-xs text-[#7A9A7E] text-center">Enter your ID number above to see your borrowed books</Text>
            </View>
          )
        }
      />
    </View>
  );
}
