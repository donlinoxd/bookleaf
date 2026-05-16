import { useState } from 'react';
import { FlatList, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
    <TouchableOpacity
      className="bg-white rounded-2xl flex-row p-4 mb-3"
      style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
      onPress={() => router.push(`/(server)/book/${item.id}`)}
      activeOpacity={0.75}
    >
      <View className="w-12 h-16 bg-mint rounded-xl items-center justify-center">
        <Text className="text-xl font-extrabold text-brand">{item.title[0]}</Text>
      </View>
      <View className="flex-1 ml-3">
        <Text className="text-sm font-bold text-[#1C2B1E] leading-5" numberOfLines={2}>{item.title}</Text>
        <Text className="text-xs text-[#5A7A5E] mt-1 font-medium">{item.author}</Text>
        {item.genre && <Text className="text-xs text-[#94A3B8] mt-0.5">{item.genre}</Text>}
        <View className="flex-row items-center gap-2 mt-2">
          <View className={`rounded-md px-2 py-0.5 ${item.available_copies > 0 ? 'bg-mint' : 'bg-red-100'}`}>
            <Text className={`text-xs font-bold ${item.available_copies > 0 ? 'text-brand' : 'text-red-600'}`}>
              {item.available_copies > 0 ? `${item.available_copies} available` : 'Unavailable'}
            </Text>
          </View>
          <Text className="text-xs text-[#94A3B8]">{item.total_copies} total</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#C8DFC5" style={{ alignSelf: 'center' }} />
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-bio">
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      <View className="bg-brand px-5 pb-5 rounded-b-[28px]" style={{ paddingTop: 52 }}>
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-2xl font-extrabold text-white">Books</Text>
          <TouchableOpacity
            className="bg-leaf rounded-xl px-4 py-2 flex-row items-center gap-1"
            onPress={() => router.push('/(server)/book/add')}
            style={{ elevation: 3, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 }}
          >
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text className="text-white font-bold text-sm">Add Book</Text>
          </TouchableOpacity>
        </View>
        <View className="bg-white rounded-2xl flex-row items-center px-3 overflow-hidden">
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            className="flex-1 px-2 py-3 text-sm text-[#1C2B1E]"
            value={query}
            onChangeText={setQuery}
            placeholder="Search title, author, ISBN, genre…"
            placeholderTextColor="#94A3B8"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <FlatList
        data={books}
        keyExtractor={(b) => String(b.id)}
        renderItem={renderBook}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        onRefresh={refetch}
        refreshing={isFetching}
        ListEmptyComponent={
          <View className="items-center pt-16">
            <Ionicons name="book-outline" size={48} color="#C8DFC5" />
            <Text className="text-sm text-[#94A3B8] mt-3">
              {isFetching ? 'Loading…' : 'No books found'}
            </Text>
          </View>
        }
      />
    </View>
  );
}
