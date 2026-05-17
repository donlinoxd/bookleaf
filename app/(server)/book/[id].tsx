import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, Image, TextInput, Modal, ActivityIndicator, Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ResourceService } from '../../../src/services/ResourceService';
import { BorrowService } from '../../../src/services/BorrowService';
import { useAppStore } from '../../../src/store/appStore';
import { Resource, MaterialType, CallNumberType } from '../../../src/types';
import { queryKeys } from '../../../src/lib/queryKeys';
import { MATERIAL_TYPE_META, MATERIAL_TYPES, IDENTIFIER_LABEL, CALL_NUMBER_TYPES } from '../../../src/lib/materialTypes';

const CONDITION_COLOR: Record<string, string> = {
  good: '#16A34A', damaged: '#D97706', lost: '#DC2626',
};
const STATUS_COLOR: Record<string, string> = {
  available: '#16A34A', borrowed: '#2563EB', reserved: '#7C3AED',
};

export default function ResourceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useAppStore((s) => s.currentUser);
  const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'librarian';
  const resourceId = parseInt(id);

  const [editVisible, setEditVisible] = useState(false);

  const { data: resource, isLoading } = useQuery({
    queryKey: queryKeys.resource(resourceId),
    queryFn: () => ResourceService.getById(resourceId),
    enabled: !!resourceId,
  });

  const { data: copies = [] } = useQuery({
    queryKey: queryKeys.resourceCopies(resourceId),
    queryFn: () => ResourceService.getCopies(resourceId),
    enabled: !!resourceId,
  });

  const { data: history = [] } = useQuery({
    queryKey: queryKeys.resourceHistory(resourceId),
    queryFn: () => BorrowService.getHistoryByResource(resourceId),
    enabled: !!resourceId,
  });

  const addCopyMutation = useMutation({
    mutationFn: () => ResourceService.addCopy(resourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.resource(resourceId) });
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const handleAddCopy = () => {
    Alert.alert('Add Copy', 'Add one more copy of this resource?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add', onPress: () => addCopyMutation.mutate() },
    ]);
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-bio">
        <ActivityIndicator size="large" color="#2A5C33" />
      </View>
    );
  }

  if (!resource) {
    return (
      <View className="flex-1 items-center justify-center bg-bio">
        <Text className="text-red-600 text-base">Resource not found</Text>
      </View>
    );
  }

  const meta = MATERIAL_TYPE_META[resource.material_type];

  return (
    <>
      <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Top bar */}
        <View className="bg-brand px-5 pb-5 rounded-b-[28px]" style={{ paddingTop: 52 }}>
          <View className="flex-row items-center justify-between mb-4">
            <TouchableOpacity onPress={() => router.back()} className="flex-row items-center gap-1">
              <Ionicons name="chevron-back" size={20} color="#A8D5A2" />
              <Text className="text-[#A8D5A2] text-sm font-medium">Back</Text>
            </TouchableOpacity>
            {isStaff && (
              <TouchableOpacity
                className="bg-[#1C3E23] rounded-xl px-4 py-2"
                onPress={() => setEditVisible(true)}
              >
                <Text className="text-[#A8D5A2] text-sm font-bold">Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Hero */}
          <View className="flex-row gap-4 items-start">
            {resource.cover_uri ? (
              <Image source={{ uri: resource.cover_uri }} className="w-16 h-20 rounded-2xl" resizeMode="cover" />
            ) : (
              <View className="w-16 h-20 bg-[#1C3E23] rounded-2xl items-center justify-center">
                <Ionicons name={meta.icon as any} size={28} color="#A8D5A2" />
              </View>
            )}
            <View className="flex-1">
              <View className="flex-row items-center gap-2 mb-1">
                <View className="bg-[#1C3E23] rounded-md px-2 py-0.5">
                  <Text className="text-[10px] font-bold text-[#A8D5A2] uppercase tracking-wide">{meta.label}</Text>
                </View>
                {!resource.is_loanable && (
                  <View className="bg-[#D97706] rounded-md px-2 py-0.5">
                    <Text className="text-[10px] font-bold text-white">Reference Only</Text>
                  </View>
                )}
              </View>
              <Text className="text-white font-extrabold text-base leading-5">{resource.title}</Text>
              {resource.subtitle ? <Text className="text-[#C8DFC5] text-xs mt-0.5 italic">{resource.subtitle}</Text> : null}
              <Text className="text-[#A8D5A2] text-sm mt-1">{resource.author}</Text>
              {resource.publisher ? <Text className="text-[#7A9A7E] text-xs mt-0.5">{resource.publisher}{resource.year ? ` · ${resource.year}` : ''}</Text> : null}
              {resource.genre ? (
                <View className="self-start bg-[#1C3E23] rounded-md px-2 py-0.5 mt-1.5">
                  <Text className="text-[10px] font-semibold text-[#A8D5A2]">{resource.genre}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={{ padding: 16, gap: 12 }}>
          {/* Availability stats */}
          <View className="flex-row gap-3">
            <StatCard label="Available" value={resource.available_copies} highlight={resource.available_copies > 0 ? 'green' : 'red'} />
            <StatCard label="Total Copies" value={resource.total_copies} />
            <StatCard label="Borrowed" value={resource.total_copies - resource.available_copies} />
          </View>

          {/* Description */}
          {resource.description ? (
            <Section title="Description">
              <Text className="text-sm text-[#475569] leading-6">{resource.description}</Text>
            </Section>
          ) : null}

          {/* Bibliographic details */}
          {hasAnyRda(resource) ? (
            <Section title="Bibliographic Details">
              {resource.edition ? <DetailRow label="Edition" value={resource.edition} /> : null}
              {resource.volume ? <DetailRow label="Volume" value={resource.volume} /> : null}
              {resource.issue_number ? <DetailRow label="Issue No." value={resource.issue_number} /> : null}
              {resource.series_title ? <DetailRow label="Series" value={resource.series_title} /> : null}
              {resource.language ? <DetailRow label="Language" value={resource.language} /> : null}
              {resource.isbn ? <DetailRow label={IDENTIFIER_LABEL[resource.material_type]} value={resource.isbn} /> : null}
              {resource.doi ? <DetailRow label="DOI" value={resource.doi} /> : null}
              {resource.url ? <DetailRow label="URL" value={resource.url} /> : null}
              {resource.duration ? <DetailRow label="Duration" value={resource.duration} /> : null}
              {resource.call_number ? (
                <DetailRow label="Call Number" value={`${resource.call_number}${resource.call_number_type ? ` (${resource.call_number_type})` : ''}`} />
              ) : null}
              {resource.content_type ? <DetailRow label="Content Type" value={resource.content_type} /> : null}
              {resource.media_type ? <DetailRow label="Media Type" value={resource.media_type} /> : null}
              {resource.carrier_type ? <DetailRow label="Carrier Type" value={resource.carrier_type} /> : null}
            </Section>
          ) : resource.isbn ? (
            <Section title="Identifier">
              <DetailRow label={IDENTIFIER_LABEL[resource.material_type]} value={resource.isbn} />
            </Section>
          ) : null}

          {/* Copies */}
          <Section
            title={`Copies (${copies.length})`}
            action={isStaff ? { label: '+ Add copy', onPress: handleAddCopy } : undefined}
          >
            {copies.length === 0 ? (
              <Text className="text-sm text-[#94A3B8] text-center py-2">No copies yet</Text>
            ) : (
              copies.map((copy) => (
                <View key={copy.id} className="flex-row items-center gap-2 py-2.5 border-t border-[#F1F5F9]">
                  <Text className="text-sm text-[#374151] flex-1">Copy #{copy.copy_number}</Text>
                  <View className="rounded-md px-2.5 py-1" style={{ backgroundColor: STATUS_COLOR[copy.status] + '20' }}>
                    <Text className="text-xs font-semibold capitalize" style={{ color: STATUS_COLOR[copy.status] }}>{copy.status}</Text>
                  </View>
                  <View className="rounded-md px-2.5 py-1" style={{ backgroundColor: CONDITION_COLOR[copy.condition] + '20' }}>
                    <Text className="text-xs font-semibold capitalize" style={{ color: CONDITION_COLOR[copy.condition] }}>{copy.condition}</Text>
                  </View>
                </View>
              ))
            )}
          </Section>

          {/* Borrowing history */}
          <Section title={`Borrowing History (${history.length})`}>
            {history.length === 0 ? (
              <Text className="text-sm text-[#94A3B8] text-center py-2">No borrowing history yet</Text>
            ) : (
              history.map((record) => {
                const overdue = !record.returned_at && new Date(record.due_date) < new Date();
                return (
                  <View key={record.id} className="flex-row items-center py-2.5 border-t border-[#F1F5F9]">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-[#1C2B1E]">{record.member_name}</Text>
                      <Text className="text-xs text-[#94A3B8] mt-0.5">{record.member_id_number}</Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-xs text-[#5A7A5E]">{new Date(record.borrowed_at).toLocaleDateString()}</Text>
                      {record.returned_at ? (
                        <Text className="text-xs text-leaf font-semibold mt-0.5">Returned</Text>
                      ) : (
                        <Text className={`text-xs font-semibold mt-0.5 ${overdue ? 'text-red-600' : 'text-[#2563EB]'}`}>
                          {overdue ? 'Overdue' : 'Active'}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </Section>
        </View>
      </ScrollView>

      <EditResourceModal
        visible={editVisible}
        resource={resource}
        onClose={() => setEditVisible(false)}
        onSaved={() => {
          setEditVisible(false);
          queryClient.invalidateQueries({ queryKey: queryKeys.resource(resourceId) });
          queryClient.invalidateQueries({ queryKey: ['resources'] });
        }}
      />
    </>
  );
}

function hasAnyRda(r: Resource) {
  return r.edition || r.volume || r.issue_number || r.series_title || r.language ||
    r.doi || r.url || r.duration || r.call_number || r.content_type || r.media_type || r.carrier_type;
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: 'green' | 'red' }) {
  const borderColor = highlight === 'green' ? '#16A34A' : highlight === 'red' ? '#DC2626' : undefined;
  return (
    <View className="flex-1 bg-white rounded-2xl p-3 items-center"
      style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, borderTopWidth: borderColor ? 3 : 0, borderTopColor: borderColor }}>
      <Text className="text-2xl font-extrabold text-[#1C2B1E]">{value}</Text>
      <Text className="text-xs text-[#7A9A7E] mt-0.5 text-center">{label}</Text>
    </View>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: { label: string; onPress: () => void } }) {
  return (
    <View className="bg-white rounded-2xl p-4"
      style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }}>
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-sm font-bold text-[#1C2B1E]">{title}</Text>
        {action && (
          <TouchableOpacity onPress={action.onPress} className="bg-mint rounded-lg px-3 py-1">
            <Text className="text-xs font-bold text-brand">{action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row py-1.5 border-t border-[#F8F8F8] first:border-t-0">
      <Text className="text-xs font-semibold text-[#7A9A7E] w-28">{label}</Text>
      <Text className="text-xs text-[#1C2B1E] flex-1">{value}</Text>
    </View>
  );
}

// ─── Edit Modal ──────────────────────────────────────────────────────────────

interface EditModalProps {
  visible: boolean;
  resource: Resource;
  onClose: () => void;
  onSaved: () => void;
}

function EditResourceModal({ visible, resource, onClose, onSaved }: EditModalProps) {
  const [rdaMode, setRdaMode] = useState(false);
  const [materialType, setMaterialType] = useState<MaterialType>(resource.material_type);
  const [title, setTitle] = useState(resource.title);
  const [author, setAuthor] = useState(resource.author);
  const [identifier, setIdentifier] = useState(resource.isbn ?? '');
  const [publisher, setPublisher] = useState(resource.publisher ?? '');
  const [year, setYear] = useState(resource.year ? String(resource.year) : '');
  const [genre, setGenre] = useState(resource.genre ?? '');
  const [description, setDescription] = useState(resource.description ?? '');
  const [subtitle, setSubtitle] = useState(resource.subtitle ?? '');
  const [edition, setEdition] = useState(resource.edition ?? '');
  const [volume, setVolume] = useState(resource.volume ?? '');
  const [issueNumber, setIssueNumber] = useState(resource.issue_number ?? '');
  const [seriesTitle, setSeriesTitle] = useState(resource.series_title ?? '');
  const [doi, setDoi] = useState(resource.doi ?? '');
  const [url, setUrl] = useState(resource.url ?? '');
  const [duration, setDuration] = useState(resource.duration ?? '');
  const [language, setLanguage] = useState(resource.language ?? '');
  const [callNumber, setCallNumber] = useState(resource.call_number ?? '');
  const [callNumberType, setCallNumberType] = useState<CallNumberType | ''>(resource.call_number_type ?? '');
  const [contentType, setContentType] = useState(resource.content_type ?? '');
  const [mediaType, setMediaType] = useState(resource.media_type ?? '');
  const [carrierType, setCarrierType] = useState(resource.carrier_type ?? '');
  const [isLoanable, setIsLoanable] = useState(resource.is_loanable);
  const [loanPeriodDays, setLoanPeriodDays] = useState(resource.loan_period_days ? String(resource.loan_period_days) : '');

  useEffect(() => {
    setMaterialType(resource.material_type);
    setTitle(resource.title);
    setAuthor(resource.author);
    setIdentifier(resource.isbn ?? '');
    setPublisher(resource.publisher ?? '');
    setYear(resource.year ? String(resource.year) : '');
    setGenre(resource.genre ?? '');
    setDescription(resource.description ?? '');
    setSubtitle(resource.subtitle ?? '');
    setEdition(resource.edition ?? '');
    setVolume(resource.volume ?? '');
    setIssueNumber(resource.issue_number ?? '');
    setSeriesTitle(resource.series_title ?? '');
    setDoi(resource.doi ?? '');
    setUrl(resource.url ?? '');
    setDuration(resource.duration ?? '');
    setLanguage(resource.language ?? '');
    setCallNumber(resource.call_number ?? '');
    setCallNumberType(resource.call_number_type ?? '');
    setContentType(resource.content_type ?? '');
    setMediaType(resource.media_type ?? '');
    setCarrierType(resource.carrier_type ?? '');
    setIsLoanable(resource.is_loanable);
    setLoanPeriodDays(resource.loan_period_days ? String(resource.loan_period_days) : '');
  }, [resource]);

  const updateMutation = useMutation({
    mutationFn: () => ResourceService.update(resource.id, {
      material_type: materialType,
      title: title.trim(),
      author: author.trim(),
      isbn: identifier.trim() || null,
      publisher: publisher.trim() || null,
      year: year.trim() ? parseInt(year.trim()) : null,
      genre: genre.trim() || null,
      description: description.trim() || null,
      subtitle: subtitle.trim() || null,
      edition: edition.trim() || null,
      volume: volume.trim() || null,
      issue_number: issueNumber.trim() || null,
      series_title: seriesTitle.trim() || null,
      doi: doi.trim() || null,
      url: url.trim() || null,
      duration: duration.trim() || null,
      language: language.trim() || null,
      call_number: callNumber.trim() || null,
      call_number_type: (callNumberType as CallNumberType) || null,
      content_type: contentType.trim() || null,
      media_type: mediaType.trim() || null,
      carrier_type: carrierType.trim() || null,
      is_loanable: isLoanable,
      loan_period_days: loanPeriodDays.trim() ? parseInt(loanPeriodDays.trim()) : null,
    }),
    onSuccess: onSaved,
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const handleSave = () => {
    if (!title.trim() || !author.trim()) {
      Alert.alert('Error', 'Title and author are required');
      return;
    }
    updateMutation.mutate();
  };

  const identifierLabel = IDENTIFIER_LABEL[materialType];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View className="flex-1 bg-bio">
        {/* Modal header */}
        <View className="bg-brand flex-row items-center justify-between px-5 pb-4 rounded-b-[20px]" style={{ paddingTop: 20 }}>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-[#A8D5A2] text-sm font-medium">Cancel</Text>
          </TouchableOpacity>
          <Text className="text-white font-extrabold text-base">Edit Resource</Text>
          <TouchableOpacity onPress={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending
              ? <ActivityIndicator color="#A8D5A2" size="small" />
              : <Text className="text-[#A8D5A2] text-sm font-bold">Save</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          {/* Simple / RDA toggle */}
          <View className="bg-[#1C3E23] rounded-2xl p-1 flex-row">
            {(['Simple', 'RDA'] as const).map((m) => {
              const active = (m === 'RDA') === rdaMode;
              return (
                <TouchableOpacity
                  key={m}
                  className={`flex-1 py-2.5 rounded-xl items-center ${active ? 'bg-white' : ''}`}
                  onPress={() => setRdaMode(m === 'RDA')}
                >
                  <Text className={`text-sm font-bold ${active ? 'text-brand' : 'text-[#A8D5A2]'}`}>{m}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Material Type */}
          <EditSection label="Material Type">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {MATERIAL_TYPES.map((type) => {
                const meta = MATERIAL_TYPE_META[type];
                const selected = materialType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setMaterialType(type)}
                    className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl border ${selected ? 'bg-brand border-brand' : 'bg-white border-mint'}`}
                  >
                    <Ionicons name={meta.icon as any} size={14} color={selected ? '#FFFFFF' : '#2A5C33'} />
                    <Text className={`text-xs font-bold ${selected ? 'text-white' : 'text-brand'}`}>{meta.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </EditSection>

          <EditSection label={identifierLabel}>
            <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={identifier} onChangeText={setIdentifier} placeholder={`${identifierLabel} (optional)`} placeholderTextColor="#94A3B8" autoCapitalize="none" />
          </EditSection>

          <EditSection label="Details">
            <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={title} onChangeText={setTitle} placeholder="Title *" placeholderTextColor="#94A3B8" />
            <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={author} onChangeText={setAuthor} placeholder="Author / Creator *" placeholderTextColor="#94A3B8" />
            <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={publisher} onChangeText={setPublisher} placeholder="Publisher" placeholderTextColor="#94A3B8" />
            <View className="flex-row gap-2">
              <TextInput className="flex-1 bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={year} onChangeText={setYear} placeholder="Year" placeholderTextColor="#94A3B8" keyboardType="numeric" maxLength={4} />
              <TextInput className="flex-[2] bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={genre} onChangeText={setGenre} placeholder="Genre / Subject" placeholderTextColor="#94A3B8" />
            </View>
            <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" style={{ height: 80, textAlignVertical: 'top' }} value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor="#94A3B8" multiline />
          </EditSection>

          {rdaMode && (
            <>
              <EditSection label="Bibliographic Details">
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={subtitle} onChangeText={setSubtitle} placeholder="Subtitle" placeholderTextColor="#94A3B8" />
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={edition} onChangeText={setEdition} placeholder="Edition" placeholderTextColor="#94A3B8" />
                <View className="flex-row gap-2">
                  <TextInput className="flex-1 bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={volume} onChangeText={setVolume} placeholder="Volume" placeholderTextColor="#94A3B8" />
                  <TextInput className="flex-1 bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={issueNumber} onChangeText={setIssueNumber} placeholder="Issue No." placeholderTextColor="#94A3B8" />
                </View>
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={seriesTitle} onChangeText={setSeriesTitle} placeholder="Series Title" placeholderTextColor="#94A3B8" />
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={language} onChangeText={setLanguage} placeholder="Language" placeholderTextColor="#94A3B8" />
              </EditSection>

              <EditSection label="Digital / Online">
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={doi} onChangeText={setDoi} placeholder="DOI" placeholderTextColor="#94A3B8" autoCapitalize="none" />
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={url} onChangeText={setUrl} placeholder="URL" placeholderTextColor="#94A3B8" autoCapitalize="none" keyboardType="url" />
                {materialType === 'AUDIOVISUAL' && (
                  <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={duration} onChangeText={setDuration} placeholder="Duration" placeholderTextColor="#94A3B8" />
                )}
              </EditSection>

              <EditSection label="Classification">
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={callNumber} onChangeText={setCallNumber} placeholder="Call Number" placeholderTextColor="#94A3B8" />
                <View className="flex-row gap-2">
                  {CALL_NUMBER_TYPES.map((t: CallNumberType) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setCallNumberType(callNumberType === t ? '' : t)}
                      className={`flex-1 py-2.5 rounded-xl items-center border ${callNumberType === t ? 'bg-brand border-brand' : 'bg-white border-mint'}`}
                    >
                      <Text className={`text-xs font-bold ${callNumberType === t ? 'text-white' : 'text-brand'}`}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </EditSection>

              <EditSection label="RDA Descriptors">
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={contentType} onChangeText={setContentType} placeholder="Content Type" placeholderTextColor="#94A3B8" />
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={mediaType} onChangeText={setMediaType} placeholder="Media Type" placeholderTextColor="#94A3B8" />
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={carrierType} onChangeText={setCarrierType} placeholder="Carrier Type" placeholderTextColor="#94A3B8" />
              </EditSection>
            </>
          )}

          <EditSection label="Lending">
            <View className="flex-row items-center justify-between px-1">
              <View>
                <Text className="text-sm font-semibold text-[#1C2B1E]">Loanable</Text>
                <Text className="text-xs text-[#7A9A7E] mt-0.5">Can members borrow this?</Text>
              </View>
              <Switch
                value={isLoanable}
                onValueChange={setIsLoanable}
                trackColor={{ false: '#C8DFC5', true: '#2A5C33' }}
                thumbColor="#FFFFFF"
              />
            </View>
            {rdaMode && isLoanable && (
              <TextInput
                className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
                value={loanPeriodDays}
                onChangeText={setLoanPeriodDays}
                placeholder="Loan period (days) — leave blank for default"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
              />
            )}
          </EditSection>
        </ScrollView>
      </View>
    </Modal>
  );
}

function EditSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl p-4 gap-3"
      style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
      <Text className="text-xs font-bold text-brand uppercase tracking-widest">{label}</Text>
      {children}
    </View>
  );
}
