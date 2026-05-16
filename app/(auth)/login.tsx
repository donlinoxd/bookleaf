import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { UserService } from '../../src/services/UserService';
import { SettingsService } from '../../src/services/SettingsService';
import { useAppStore } from '../../src/store/appStore';
import { getDatabase } from '../../src/db/database';
import { Institution } from '../../src/types';

export default function LoginScreen() {
  const router = useRouter();
  const { setCurrentUser, setSettings, setInstitution } = useAppStore();
  const [idNumber, setIdNumber] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!idNumber.trim() || !pin.trim()) {
      Alert.alert('Error', 'Please enter your ID and PIN');
      return;
    }
    setLoading(true);
    try {
      const user = await UserService.authenticate(idNumber.trim(), pin.trim());
      if (!user) {
        Alert.alert('Login Failed', 'Invalid ID number or PIN');
        return;
      }
      const [settings, db] = await Promise.all([SettingsService.getAll(), getDatabase()]);
      const institution = await db.getFirstAsync<Institution>(
        'SELECT * FROM institutions WHERE id = ?', [user.institution_id]
      );
      setCurrentUser(user);
      setSettings(settings);
      if (institution) setInstitution(institution);

      if (user.role === 'admin' || user.role === 'librarian') {
        router.replace('/(server)/dashboard');
      } else {
        router.replace('/(server)/opac');
      }
    } catch (e) {
      Alert.alert('Error', 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <Text style={styles.title}>Library Login</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <View style={styles.form}>
          <Text style={styles.label}>ID Number</Text>
          <TextInput
            style={styles.input}
            value={idNumber}
            onChangeText={setIdNumber}
            placeholder="Enter your ID number"
            autoCapitalize="none"
          />

          <Text style={styles.label}>PIN</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            placeholder="Enter your PIN"
            secureTextEntry
            keyboardType="numeric"
          />

          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.push('/(auth)/guest')}>
          <Text style={styles.guestText}>Browse catalog as guest</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  inner: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#1E293B', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#64748B', textAlign: 'center', marginTop: 4, marginBottom: 32 },
  form: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151' },
  input: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 8,
  },
  button: {
    backgroundColor: '#2563EB', borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  guestText: { color: '#2563EB', textAlign: 'center', marginTop: 24, fontSize: 14 },
});
