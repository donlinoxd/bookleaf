import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { getDatabase } from '../../src/db/database';
import { UserService } from '../../src/services/UserService';
import { SettingsService } from '../../src/services/SettingsService';

export default function RegisterScreen() {
  const router = useRouter();
  const [institutionName, setInstitutionName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminId, setAdminId] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSetup = async () => {
    if (!institutionName.trim() || !adminName.trim() || !adminId.trim() || !adminPin.trim()) {
      Alert.alert('Error', 'All fields are required');
      return;
    }
    if (adminPin !== confirmPin) {
      Alert.alert('Error', 'PINs do not match');
      return;
    }
    if (adminPin.length < 4) {
      Alert.alert('Error', 'PIN must be at least 4 digits');
      return;
    }

    setLoading(true);
    try {
      const db = await getDatabase();
      const instResult = await db.runAsync(
        'INSERT INTO institutions (name) VALUES (?)',
        [institutionName.trim()]
      );
      const institutionId = instResult.lastInsertRowId;

      await UserService.create({
        institution_id: institutionId,
        name: adminName.trim(),
        id_number: adminId.trim(),
        role: 'admin',
        pin: adminPin,
      });

      await SettingsService.set('institution_name', institutionName.trim());

      Alert.alert('Setup Complete', 'Library system is ready!', [
        { text: 'Login', onPress: () => router.replace('/(auth)/login') }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Bookleaf Setup</Text>
      <Text style={styles.subtitle}>Set up your institution and admin account</Text>

      <Text style={styles.section}>Institution</Text>
      <TextInput style={styles.input} value={institutionName} onChangeText={setInstitutionName} placeholder="Institution name" />

      <Text style={styles.section}>Admin Account</Text>
      <TextInput style={styles.input} value={adminName} onChangeText={setAdminName} placeholder="Full name" />
      <TextInput style={styles.input} value={adminId} onChangeText={setAdminId} placeholder="ID number" autoCapitalize="none" />
      <TextInput style={styles.input} value={adminPin} onChangeText={setAdminPin} placeholder="PIN (min 4 digits)" secureTextEntry keyboardType="numeric" />
      <TextInput style={styles.input} value={confirmPin} onChangeText={setConfirmPin} placeholder="Confirm PIN" secureTextEntry keyboardType="numeric" />

      <TouchableOpacity style={styles.button} onPress={handleSetup} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Setting up...' : 'Complete Setup'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 24, paddingTop: 60 },
  title: { fontSize: 26, fontWeight: '700', color: '#1E293B', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 4, marginBottom: 24 },
  section: { fontSize: 13, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 10,
  },
  button: {
    backgroundColor: '#2563EB', borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: 16,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
