import { useState, useRef } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BookService } from '../../../src/services/BookService';
import { useAppStore } from '../../../src/store/appStore';

export default function AddBookScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const institution = useAppStore((s) => s.institution);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [publisher, setPublisher] = useState('');
  const [year, setYear] = useState('');
  const [genre, setGenre] = useState('');
  const [description, setDescription] = useState('');
  const [copies, setCopies] = useState('1');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  const createMutation = useMutation({
    mutationFn: () => {
      const copyCount = parseInt(copies) || 1;
      return BookService.create({
        institution_id: institution!.id,
        isbn: isbn.trim() || null,
        title: title.trim(),
        author: author.trim(),
        publisher: publisher.trim() || null,
        year: year.trim() ? parseInt(year.trim()) : null,
        genre: genre.trim() || null,
        description: description.trim() || null,
        cover_uri: null,
        total_copies: copyCount,
      });
    },
    onSuccess: (bookId) => {
      queryClient.invalidateQueries({ queryKey: ['books'] });
      const copyCount = parseInt(copies) || 1;
      Alert.alert('Book Added', `"${title.trim()}" added with ${copyCount} cop${copyCount === 1 ? 'y' : 'ies'}.`, [
        { text: 'View Book', onPress: () => router.replace(`/(server)/book/${bookId}`) },
        { text: 'Add Another', onPress: () => router.replace('/(server)/book/add') },
      ]);
    },
    onError: (e: any) => Alert.alert('Error', e.message ?? 'Failed to save book'),
  });

  const handleSave = () => {
    if (!title.trim()) { Alert.alert('Error', 'Title is required'); return; }
    if (!author.trim()) { Alert.alert('Error', 'Author is required'); return; }
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
        {/* Top bar */}
        <View className="bg-brand flex-row items-center justify-between px-5 pb-4 rounded-b-[24px]"
          style={{ paddingTop: 52 }}>
          <TouchableOpacity onPress={() => router.back()} className="flex-row items-center gap-1">
            <Ionicons name="chevron-back" size={20} color="#A8D5A2" />
            <Text className="text-[#A8D5A2] text-sm font-medium">Cancel</Text>
          </TouchableOpacity>
          <Text className="text-white font-extrabold text-base">Add Book</Text>
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
          {/* ISBN */}
          <FormSection label="ISBN">
            <View className="flex-row gap-2">
              <TextInput
                className="flex-1 bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
                value={isbn}
                onChangeText={setIsbn}
                placeholder="ISBN (optional)"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
              />
              <TouchableOpacity
                className="bg-brand rounded-xl px-4 justify-center flex-row items-center gap-1"
                onPress={openScanner}
              >
                <Ionicons name="barcode-outline" size={16} color="#FFFFFF" />
                <Text className="text-white font-bold text-sm">Scan</Text>
              </TouchableOpacity>
            </View>
          </FormSection>

          {/* Book details */}
          <FormSection label="Book Details">
            <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={title} onChangeText={setTitle} placeholder="Title *" placeholderTextColor="#94A3B8" />
            <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={author} onChangeText={setAuthor} placeholder="Author *" placeholderTextColor="#94A3B8" />
            <TextInput className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={publisher} onChangeText={setPublisher} placeholder="Publisher" placeholderTextColor="#94A3B8" />
            <View className="flex-row gap-2">
              <TextInput className="flex-1 bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={year} onChangeText={setYear} placeholder="Year" placeholderTextColor="#94A3B8" keyboardType="numeric" maxLength={4} />
              <TextInput className="flex-[2] bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={genre} onChangeText={setGenre} placeholder="Genre" placeholderTextColor="#94A3B8" />
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

      <Modal visible={scannerVisible} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16, backgroundColor: '#000' }}>
            <TouchableOpacity onPress={() => setScannerVisible(false)}>
              <Text style={{ color: '#5CB85C', fontSize: 16, fontWeight: '600' }}>✕ Close</Text>
            </TouchableOpacity>
            <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>Scan ISBN Barcode</Text>
          </View>
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
            onBarcodeScanned={({ data }) => {
              if (scannedRef.current) return;
              scannedRef.current = true;
              setScannerVisible(false);
              setIsbn(data);
            }}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 }}>
              <View style={{ width: 260, height: 120, borderWidth: 2, borderColor: '#5CB85C', borderRadius: 10 }} />
              <Text style={{ color: '#FFFFFF', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 }}>
                Point at the ISBN barcode on the back of the book
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
