import { useState, useRef } from 'react';
import {
  ActivityIndicator, Alert, Modal, ScrollView, Switch,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ResourceService } from '../../../src/services/ResourceService';
import { useAppStore } from '../../../src/store/appStore';
import { MaterialType, CallNumberType } from '../../../src/types';
import { MATERIAL_TYPES, MATERIAL_TYPE_META, IDENTIFIER_LABEL } from '../../../src/lib/materialTypes';

const CALL_NUMBER_TYPES: CallNumberType[] = ['DEWEY', 'LC', 'OTHER'];

export default function AddResourceScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const institution = useAppStore((s) => s.institution);

  const [rdaMode, setRdaMode] = useState(false);
  const [materialType, setMaterialType] = useState<MaterialType>('BOOK');

  // Simple fields
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [publisher, setPublisher] = useState('');
  const [year, setYear] = useState('');
  const [genre, setGenre] = useState('');
  const [description, setDescription] = useState('');
  const [copies, setCopies] = useState('1');
  const [isLoanable, setIsLoanable] = useState(true);

  // RDA extended fields
  const [subtitle, setSubtitle] = useState('');
  const [edition, setEdition] = useState('');
  const [volume, setVolume] = useState('');
  const [issueNumber, setIssueNumber] = useState('');
  const [seriesTitle, setSeriesTitle] = useState('');
  const [doi, setDoi] = useState('');
  const [url, setUrl] = useState('');
  const [duration, setDuration] = useState('');
  const [language, setLanguage] = useState('');
  const [callNumber, setCallNumber] = useState('');
  const [callNumberType, setCallNumberType] = useState<CallNumberType | ''>('');
  const [contentType, setContentType] = useState('');
  const [mediaType, setMediaType] = useState('');
  const [carrierType, setCarrierType] = useState('');
  const [loanPeriodDays, setLoanPeriodDays] = useState('');

  const [scannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  const identifierLabel = IDENTIFIER_LABEL[materialType];
  const showScanner = materialType === 'BOOK' || materialType === 'SERIAL';

  const createMutation = useMutation({
    mutationFn: () => {
      const copyCount = parseInt(copies) || 1;
      return ResourceService.create({
        institution_id: institution!.id,
        material_type: materialType,
        isbn: identifier.trim() || null,
        title: title.trim(),
        author: author.trim(),
        publisher: publisher.trim() || null,
        year: year.trim() ? parseInt(year.trim()) : null,
        genre: genre.trim() || null,
        description: description.trim() || null,
        cover_uri: null,
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
        total_copies: copyCount,
      });
    },
    onSuccess: (resourceId) => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      const copyCount = parseInt(copies) || 1;
      Alert.alert(
        'Resource Added',
        `"${title.trim()}" added with ${copyCount} cop${copyCount === 1 ? 'y' : 'ies'}.`,
        [
          { text: 'View', onPress: () => router.replace(`/(server)/book/${resourceId}`) },
          { text: 'Add Another', onPress: () => router.replace('/(server)/book/add') },
        ]
      );
    },
    onError: (e: any) => Alert.alert('Error', e.message ?? 'Failed to save resource'),
  });

  const handleSave = () => {
    if (!title.trim()) { Alert.alert('Error', 'Title is required'); return; }
    if (!author.trim()) { Alert.alert('Error', 'Author / Creator is required'); return; }
    if (!institution) { Alert.alert('Error', 'No institution found'); return; }
    const copyCount = parseInt(copies) || 1;
    if (copyCount < 1 || copyCount > 100) { Alert.alert('Error', 'Copies must be between 1 and 100'); return; }
    createMutation.mutate();
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) { Alert.alert('Permission needed', 'Camera access is required to scan barcodes.'); return; }
    }
    scannedRef.current = false;
    setScannerVisible(true);
  };

  return (
    <>
      <View className="flex-1 bg-bio">
        {/* Header */}
        <View className="bg-brand flex-row items-center justify-between px-5 pb-4 rounded-b-[24px]"
          style={{ paddingTop: 52 }}>
          <TouchableOpacity onPress={() => router.back()} className="flex-row items-center gap-1">
            <Ionicons name="chevron-back" size={20} color="#A8D5A2" />
            <Text className="text-[#A8D5A2] text-sm font-medium">Cancel</Text>
          </TouchableOpacity>
          <Text className="text-white font-extrabold text-base">Add Resource</Text>
          <TouchableOpacity
            className="bg-leaf rounded-xl px-4 py-2 items-center min-w-[60px]"
            onPress={handleSave}
            disabled={createMutation.isPending}
            style={{ elevation: 3, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 }}
          >
            {createMutation.isPending
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : <Text className="text-white font-bold text-sm">Save</Text>}
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
          <FormSection label="Material Type">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {MATERIAL_TYPES.map((type) => {
                const meta = MATERIAL_TYPE_META[type];
                const selected = materialType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setMaterialType(type)}
                    className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl border ${
                      selected ? 'bg-brand border-brand' : 'bg-white border-mint'
                    }`}
                  >
                    <Ionicons name={meta.icon as any} size={14} color={selected ? '#FFFFFF' : '#2A5C33'} />
                    <Text className={`text-xs font-bold ${selected ? 'text-white' : 'text-brand'}`}>{meta.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </FormSection>

          {/* Identifier */}
          <FormSection label={identifierLabel}>
            <View className="flex-row gap-2">
              <TextInput
                className="flex-1 bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
                value={identifier}
                onChangeText={setIdentifier}
                placeholder={`${identifierLabel} (optional)`}
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
              />
              {showScanner && (
                <TouchableOpacity
                  className="bg-brand rounded-xl px-4 justify-center flex-row items-center gap-1"
                  onPress={openScanner}
                >
                  <Ionicons name="barcode-outline" size={16} color="#FFFFFF" />
                  <Text className="text-white font-bold text-sm">Scan</Text>
                </TouchableOpacity>
              )}
            </View>
          </FormSection>

          {/* Core Details */}
          <FormSection label="Details">
            <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={title} onChangeText={setTitle} placeholder="Title *" placeholderTextColor="#94A3B8" />
            <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={author} onChangeText={setAuthor} placeholder="Author / Creator *" placeholderTextColor="#94A3B8" />
            <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={publisher} onChangeText={setPublisher} placeholder="Publisher" placeholderTextColor="#94A3B8" />
            <View className="flex-row gap-2">
              <TextInput className="flex-1 bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={year} onChangeText={setYear} placeholder="Year" placeholderTextColor="#94A3B8" keyboardType="numeric" maxLength={4} />
              <TextInput className="flex-[2] bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={genre} onChangeText={setGenre} placeholder="Genre / Subject" placeholderTextColor="#94A3B8" />
            </View>
            <TextInput
              className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
              style={{ height: 88, textAlignVertical: 'top' }}
              value={description}
              onChangeText={setDescription}
              placeholder="Description (optional)"
              placeholderTextColor="#94A3B8"
              multiline
            />
          </FormSection>

          {/* RDA Advanced Fields */}
          {rdaMode && (
            <>
              <FormSection label="Bibliographic Details">
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={subtitle} onChangeText={setSubtitle} placeholder="Subtitle" placeholderTextColor="#94A3B8" />
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={edition} onChangeText={setEdition} placeholder="Edition (e.g. 3rd ed.)" placeholderTextColor="#94A3B8" />
                <View className="flex-row gap-2">
                  <TextInput className="flex-1 bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={volume} onChangeText={setVolume} placeholder="Volume" placeholderTextColor="#94A3B8" />
                  <TextInput className="flex-1 bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={issueNumber} onChangeText={setIssueNumber} placeholder="Issue No." placeholderTextColor="#94A3B8" />
                </View>
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={seriesTitle} onChangeText={setSeriesTitle} placeholder="Series Title" placeholderTextColor="#94A3B8" />
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={language} onChangeText={setLanguage} placeholder="Language (e.g. English)" placeholderTextColor="#94A3B8" />
              </FormSection>

              <FormSection label="Digital / Online">
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={doi} onChangeText={setDoi} placeholder="DOI" placeholderTextColor="#94A3B8" autoCapitalize="none" />
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={url} onChangeText={setUrl} placeholder="URL" placeholderTextColor="#94A3B8" autoCapitalize="none" keyboardType="url" />
                {materialType === 'AUDIOVISUAL' && (
                  <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={duration} onChangeText={setDuration} placeholder="Duration (e.g. 1h 23m)" placeholderTextColor="#94A3B8" />
                )}
              </FormSection>

              <FormSection label="Classification">
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={callNumber} onChangeText={setCallNumber} placeholder="Call Number" placeholderTextColor="#94A3B8" />
                <View className="flex-row gap-2">
                  {CALL_NUMBER_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setCallNumberType(callNumberType === t ? '' : t)}
                      className={`flex-1 py-2.5 rounded-xl items-center border ${callNumberType === t ? 'bg-brand border-brand' : 'bg-white border-mint'}`}
                    >
                      <Text className={`text-xs font-bold ${callNumberType === t ? 'text-white' : 'text-brand'}`}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FormSection>

              <FormSection label="RDA Descriptors">
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={contentType} onChangeText={setContentType} placeholder="Content Type (e.g. text, spoken word)" placeholderTextColor="#94A3B8" />
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={mediaType} onChangeText={setMediaType} placeholder="Media Type (e.g. unmediated, audio)" placeholderTextColor="#94A3B8" />
                <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={carrierType} onChangeText={setCarrierType} placeholder="Carrier Type (e.g. volume, audio disc)" placeholderTextColor="#94A3B8" />
              </FormSection>
            </>
          )}

          {/* Lending Rules */}
          <FormSection label="Lending">
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
          </FormSection>

          {/* Inventory */}
          <FormSection label="Inventory">
            <View className="flex-row items-center justify-center gap-6 py-2">
              <TouchableOpacity
                className="w-11 h-11 rounded-full bg-mint items-center justify-center"
                onPress={() => setCopies(String(Math.max(1, parseInt(copies || '1') - 1)))}
              >
                <Text className="text-2xl text-brand font-bold leading-7">−</Text>
              </TouchableOpacity>
              <View className="items-center">
                <Text className="text-4xl font-extrabold text-brand">{copies}</Text>
                <Text className="text-xs text-[#7A9A7E] font-medium">copies</Text>
              </View>
              <TouchableOpacity
                className="w-11 h-11 rounded-full bg-mint items-center justify-center"
                onPress={() => setCopies(String(Math.min(100, parseInt(copies || '1') + 1)))}
              >
                <Text className="text-2xl text-brand font-bold leading-7">+</Text>
              </TouchableOpacity>
            </View>
          </FormSection>

        </ScrollView>
      </View>

      {/* Barcode Scanner Modal */}
      <Modal visible={scannerVisible} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16, backgroundColor: '#000' }}>
            <TouchableOpacity onPress={() => setScannerVisible(false)}>
              <Text style={{ color: '#5CB85C', fontSize: 16, fontWeight: '600' }}>✕ Close</Text>
            </TouchableOpacity>
            <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>Scan Barcode</Text>
          </View>
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
            onBarcodeScanned={({ data }) => {
              if (scannedRef.current) return;
              scannedRef.current = true;
              setScannerVisible(false);
              setIdentifier(data);
            }}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 }}>
              <View style={{ width: 260, height: 120, borderWidth: 2, borderColor: '#5CB85C', borderRadius: 10 }} />
              <Text style={{ color: '#FFFFFF', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 }}>
                Point at the barcode on the resource
              </Text>
            </View>
          </CameraView>
        </View>
      </Modal>
    </>
  );
}

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl p-4 gap-3"
      style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
      <Text className="text-xs font-bold text-brand uppercase tracking-widest">{label}</Text>
      {children}
    </View>
  );
}
