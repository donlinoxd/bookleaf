import { useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StatusBar,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';

interface BorrowInfo {
  id: number;
  resource_id: number;
  book_title: string;
  book_author: string;
  due_date: string;
  returned_at: string | null;
  renewal_count: number;
}

interface Reservation {
  id: number;
  resource_id: number;
  book_title: string;
  book_author: string;
  reserved_at: string;
  status: string;
  available_copies: number;
}

interface Favorite {
  id: number;
  resource_id: number;
  book_title: string;
  book_author: string;
  available_copies: number;
}

export default function MyBooksScreen() {
  const serverUrl = useAppStore((s) => s.serverUrl);
  const router = useRouter();
  const [idNumber, setIdNumber] = useState('');
  const [borrows, setBorrows] = useState<BorrowInfo[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [fines, setFines] = useState<number>(0);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [renewingId, setRenewingId] = useState<number | null>(null);

  const handleLookup = async () => {
    const idn = idNumber.trim();
    if (!idn || !serverUrl) return;
    setLoading(true);
    try {
      const [borrowRes, resRes, favRes] = await Promise.all([
        fetch(`${serverUrl}/api/members/${encodeURIComponent(idn)}/borrows`),
        fetch(`${serverUrl}/api/members/${encodeURIComponent(idn)}/reservations`),
        fetch(`${serverUrl}/api/members/${encodeURIComponent(idn)}/favorites`),
      ]);
      if (!borrowRes.ok) { Alert.alert('Not Found', 'No member found with that ID'); return; }
      const borrowData = await borrowRes.json();
      setBorrows(borrowData.borrows);
      setFines(borrowData.total_fines ?? 0);
      if (resRes.ok) { const rd = await resRes.json(); setReservations(rd.reservations ?? []); }
      if (favRes.ok) { const fd = await favRes.json(); setFavorites(fd.favorites ?? []); }
      setSearched(true);
    } catch {
      Alert.alert('Error', 'Could not reach the library server.');
    } finally {
      setLoading(false);
    }
  };

  const handleRenew = async (borrowId: number) => {
    const idn = idNumber.trim();
    if (!idn || !serverUrl) return;
    setRenewingId(borrowId);
    try {
      const res = await fetch(`${serverUrl}/api/borrows/${borrowId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idNumber: idn }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBorrows(prev => prev.map(b =>
        b.id === borrowId
          ? { ...b, due_date: data.new_due_date, renewal_count: b.renewal_count + 1 }
          : b
      ));
      Alert.alert('Renewed', `New due date: ${new Date(data.new_due_date).toLocaleDateString()}`);
    } catch (e: any) {
      Alert.alert('Cannot Renew', e.message);
    } finally {
      setRenewingId(null);
    }
  };

  const isOverdue = (dueDate: string) => new Date(dueDate) < new Date();
  const active = borrows.filter((b) => !b.returned_at);
  const history = borrows.filter((b) => !!b.returned_at);

  return (
    <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ paddingBottom: 110 }}>
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      <View className="bg-brand px-5 pb-5 pt-[52px] rounded-b-[28px]">
        <Text className="text-2xl font-extrabold text-white mb-1">My Account</Text>
        <Text className="text-xs text-[#A8D5A2] mb-4">Enter your ID to view your library account</Text>
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
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white font-bold text-sm">Look up</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {!searched ? (
        <View className="items-center pt-12 px-8">
          <Ionicons name="person-circle-outline" size={56} color="#C8DFC5" />
          <Text className="text-sm font-bold text-brand mt-3 mb-1">View your account</Text>
          <Text className="text-xs text-[#7A9A7E] text-center">Enter your ID number to see borrows, holds, and favorites</Text>
        </View>
      ) : (
        <View className="px-4 pt-4 gap-4">
          {fines > 0 && (
            <View className="bg-red-50 border-l-4 border-red-500 rounded-r-2xl px-4 py-3">
              <Text className="text-sm font-bold text-red-600">Outstanding fines: ₱{fines.toFixed(2)}</Text>
              <Text className="text-xs text-red-400 mt-0.5">Please settle with the librarian</Text>
            </View>
          )}

          {/* Active borrows */}
          {active.length > 0 && (
            <View className="gap-2">
              <View className="flex-row items-center gap-2">
                <View className="w-2 h-2 rounded-full bg-leaf" />
                <Text className="text-xs font-bold text-brand uppercase tracking-wider">Currently Borrowed</Text>
              </View>
              {active.map((item) => {
                const overdue = isOverdue(item.due_date);
                return (
                  <View key={item.id} className="bg-white rounded-2xl px-4 py-3.5"
                    style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
                    <TouchableOpacity onPress={() => router.push(`/(client)/book/${item.resource_id}`)}>
                      <Text className="text-sm font-bold text-[#1C2B1E]" numberOfLines={1}>{item.book_title}</Text>
                      <Text className="text-xs text-[#5A7A5E] mt-0.5">{item.book_author}</Text>
                    </TouchableOpacity>
                    <View className="flex-row items-center justify-between mt-2">
                      <Text className={`text-xs font-semibold ${overdue ? 'text-red-600' : 'text-[#7A9A7E]'}`}>
                        {overdue ? 'OVERDUE — ' : ''}Due {new Date(item.due_date).toLocaleDateString()}
                      </Text>
                      <Text className="text-[10px] text-[#94A3B8]">Renewed {item.renewal_count}×</Text>
                    </View>
                    <TouchableOpacity
                      className="mt-2.5 bg-mint border border-[#C8DFC5] rounded-xl py-2 items-center"
                      onPress={() => handleRenew(item.id)}
                      disabled={renewingId === item.id}
                    >
                      {renewingId === item.id
                        ? <ActivityIndicator color="#2A5C33" size="small" />
                        : <Text className="text-xs font-bold text-brand">Renew</Text>}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Holds / Reservations */}
          {reservations.length > 0 && (
            <View className="gap-2">
              <View className="flex-row items-center gap-2">
                <View className="w-2 h-2 rounded-full bg-amber-400" />
                <Text className="text-xs font-bold text-brand uppercase tracking-wider">Active Holds</Text>
              </View>
              {reservations.map((item) => (
                <View key={item.id} className="bg-white rounded-2xl px-4 py-3.5 flex-row items-center gap-3"
                  style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
                  <View className="w-9 h-9 rounded-full bg-amber-50 items-center justify-center">
                    <Ionicons name="bookmark" size={16} color="#D97706" />
                  </View>
                  <TouchableOpacity className="flex-1" onPress={() => router.push(`/(client)/book/${item.resource_id}`)}>
                    <Text className="text-sm font-bold text-[#1C2B1E]" numberOfLines={1}>{item.book_title}</Text>
                    <Text className="text-xs text-[#5A7A5E]">{item.book_author}</Text>
                    <Text className="text-xs text-[#94A3B8] mt-0.5">
                      Placed {new Date(item.reserved_at).toLocaleDateString()}
                      {item.available_copies > 0 ? ' · Now available!' : ''}
                    </Text>
                  </TouchableOpacity>
                  {item.available_copies > 0 && (
                    <View className="bg-leaf rounded-full w-2 h-2" />
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Favorites */}
          {favorites.length > 0 && (
            <View className="gap-2">
              <View className="flex-row items-center gap-2">
                <View className="w-2 h-2 rounded-full bg-red-400" />
                <Text className="text-xs font-bold text-brand uppercase tracking-wider">Saved Favorites</Text>
              </View>
              {favorites.map((item) => (
                <TouchableOpacity key={item.id}
                  className="bg-white rounded-2xl px-4 py-3.5 flex-row items-center gap-3"
                  style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                  onPress={() => router.push(`/(client)/book/${item.resource_id}`)}
                >
                  <View className="w-9 h-9 rounded-full bg-red-50 items-center justify-center">
                    <Ionicons name="heart" size={16} color="#EF4444" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-[#1C2B1E]" numberOfLines={1}>{item.book_title}</Text>
                    <Text className="text-xs text-[#5A7A5E]">{item.book_author}</Text>
                  </View>
                  <View className={`rounded-md px-2 py-0.5 ${item.available_copies > 0 ? 'bg-mint' : 'bg-red-100'}`}>
                    <Text className={`text-[10px] font-bold ${item.available_copies > 0 ? 'text-brand' : 'text-red-600'}`}>
                      {item.available_copies > 0 ? 'Available' : 'Unavailable'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Borrow history */}
          {history.length > 0 && (
            <View className="gap-2">
              <View className="flex-row items-center gap-2">
                <View className="w-2 h-2 rounded-full bg-[#C8DFC5]" />
                <Text className="text-xs font-bold text-brand uppercase tracking-wider">Reading History</Text>
              </View>
              {history.map((item) => (
                <TouchableOpacity key={item.id}
                  className="bg-white rounded-2xl px-4 py-3.5 flex-row items-center gap-3"
                  style={{ elevation: 1 }}
                  onPress={() => router.push(`/(client)/book/${item.resource_id}`)}
                >
                  <View className="w-9 h-9 rounded-full bg-[#E2EFE0] items-center justify-center">
                    <Ionicons name="checkmark" size={16} color="#2A5C33" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-[#1C2B1E]" numberOfLines={1}>{item.book_title}</Text>
                    <Text className="text-xs text-[#5A7A5E]">{item.book_author}</Text>
                    <Text className="text-xs text-leaf font-medium mt-0.5">
                      Returned {new Date(item.returned_at!).toLocaleDateString()}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {active.length === 0 && reservations.length === 0 && favorites.length === 0 && history.length === 0 && (
            <View className="items-center py-10 gap-2">
              <Ionicons name="bookmark-outline" size={48} color="#C8DFC5" />
              <Text className="text-sm text-[#94A3B8]">No activity found</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}
