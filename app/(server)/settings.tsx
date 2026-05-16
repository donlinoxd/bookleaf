import { useEffect, useState } from 'react';
import { Alert, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsService } from '../../src/services/SettingsService';
import { BackupService } from '../../src/services/BackupService';
import { queryKeys } from '../../src/lib/queryKeys';
import { Settings } from '../../src/types';

export default function SettingsScreen() {
  const queryClient = useQueryClient();
  const { data: saved } = useQuery({ queryKey: queryKeys.settings(), queryFn: () => SettingsService.getAll() });
  const [form, setForm] = useState<Partial<Settings>>({});
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => { if (saved) setForm(saved); }, [saved]);

  const set = (key: keyof Settings, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

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
    try { await BackupService.exportJson(); }
    catch (e) { Alert.alert('Export Failed', e instanceof Error ? e.message : 'Could not create backup.'); }
    finally { setExporting(false); }
  };

  const handleImport = () => {
    Alert.alert('Restore Backup', 'This will permanently replace ALL current data. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restore', style: 'destructive', onPress: async () => {
        setImporting(true);
        try {
          await BackupService.importJson();
          await queryClient.invalidateQueries();
          Alert.alert('Restored', 'Backup restored successfully. Please restart the app.');
        } catch (e) {
          Alert.alert('Import Failed', e instanceof Error ? e.message : 'Could not restore backup.');
        } finally { setImporting(false); }
      }},
    ]);
  };

  return (
    <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ paddingBottom: 110 }}>
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      <View className="bg-brand px-5 pb-6 rounded-b-[28px]" style={{ paddingTop: 52 }}>
        <Text className="text-2xl font-extrabold text-white">Settings</Text>
        <Text className="text-xs text-[#A8D5A2] mt-1">Library configuration & backup</Text>
      </View>

      <View className="px-4 pt-4 gap-4">
        {/* Library config */}
        <View className="bg-white rounded-2xl p-4 gap-3"
          style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
          <Text className="text-sm font-bold text-[#1C2B1E]">Library Configuration</Text>

          <Field label="Institution Name">
            <TextInput
              className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
              value={String(form.institution_name ?? '')}
              onChangeText={(v) => set('institution_name', v)}
              placeholder="My School Library"
              placeholderTextColor="#94A3B8"
            />
          </Field>
          <Field label="Fine per Day (₱)">
            <TextInput
              className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
              value={String(form.fine_per_day ?? '')}
              onChangeText={(v) => set('fine_per_day', v)}
              keyboardType="numeric"
              placeholder="5"
              placeholderTextColor="#94A3B8"
            />
          </Field>
          <Field label="Max Borrow Days">
            <TextInput
              className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
              value={String(form.max_borrow_days ?? '')}
              onChangeText={(v) => set('max_borrow_days', v)}
              keyboardType="numeric"
              placeholder="7"
              placeholderTextColor="#94A3B8"
            />
          </Field>
          <Field label="Max Books per Member">
            <TextInput
              className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
              value={String(form.max_books_per_member ?? '')}
              onChangeText={(v) => set('max_books_per_member', v)}
              keyboardType="numeric"
              placeholder="3"
              placeholderTextColor="#94A3B8"
            />
          </Field>

          <TouchableOpacity
            className="bg-leaf rounded-xl py-3.5 items-center"
            onPress={handleSave}
            disabled={saving}
            style={{ elevation: 3, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }}
          >
            <Text className="text-white font-bold">{saving ? 'Saving…' : 'Save Changes'}</Text>
          </TouchableOpacity>
        </View>

        {/* Backup */}
        <View className="bg-white rounded-2xl p-4 gap-3"
          style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
          <Text className="text-sm font-bold text-[#1C2B1E]">Backup & Restore</Text>
          <Text className="text-xs text-[#7A9A7E] leading-4">
            Export saves all books, members, and records to a JSON file. Restoring replaces all current data.
          </Text>

          <TouchableOpacity
            className="bg-mint border border-[#C8DFC5] rounded-xl py-3.5 flex-row items-center justify-center gap-2"
            onPress={handleExport}
            disabled={exporting}
          >
            <Ionicons name="cloud-upload-outline" size={18} color="#2A5C33" />
            <Text className="text-brand font-bold">{exporting ? 'Preparing…' : 'Export Backup'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="bg-orange-50 border border-orange-200 rounded-xl py-3.5 flex-row items-center justify-center gap-2"
            onPress={handleImport}
            disabled={importing}
          >
            <Ionicons name="cloud-download-outline" size={18} color="#C2410C" />
            <Text className="text-orange-700 font-bold">{importing ? 'Restoring…' : 'Restore from Backup'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1">
      <Text className="text-xs font-bold text-brand uppercase tracking-wider">{label}</Text>
      {children}
    </View>
  );
}
