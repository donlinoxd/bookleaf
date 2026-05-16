import { useState, useCallback } from 'react';
import { FlatList, Image, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BookService } from '../../src/services/BookService';
import { useAppStore } from '../../src/store/appStore';
import { Book } from '../../src/types';

import MASCOT from '../../assets/images/bookleaf-mascot.png';

export default function OPACScreen() {
  const router = useRouter();
  const institution = useAppStore((s) => s.institution);
  const settings = useAppStore((s) => s.settings);
  const [books, setBooks] = useState<Book[]>([]);
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!institution || !query.trim()) return;
    setLoading(true);
    const results = await BookService.search(institution.id, query.trim());
    setBooks(results);
    setSearched(true);
    setLoading(false);
  }, [institution, query]);

  const renderBook = ({ item }: { item: Book }) => (
    <TouchableOpacity
      className="bg-white rounded-2xl flex-row p-4 mb-3"
      style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
      onPress={() => router.push(`/(server)/book/${item.id}`)}
      activeOpacity={0.75}
    >
      <View className="w-14 h-[72px] bg-mint rounded-xl items-center justify-center">
        <Text className="text-2xl font-extrabold text-brand">{item.title[0]}</Text>
      </View>
      <View className="flex-1 ml-4">
        <Text className="text-sm font-bold text-[#1C2B1E] leading-5" numberOfLines={2}>{item.title}</Text>
        <Text className="text-xs font-medium text-[#5A7A5E] mt-1">{item.author}</Text>
        <View className="flex-row gap-1.5 mt-1.5 flex-wrap">
          {item.genre && <View className="bg-mint rounded-md px-2 py-0.5"><Text className="text-[10px] font-semibold text-brand">{item.genre}</Text></View>}
          {item.year && <View className="bg-mint rounded-md px-2 py-0.5"><Text className="text-[10px] font-semibold text-brand">{item.year}</Text></View>}
        </View>
        <View className={`self-start rounded-md px-2.5 py-1 mt-2 ${item.available_copies > 0 ? 'bg-mint' : 'bg-red-100'}`}>
          <Text className={`text-xs font-bold ${item.available_copies > 0 ? 'text-brand' : 'text-red-600'}`}>
            {item.available_copies > 0 ? `${item.available_copies} Available` : 'Unavailable'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-bio">
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      <View className="bg-brand px-5 pb-6 rounded-b-[28px]" style={{ paddingTop: 52 }}>
        <View className="flex-row items-end justify-between mb-5">
          <View className="flex-1">
            <Text className="text-2xl font-extrabold text-white">
              {settings?.institution_name ?? 'Library'}
            </Text>
            <Text className="text-xs text-[#A8D5A2] mt-0.5 font-medium uppercase tracking-widest">Public Catalog</Text>
          </View>
          <Image source={MASCOT} className="w-16 h-16 -mb-1" resizeMode="contain" />
        </View>

        <View className="flex-row bg-white rounded-2xl overflow-hidden"
          style={{ elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 }}>
          <TextInput
            className="flex-1 px-4 py-3.5 text-sm text-[#1C2B1E]"
            value={query}
            onChangeText={setQuery}
            placeholder="Search books, authors, genres…"
            placeholderTextColor="#94A3B8"
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <TouchableOpacity className="bg-leaf px-5 justify-center" onPress={handleSearch} disabled={loading}>
            <Text className="text-white font-bold text-sm">{loading ? '…' : 'Search'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={books}
        keyExtractor={(b) => String(b.id)}
        renderItem={renderBook}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        ListHeaderComponent={
          searched && books.length > 0 ? (
            <Text className="text-xs text-[#5A7A5E] font-medium mb-3">
              {books.length} result{books.length !== 1 ? 's' : ''} found
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View className="items-center pt-12 px-8">
            {!searched ? (
              <>
                <Ionicons name="search-outline" size={48} color="#C8DFC5" />
                <Text className="text-base font-bold text-brand mt-3 mb-1">Search the catalog</Text>
                <Text className="text-xs text-[#7A9A7E] text-center">Find books by title, author, or genre</Text>
              </>
            ) : (
              <>
                <Text className="text-base font-bold text-brand mb-1">No results found</Text>
                <Text className="text-xs text-[#7A9A7E]">Try a different search term</Text>
              </>
            )}
          </View>
        }
      />
    </View>
  );
}
