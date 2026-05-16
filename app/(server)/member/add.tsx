import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { UserService } from '../../../src/services/UserService';
import { useAppStore } from '../../../src/store/appStore';
import { UserRole } from '../../../src/types';

const ROLES: UserRole[] = ['member', 'librarian', 'admin'];

const ROLE_COLOR: Record<UserRole, string> = {
  admin: '#7C3AED',
  librarian: '#2563EB',
  member: '#16A34A',
};

export default function AddMemberScreen() {
  const router = useRouter();
  const institution = useAppStore((s) => s.institution);

  const [name, setName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Error', 'Full name is required'); return; }
    if (!idNumber.trim()) { Alert.alert('Error', 'ID number is required'); return; }
    if (pin.length < 4) { Alert.alert('Error', 'PIN must be at least 4 digits'); return; }
    if (pin !== confirmPin) { Alert.alert('Error', 'PINs do not match'); return; }
    if (!institution) { Alert.alert('Error', 'No institution found'); return; }

    setSaving(true);
    try {
      const userId = await UserService.create({
        institution_id: institution.id,
        name: name.trim(),
        id_number: idNumber.trim(),
        role,
        pin,
      });
      Alert.alert('Member Added', `${name.trim()} has been registered.`, [
        { text: 'View Profile', onPress: () => router.replace(`/(server)/member/${userId}`) },
        { text: 'Add Another', onPress: () => router.replace('/(server)/member/add') },
      ]);
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) {
        Alert.alert('Error', 'That ID number is already registered.');
      } else {
        Alert.alert('Error', e.message ?? 'Failed to save member');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Add Member</Text>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Text style={styles.saveBtnText}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
        {/* Personal info */}
        <Text style={styles.sectionLabel}>Personal Info</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Full name *"
        />
        <TextInput
          style={styles.input}
          value={idNumber}
          onChangeText={setIdNumber}
          placeholder="ID number * (must be unique)"
          autoCapitalize="none"
        />

        {/* Role */}
        <Text style={styles.sectionLabel}>Role</Text>
        <View style={styles.roleRow}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r}
              style={[
                styles.roleBtn,
                role === r && { backgroundColor: ROLE_COLOR[r] },
              ]}
              onPress={() => setRole(r)}
            >
              <Text style={[styles.roleBtnText, role === r && styles.roleBtnActive]}>
                {r}
              </Text>
              {r === 'admin' && (
                <Text style={[styles.roleHint, role === r && { color: '#DDD6FE' }]}>
                  Full access
                </Text>
              )}
              {r === 'librarian' && (
                <Text style={[styles.roleHint, role === r && { color: '#BFDBFE' }]}>
                  Manage books
                </Text>
              )}
              {r === 'member' && (
                <Text style={[styles.roleHint, role === r && { color: '#BBF7D0' }]}>
                  Borrow only
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* PIN */}
        <Text style={styles.sectionLabel}>Login PIN</Text>
        <Text style={styles.pinHint}>The member will use this PIN to log in to the system.</Text>
        <TextInput
          style={styles.input}
          value={pin}
          onChangeText={setPin}
          placeholder="PIN (min 4 digits) *"
          secureTextEntry
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          value={confirmPin}
          onChangeText={setConfirmPin}
          placeholder="Confirm PIN *"
          secureTextEntry
          keyboardType="numeric"
        />

        {/* PIN strength hint */}
        {pin.length > 0 && (
          <View style={[styles.pinStrength, pin.length >= 6 ? styles.pinStrong : pin.length >= 4 ? styles.pinOk : styles.pinWeak]}>
            <Text style={styles.pinStrengthText}>
              {pin.length >= 6 ? 'Strong PIN' : pin.length >= 4 ? 'Acceptable PIN' : `${4 - pin.length} more digit${4 - pin.length > 1 ? 's' : ''} needed`}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  backText: { fontSize: 15, color: '#64748B' },
  screenTitle: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
  saveBtn: {
    backgroundColor: '#2563EB', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 8, minWidth: 64, alignItems: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  form: { flex: 1 },
  formContent: { padding: 16, gap: 10, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#94A3B8',
    textTransform: 'uppercase', letterSpacing: 1, marginTop: 8, marginBottom: 2,
  },
  input: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleBtn: {
    flex: 1, borderRadius: 10, padding: 12, alignItems: 'center',
    backgroundColor: '#F1F5F9', gap: 3,
  },
  roleBtnText: { fontSize: 14, fontWeight: '700', color: '#374151', textTransform: 'capitalize' },
  roleBtnActive: { color: '#FFFFFF' },
  roleHint: { fontSize: 11, color: '#94A3B8' },
  pinHint: { fontSize: 13, color: '#64748B', marginBottom: 4 },
  pinStrength: { borderRadius: 8, padding: 10 },
  pinStrong: { backgroundColor: '#DCFCE7' },
  pinOk: { backgroundColor: '#FEF9C3' },
  pinWeak: { backgroundColor: '#FEE2E2' },
  pinStrengthText: { fontSize: 13, fontWeight: '600', color: '#374151', textAlign: 'center' },
});
