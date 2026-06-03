import { useState } from 'react';
import { Alert, FlatList, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ReservationService } from '../../src/services/ReservationService';
import { UserService } from '../../src/services/UserService';
import { ResourceService } from '../../src/services/ResourceService';
import { useAppStore } from '../../src/store/appStore';
import { User, Resource } from '@bookleaf/types';
import { queryKeys } from '../../src/lib/queryKeys';

export default function ReservationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const institution = useAppStore((s) => s.institution);
  const institutionId = institution?.id ?? 0;

  const [memberQuery, setMemberQuery] = useState('');
  const [resourceQuery, setResourceQuery] = useState('');
  const [member, setMember] = useState<User | null>(null);
  const [resource, setResource] = useState<Resource | null>(null);

  const { data: allHolds = [], isLoading } = useQuery({
    queryKey: queryKeys.reservations(institutionId),
    queryFn: () => ReservationService.getAll(institutionId),
    enabled: !!institutionId,
  });

  const reserveMutation = useMutation({
    mutationFn: () => ReservationService.reserve(resource!.id, member!.id),
    onSuccess: () => {
      Alert.alert('Hold Placed', `Hold placed for ${member!.name} on "${resource!.title}"`);
      setMember(null); setResource(null); setMemberQuery(''); setResourceQuery('');
      queryClient.invalidateQueries({ queryKey: queryKeys.reservations(institutionId) });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => ReservationService.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.reservations(institutionId) }),
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const lookupMember = async () => {
    const q = memberQuery.trim();
    if (!q) return;
    const found = await UserService.getByIdNumber(q);
    if (!found) return Alert.alert('Not Found', 'No member with that ID');
    setMember(found);
  };

  const lookupResource = async () => {
    const q = resourceQuery.trim();
    if (!q) return;
    const results = await ResourceService.search(institutionId, q);
    if (!results.length) return Alert.alert('Not Found', 'No resource found');
    setResource(results[0]);
  };

  const grouped = allHolds.reduce<Record<string, typeof allHolds>>((acc, h) => {
    const key = String(h.resource_id);
    if (!acc[key]) acc[key] = [];
    acc[key].push(h);
    return acc;
  }, {});

  return (
    <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ paddingBottom: 150 }}>
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      <View className="bg-brand px-5 pb-5 pt-[52px] rounded-b-[28px]">
        <View className="flex-row items-center gap-2 mb-4">
          <TouchableOpacity onPress={() => router.back()} className="flex-row items-center gap-1">
            <Ionicons name="chevron-back" size={20} color="#A8D5A2" />
            <Text className="text-[#A8D5A2] text-sm font-medium">Back</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-2xl font-extrabold text-white">Holds / Reservations</Text>
        <Text className="text-xs text-[#A8D5A2] mt-1">{allHolds.length} active hold{allHolds.length !== 1 ? 's' : ''}</Text>
      </View>

      <View className="px-4 pt-4 gap-4">
        {/* Place a new hold */}
        <View className="bg-white rounded-2xl p-4 gap-3"
          style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
          <Text className="text-sm font-bold text-[#1C2B1E]">Place a Hold</Text>

          <View className="gap-2">
            <Text className="text-xs font-bold text-brand uppercase tracking-wider">Member</Text>
            <View className="flex-row gap-2">
              <TextInput
                className="flex-1 bg-bio border border-mint rounded-xl px-3 py-3 text-sm text-[#1C2B1E]"
                value={memberQuery}
                onChangeText={setMemberQuery}
                placeholder="Member ID number"
                placeholderTextColor="#94A3B8"
              />
              <TouchableOpacity className="bg-leaf rounded-xl px-4 justify-center" onPress={lookupMember}>
                <Text className="text-white font-bold text-sm">Find</Text>
              </TouchableOpacity>
            </View>
            {member && (
              <View className="bg-mint rounded-xl px-3 py-2 flex-row items-center gap-2">
                <Ionicons name="person-circle-outline" size={16} color="#2A5C33" />
                <Text className="text-sm font-semibold text-brand flex-1">{member.name}</Text>
                <TouchableOpacity onPress={() => setMember(null)}>
                  <Ionicons name="close-circle" size={16} color="#2A5C33" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View className="gap-2">
            <Text className="text-xs font-bold text-brand uppercase tracking-wider">Resource</Text>
            <View className="flex-row gap-2">
              <TextInput
                className="flex-1 bg-bio border border-mint rounded-xl px-3 py-3 text-sm text-[#1C2B1E]"
                value={resourceQuery}
                onChangeText={setResourceQuery}
                placeholder="Title, author, or ISBN"
                placeholderTextColor="#94A3B8"
              />
              <TouchableOpacity className="bg-leaf rounded-xl px-4 justify-center" onPress={lookupResource}>
                <Text className="text-white font-bold text-sm">Find</Text>
              </TouchableOpacity>
            </View>
            {resource && (
              <View className={`rounded-xl px-3 py-2 flex-row items-center gap-2 ${resource.available_copies > 0 ? 'bg-mint' : 'bg-orange-50'}`}>
                <Ionicons name="book-outline" size={16} color={resource.available_copies > 0 ? '#2A5C33' : '#C2410C'} />
                <View className="flex-1">
                  <Text className={`text-sm font-semibold ${resource.available_copies > 0 ? 'text-brand' : 'text-orange-700'}`}>{resource.title}</Text>
                  <Text className="text-xs text-[#7A9A7E]">{resource.available_copies} available</Text>
                </View>
                <TouchableOpacity onPress={() => setResource(null)}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <TouchableOpacity
            className="bg-brand rounded-xl py-3.5 items-center"
            style={{ opacity: member && resource ? 1 : 0.4 }}
            onPress={() => reserveMutation.mutate()}
            disabled={!member || !resource || reserveMutation.isPending}
          >
            {reserveMutation.isPending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text className="text-white font-bold">Place Hold</Text>}
          </TouchableOpacity>
        </View>

        {/* Active holds list */}
        {isLoading ? (
          <ActivityIndicator color="#2A5C33" style={{ marginTop: 24 }} />
        ) : Object.keys(grouped).length === 0 ? (
          <View className="items-center py-10 gap-2">
            <Ionicons name="bookmark-outline" size={40} color="#C8DFC5" />
            <Text className="text-sm text-[#94A3B8]">No active holds</Text>
          </View>
        ) : (
          Object.entries(grouped).map(([, queue]) => (
            <View key={queue[0].resource_id} className="bg-white rounded-2xl p-4 gap-3"
              style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
              <View className="flex-row items-start gap-2">
                <Ionicons name="book-outline" size={16} color="#2A5C33" style={{ marginTop: 2 }} />
                <View className="flex-1">
                  <Text className="text-sm font-bold text-[#1C2B1E]">{queue[0].book_title}</Text>
                  <Text className="text-xs text-[#7A9A7E]">{queue[0].book_author}</Text>
                </View>
                <View className="bg-mint rounded-full px-2.5 py-1">
                  <Text className="text-xs font-bold text-brand">{queue.length} hold{queue.length > 1 ? 's' : ''}</Text>
                </View>
              </View>

              {queue.map((h, idx) => (
                <View key={h.id} className="flex-row items-center gap-2 pt-2 border-t border-[#F1F5F9]">
                  <View className="w-6 h-6 rounded-full bg-mint items-center justify-center">
                    <Text className="text-[10px] font-extrabold text-brand">{idx + 1}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-[#1C2B1E]">{h.member_name}</Text>
                    <Text className="text-xs text-[#94A3B8]">{h.member_id_number} · {new Date(h.reserved_at).toLocaleDateString()}</Text>
                  </View>
                  <TouchableOpacity
                    className="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5"
                    onPress={() => Alert.alert('Cancel Hold', `Remove hold for ${h.member_name}?`, [
                      { text: 'No', style: 'cancel' },
                      { text: 'Cancel Hold', style: 'destructive', onPress: () => cancelMutation.mutate(h.id) },
                    ])}
                  >
                    <Text className="text-xs font-bold text-red-600">Cancel</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
