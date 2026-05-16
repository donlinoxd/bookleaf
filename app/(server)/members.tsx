import { useState } from 'react';
import { FlatList, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { UserService } from '../../src/services/UserService';
import { useAppStore } from '../../src/store/appStore';
import { User } from '../../src/types';
import { queryKeys } from '../../src/lib/queryKeys';

const ROLE_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  admin:     { bg: '#EDE9FE', text: '#7C3AED', dot: '#7C3AED' },
  librarian: { bg: '#E2EFE0', text: '#2A5C33', dot: '#2A5C33' },
  member:    { bg: '#DCFCE7', text: '#15803D', dot: '#5CB85C' },
};

export default function MembersScreen() {
  const router = useRouter();
  const institution = useAppStore((s) => s.institution);
  const [query, setQuery] = useState('');

  const { data: members = [], isFetching, refetch } = useQuery({
    queryKey: queryKeys.members(institution?.id ?? 0, query),
    queryFn: () => query.trim()
      ? UserService.search(institution!.id, query)
      : UserService.getAll(institution!.id),
    enabled: !!institution,
  });

  const renderMember = ({ item }: { item: User }) => {
    const rs = ROLE_STYLE[item.role] ?? ROLE_STYLE.member;
    return (
      <TouchableOpacity
        className="bg-white rounded-2xl flex-row items-center p-4 mb-3"
        style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
        onPress={() => router.push(`/(server)/member/${item.id}`)}
        activeOpacity={0.75}
      >
        <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: rs.bg }}>
          <Text className="text-lg font-extrabold" style={{ color: rs.text }}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View className="flex-1 ml-3">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-bold text-[#1C2B1E]">{item.name}</Text>
            {!item.is_active && (
              <View className="bg-red-100 rounded px-1.5 py-0.5">
                <Text className="text-[10px] font-bold text-red-600">Inactive</Text>
              </View>
            )}
          </View>
          <Text className="text-xs text-[#5A7A5E] mt-0.5">ID: {item.id_number}</Text>
          <View className="self-start rounded-md px-2 py-0.5 mt-1" style={{ backgroundColor: rs.bg }}>
            <Text className="text-[10px] font-bold uppercase tracking-wider" style={{ color: rs.text }}>{item.role}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#C8DFC5" />
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 bg-bio">
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      <View className="bg-brand px-5 pb-5 rounded-b-[28px]" style={{ paddingTop: 52 }}>
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-2xl font-extrabold text-white">Members</Text>
          <TouchableOpacity
            className="bg-leaf rounded-xl px-4 py-2 flex-row items-center gap-1"
            onPress={() => router.push('/(server)/member/add')}
            style={{ elevation: 3, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 }}
          >
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text className="text-white font-bold text-sm">Add Member</Text>
          </TouchableOpacity>
        </View>
        <View className="bg-white rounded-2xl flex-row items-center px-3 overflow-hidden">
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            className="flex-1 px-2 py-3 text-sm text-[#1C2B1E]"
            value={query}
            onChangeText={setQuery}
            placeholder="Search name or ID number…"
            placeholderTextColor="#94A3B8"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <FlatList
        data={members}
        keyExtractor={(m) => String(m.id)}
        renderItem={renderMember}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        onRefresh={refetch}
        refreshing={isFetching}
        ListEmptyComponent={
          <View className="items-center pt-16">
            <Ionicons name="people-outline" size={48} color="#C8DFC5" />
            <Text className="text-sm text-[#94A3B8] mt-3">
              {isFetching ? 'Loading…' : 'No members found'}
            </Text>
          </View>
        }
      />
    </View>
  );
}
