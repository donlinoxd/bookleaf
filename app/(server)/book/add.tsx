import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BookService } from '../../../src/services/BookService';
import { useAppStore } from '../../../src/store/appStore';

export default function AddBookScreen() {
  const router = useRouter();
  const institution = useAppStore((s) => s.institution);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [publisher, setPublisher] = useState('');
  const [year, setYear] = useState('');
  const [genre, setGenre] = useState('');
  const [description, setDescription] = useState('');
  const [copies, setCopies] = useState('1');
  const [saving, setSaving] = useState(false);

  const [scannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission needed', 'Camera access is required to scan barcodes.');
        return;
      }
    }
    scannedRef.current = false;
    setScannerVisible(true);
  };

  const handleBarcodeScan = ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScannerVisible(false);
    setIsbn(data);
  };

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Error', 'Title is required'); return; }
    if (!author.trim()) { Alert.alert('Error', 'Author is required'); return; }
    if (!institution) { Alert.alert('Error', 'No institution found'); return; }

    const copyCount = parseInt(copies) || 1;
    if (copyCount < 1 || copyCount > 100) {
      Alert.alert('Error', 'Number of copies must be between 1 and 100');
      return;
    }

    setSaving(true);
    try {
      const bookId = await BookService.create({
        institution_id: institution.id,
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
      Alert.alert('Book Added', `"${title.trim()}" has been added with ${copyCount} cop${copyCount === 1 ? 'y' : 'ies'}.`, [
        { text: 'View Book', onPress: () => router.replace(`/(server)/book/${bookId}`) },
        { text: 'Add Another', onPress: () => router.replace('/(server)/book/add') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save book');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <View style={styles.container}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Add Book</Text>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : <Text style={styles.saveBtnText}>Save</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
          {/* ISBN row */}
          <Text style={styles.sectionLabel}>ISBN</Text>
          <View style={styles.isbnRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={isbn}
              onChangeText={setIsbn}
              placeholder="ISBN (optional)"
              keyboardType="numeric"
            />
            <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
              <Text style={styles.scanBtnText}>Scan</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Book Details</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Title *"
          />
          <TextInput
            style={styles.input}
            value={author}
            onChangeText={setAuthor}
            placeholder="Author *"
          />
          <TextInput
            style={styles.input}
            value={publisher}
            onChangeText={setPublisher}
            placeholder="Publisher"
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={year}
              onChangeText={setYear}
              placeholder="Year"
              keyboardType="numeric"
              maxLength={4}
            />
            <TextInput
              style={[styles.input, { flex: 2 }]}
              value={genre}
              onChangeText={setGenre}
              placeholder="Genre"
            />
          </View>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.sectionLabel}>Inventory</Text>
          <View style={styles.copiesRow}>
            <TouchableOpacity
              style={styles.copiesBtn}
              onPress={() => setCopies(String(Math.max(1, parseInt(copies || '1') - 1)))}
            >
              <Text style={styles.copiesBtnText}>−</Text>
            </TouchableOpacity>
            <View style={styles.copiesValue}>
              <Text style={styles.copiesNum}>{copies}</Text>
              <Text style={styles.copiesLabel}>copies</Text>
            </View>
            <TouchableOpacity
              style={styles.copiesBtn}
              onPress={() => setCopies(String(Math.min(100, parseInt(copies || '1') + 1)))}
            >
              <Text style={styles.copiesBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      {/* Barcode Scanner Modal */}
      <Modal visible={scannerVisible} animationType="slide">
        <View style={scanner.container}>
          <View style={scanner.topBar}>
            <TouchableOpacity onPress={() => setScannerVisible(false)}>
              <Text style={scanner.close}>✕ Close</Text>
            </TouchableOpacity>
            <Text style={scanner.title}>Scan ISBN Barcode</Text>
          </View>

          <CameraView
            style={scanner.camera}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
            onBarcodeScanned={handleBarcodeScan}
          >
            <View style={scanner.overlay}>
              <View style={scanner.frame} />
              <Text style={scanner.hint}>Point at the ISBN barcode on the back of the book</Text>
            </View>
          </CameraView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  backBtn: { paddingVertical: 4 },
  backText: { fontSize: 15, color: '#64748B' },
  screenTitle: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
  saveBtn: { backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, minWidth: 64, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  form: { flex: 1 },
  formContent: { padding: 16, gap: 10, paddingBottom: 40 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8, marginBottom: 2 },
  input: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  textArea: { height: 90, paddingTop: 12 },
  isbnRow: { flexDirection: 'row', gap: 8 },
  scanBtn: { backgroundColor: '#1E293B', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  scanBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  row: { flexDirection: 'row', gap: 10 },
  copiesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, paddingVertical: 8 },
  copiesBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  copiesBtnText: { fontSize: 24, color: '#374151', lineHeight: 28 },
  copiesValue: { alignItems: 'center' },
  copiesNum: { fontSize: 36, fontWeight: '700', color: '#1E293B' },
  copiesLabel: { fontSize: 13, color: '#64748B' },
});

const scanner = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16,
    backgroundColor: '#000',
  },
  close: { color: '#FFFFFF', fontSize: 16 },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 },
  frame: {
    width: 260, height: 120,
    borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 8,
  },
  hint: { color: '#FFFFFF', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});
