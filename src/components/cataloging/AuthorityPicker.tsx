import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal,
  FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthorityService } from '../../services/AuthorityService';
import { AuthorityName, AuthorityNameType } from '../../types';

interface Props {
  institutionId: number;
  selectedId: number | null;
  selectedName: string;
  onSelect: (id: number, canonicalName: string) => void;
  onClear: () => void;
}

const NAME_TYPE_LABELS: Record<AuthorityNameType, string> = {
  personal: 'Personal',
  corporate: 'Corporate',
  geographic: 'Geographic',
};
const NAME_TYPES: AuthorityNameType[] = ['personal', 'corporate', 'geographic'];

export function AuthorityPicker({ institutionId, selectedId, selectedName, onSelect, onClear }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        className={`flex-row items-center gap-2 px-3 py-2 rounded-xl border ${selectedId ? 'bg-mint border-brand' : 'bg-white border-mint'}`}
        onPress={() => setOpen(true)}
      >
        <Ionicons name="shield-checkmark-outline" size={14} color={selectedId ? '#2A5C33' : '#94A3B8'} />
        <Text className={`text-xs font-semibold flex-1 ${selectedId ? 'text-brand' : 'text-[#94A3B8]'}`} numberOfLines={1}>
          {selectedId ? selectedName : 'Link authority record (optional)'}
        </Text>
        {selectedId && (
          <TouchableOpacity onPress={onClear} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="#2A5C33" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      <AuthorityPickerModal
        visible={open}
        institutionId={institutionId}
        onClose={() => setOpen(false)}
        onSelect={(rec) => { onSelect(rec.id, rec.name); setOpen(false); }}
      />
    </>
  );
}

function AuthorityPickerModal({
  visible, institutionId, onClose, onSelect,
}: {
  visible: boolean;
  institutionId: number;
  onClose: () => void;
  onSelect: (rec: AuthorityName) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AuthorityName[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<AuthorityNameType>('personal');

  useEffect(() => {
    if (!visible) return;
    load('');
  }, [visible]);

  const load = async (q: string) => {
    setLoading(true);
    try {
      const rows = q.trim()
        ? await AuthorityService.searchByName(institutionId, q)
        : await AuthorityService.getAll(institutionId);
      setResults(rows);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (text: string) => {
    setQuery(text);
    load(text);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setLoading(true);
    try {
      const id = await AuthorityService.create(institutionId, name, newType);
      const record: AuthorityName = { id, institution_id: institutionId, name, name_type: newType, variants: null, created_at: '' };
      onSelect(record);
      setCreating(false);
      setNewName('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View className="flex-1 bg-bio">
        {/* Header */}
        <View className="bg-brand flex-row items-center justify-between px-5 pb-4 pt-5 rounded-b-[20px]">
          <TouchableOpacity onPress={onClose}>
            <Text className="text-[#A8D5A2] text-sm font-medium">Cancel</Text>
          </TouchableOpacity>
          <Text className="text-white font-extrabold text-base">Authority Records</Text>
          <TouchableOpacity onPress={() => { setCreating(true); setQuery(''); }}>
            <Text className="text-[#A8D5A2] text-sm font-bold">+ New</Text>
          </TouchableOpacity>
        </View>

        {creating ? (
          <View className="p-4 gap-3">
            <View className="bg-white rounded-2xl p-4 gap-3"
              style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
              <Text className="text-xs font-bold text-brand uppercase tracking-widest">New Authority Record</Text>
              <TextInput
                className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
                value={newName}
                onChangeText={setNewName}
                placeholder="Canonical name (e.g. Tolstoy, Leo)"
                placeholderTextColor="#94A3B8"
                autoFocus
              />
              <View className="flex-row gap-2">
                {NAME_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setNewType(t)}
                    className={`flex-1 py-2 rounded-xl items-center border ${newType === t ? 'bg-brand border-brand' : 'bg-white border-mint'}`}
                  >
                    <Text className={`text-xs font-bold ${newType === t ? 'text-white' : 'text-brand'}`}>{NAME_TYPE_LABELS[t]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="flex-1 bg-mint py-3 rounded-xl items-center"
                  onPress={() => setCreating(false)}
                >
                  <Text className="text-sm font-bold text-brand">Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 bg-brand py-3 rounded-xl items-center"
                  onPress={handleCreate}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text className="text-sm font-bold text-white">Create</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View className="flex-1 p-4 gap-3">
            <TextInput
              className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
              value={query}
              onChangeText={handleSearch}
              placeholder="Search authority records…"
              placeholderTextColor="#94A3B8"
              autoFocus
            />
            {loading
              ? <ActivityIndicator color="#2A5C33" style={{ marginTop: 24 }} />
              : results.length === 0
                ? (
                  <Text className="text-sm text-[#94A3B8] text-center mt-6">
                    {query ? 'No matches. Tap + New to create one.' : 'No authority records yet. Tap + New to add one.'}
                  </Text>
                )
                : (
                  <FlatList
                    data={results}
                    keyExtractor={(r) => String(r.id)}
                    ItemSeparatorComponent={() => <View className="h-px bg-[#F1F5F9]" />}
                    className="bg-white rounded-2xl overflow-hidden"
                    style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        className="flex-row items-center px-4 py-3 gap-3"
                        onPress={() => onSelect(item)}
                      >
                        <View className="w-8 h-8 rounded-full bg-mint items-center justify-center">
                          <Ionicons
                            name={item.name_type === 'personal' ? 'person-outline' : item.name_type === 'corporate' ? 'business-outline' : 'location-outline'}
                            size={14} color="#2A5C33"
                          />
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-[#1C2B1E]">{item.name}</Text>
                          <Text className="text-xs text-[#94A3B8] mt-0.5">{NAME_TYPE_LABELS[item.name_type]}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#C8DFC5" />
                      </TouchableOpacity>
                    )}
                  />
                )
            }
          </View>
        )}
      </View>
    </Modal>
  );
}
