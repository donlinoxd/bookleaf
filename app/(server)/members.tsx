import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { UserService } from '../../src/services/UserService';
import { useAppStore } from '../../src/store/appStore';
import { User } from '../../src/types';

export default function MembersScreen() {
  const router = useRouter();
  const institution = useAppStore((s) => s.institution);
  const [members, setMembers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const loadMembers = useCallback(async () => {
    if (!institution) return;
    setLoading(true);
    const results = query.trim()
      ? await UserService.search(institution.id, query)
      : await UserService.getAll(institution.id);
    setMembers(results);
    setLoading(false);
  }, [institution, query]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const roleColor: Record<string, string> = {
    admin: '#7C3AED',
    librarian: '#2563EB',
    member: '#16A34A',
  };

  const renderMember = ({ item }: { item: User }) => (
    <TouchableOpacity style={styles.memberItem} onPress={() => router.push(`/(server)/member/${item.id}`)}>
      <View style={[styles.avatar, { backgroundColor: roleColor[item.role] + '20' }]}>
        <Text style={[styles.avatarText, { color: roleColor[item.role] }]}>
          {item.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{item.name}</Text>
        <Text style={styles.memberId}>ID: {item.id_number}</Text>
        <View style={[styles.roleBadge, { backgroundColor: roleColor[item.role] + '20' }]}>
          <Text style={[styles.roleText, { color: roleColor[item.role] }]}>{item.role}</Text>
        </View>
      </View>
      {!item.is_active && <Text style={styles.inactiveTag}>Inactive</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Members</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/(server)/member/add')}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search name or ID number..."
        clearButtonMode="while-editing"
      />

      <FlatList
        data={members}
        keyExtractor={(m) => String(m.id)}
        renderItem={renderMember}
        contentContainerStyle={styles.list}
        onRefresh={loadMembers}
        refreshing={loading}
        ListEmptyComponent={<Text style={styles.empty}>{loading ? 'Loading...' : 'No members found'}</Text>}
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
  memberItem: { backgroundColor: '#FFFFFF', borderRadius: 12, flexDirection: 'row', padding: 14, alignItems: 'center', elevation: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700' },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberName: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  memberId: { fontSize: 12, color: '#64748B', marginTop: 2 },
  roleBadge: { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  roleText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  inactiveTag: { fontSize: 11, color: '#DC2626', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#94A3B8', marginTop: 60 },
});
