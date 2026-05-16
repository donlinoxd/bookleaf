import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsService } from '../../src/services/SettingsService';
import { BackupService } from '../../src/services/BackupService';
import { queryKeys } from '../../src/lib/queryKeys';
import { Settings } from '../../src/types';

export default function SettingsScreen() {
  const queryClient = useQueryClient();

  const { data: saved } = useQuery({
    queryKey: queryKeys.settings(),
    queryFn: () => SettingsService.getAll(),
  });

  const [form, setForm] = useState<Partial<Settings>>({});
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (saved) setForm(saved);
  }, [saved]);

  const set = (key: keyof Settings, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await SettingsService.update({
        institution_name: String(form.institution_name ?? ''),
        fine_per_day: Number(form.fine_per_day ?? 0),
        max_borrow_days: Number(form.max_borrow_days ?? 0),
        max_books_per_member: Number(form.max_books_per_member ?? 0),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings() });
      Alert.alert('Saved', 'Settings updated successfully.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await BackupService.exportJson();
    } catch (e) {
      Alert.alert('Export Failed', e instanceof Error ? e.message : 'Could not create backup.');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = () => {
    Alert.alert(
      'Restore Backup',
      'This will permanently replace ALL current data (books, members, records) with the backup. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setImporting(true);
            try {
              await BackupService.importJson();
              await queryClient.invalidateQueries();
              Alert.alert('Restored', 'Backup restored successfully. Please restart the app.');
            } catch (e) {
              Alert.alert('Import Failed', e instanceof Error ? e.message : 'Could not restore backup.');
            } finally {
              setImporting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Settings</Text>

      {/* Library Configuration */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Library Configuration</Text>

        <Text style={styles.label}>Institution Name</Text>
        <TextInput
          style={styles.input}
          value={String(form.institution_name ?? '')}
          onChangeText={(v) => set('institution_name', v)}
          placeholder="My School Library"
        />

        <Text style={styles.label}>Fine per Day (₱)</Text>
        <TextInput
          style={styles.input}
          value={String(form.fine_per_day ?? '')}
          onChangeText={(v) => set('fine_per_day', v)}
          keyboardType="numeric"
          placeholder="5"
        />

        <Text style={styles.label}>Max Borrow Days</Text>
        <TextInput
          style={styles.input}
          value={String(form.max_borrow_days ?? '')}
          onChangeText={(v) => set('max_borrow_days', v)}
          keyboardType="numeric"
          placeholder="7"
        />

        <Text style={styles.label}>Max Books per Member</Text>
        <TextInput
          style={styles.input}
          value={String(form.max_books_per_member ?? '')}
          onChangeText={(v) => set('max_books_per_member', v)}
          keyboardType="numeric"
          placeholder="3"
        />

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </View>

      {/* Backup & Restore */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Backup & Restore</Text>
        <Text style={styles.sectionHint}>
          Export saves all books, members, and records to a JSON file you can store safely.
          Restoring from a backup will replace all current data.
        </Text>

        <TouchableOpacity style={styles.exportButton} onPress={handleExport} disabled={exporting}>
          <Text style={styles.exportButtonText}>{exporting ? 'Preparing…' : '⬆ Export Backup'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.importButton} onPress={handleImport} disabled={importing}>
          <Text style={styles.importButtonText}>{importing ? 'Restoring…' : '⬇ Restore from Backup'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20, paddingBottom: 40 },
  pageTitle: { fontSize: 26, fontWeight: '700', color: '#1E293B', marginBottom: 24 },

  section: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16,
    marginBottom: 20, elevation: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 14 },
  sectionHint: { fontSize: 13, color: '#64748B', marginBottom: 16, lineHeight: 19 },

  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 8, padding: 12, fontSize: 15, marginBottom: 12,
  },

  saveButton: {
    backgroundColor: '#2563EB', borderRadius: 8, padding: 14,
    alignItems: 'center', marginTop: 4,
  },
  saveButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },

  exportButton: {
    backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#86EFAC',
    borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 10,
  },
  exportButtonText: { color: '#16A34A', fontWeight: '600', fontSize: 15 },

  importButton: {
    backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA',
    borderRadius: 8, padding: 14, alignItems: 'center',
  },
  importButtonText: { color: '#C2410C', fontWeight: '600', fontSize: 15 },
});
