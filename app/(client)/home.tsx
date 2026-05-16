import { useState, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, Alert, Image, StatusBar } from 'react-native';
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

const MASCOT = require('../../assets/images/bookleaf-mascot.png');

export default function ClientHomeScreen() {
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
    <View className="bg-white rounded-2xl flex-row p-4 mb-3 shadow-sm"
      style={{ shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 }}>
      <View className="w-14 h-[72px] bg-mint rounded-xl items-center justify-center">
        <Text className="text-2xl font-extrabold text-brand">{item.title[0]}</Text>
      </View>
      <View className="flex-1 ml-4">
        <Text className="text-base font-bold text-[#1C2B1E] leading-5" numberOfLines={2}>
          {item.title}
        </Text>
        <Text className="text-sm font-medium text-[#5A7A5E] mt-1">{item.author}</Text>
        <View className="flex-row flex-wrap gap-1.5 mt-2">
          {item.genre && (
            <View className="bg-mint rounded-md px-2 py-0.5">
              <Text className="text-xs font-semibold text-brand">{item.genre}</Text>
            </View>
          )}
          {item.year && (
            <View className="bg-mint rounded-md px-2 py-0.5">
              <Text className="text-xs font-semibold text-brand">{item.year}</Text>
            </View>
          )}
        </View>
        <View className={`self-start rounded-md px-2.5 py-1 mt-2 ${item.available_copies > 0 ? 'bg-mint' : 'bg-red-100'}`}>
          <Text className={`text-xs font-bold ${item.available_copies > 0 ? 'text-brand' : 'text-red-600'}`}>
            {item.available_copies > 0 ? `${item.available_copies} Available` : 'Unavailable'}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-bio">
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      {/* Header */}
      <View className="bg-brand px-5 pb-6 rounded-b-[28px]" style={{ paddingTop: 52 }}>
        <View className="flex-row items-end mb-5">
          <View className="flex-1">
            <Text className="text-xs font-semibold text-[#A8D5A2] tracking-widest uppercase mb-1">
              Welcome to
            </Text>
            <Text className="text-3xl font-extrabold text-white leading-9">
              BookLeaf{'\n'}Library
            </Text>
          </View>
          <Image source={MASCOT} className="w-24 h-24 -mb-2" resizeMode="contain" />
        </View>

        {/* Search bar */}
        <View className="flex-row bg-white rounded-2xl overflow-hidden"
          style={{ elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6 }}>
          <TextInput
            className="flex-1 px-4 py-3.5 text-[15px] text-slate-800"
            value={query}
            onChangeText={setQuery}
            placeholder="Search books, authors, genres…"
            placeholderTextColor="#94A3B8"
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <TouchableOpacity
            className="bg-leaf px-5 justify-center"
            onPress={handleSearch}
            disabled={loading}
          >
            <Text className="text-white font-bold text-sm">{loading ? '…' : 'Search'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Results */}
      <FlatList
        data={books}
        keyExtractor={(b) => String(b.id)}
        renderItem={renderBook}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          searched && books.length > 0 ? (
            <Text className="text-sm text-slate-500 font-medium mb-3">
              {books.length} result{books.length !== 1 ? 's' : ''} found
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View className="items-center pt-12 px-8">
            {!searched ? (
              <>
                <Image source={MASCOT} className="w-36 h-36 mb-4" resizeMode="contain" />
                <Text className="text-lg font-bold text-brand mb-2">Find your next read</Text>
                <Text className="text-sm text-[#7A9A7E] text-center leading-5">
                  Search the catalog by title, author, or genre
                </Text>
              </>
            ) : (
              <>
                <Text className="text-lg font-bold text-brand mb-2">No results found</Text>
                <Text className="text-sm text-[#7A9A7E] text-center">Try a different search term</Text>
              </>
            )}
          </View>
        }
      />
    </View>
  );
}
