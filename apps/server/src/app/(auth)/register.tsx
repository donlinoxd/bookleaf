import { useState } from 'react';
import { Alert, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { db } from '../../src/db';
import { institutions } from '../../src/db/schema';
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
      Alert.alert('Error', 'All fields are required'); return;
    }
    if (adminPin !== confirmPin) { Alert.alert('Error', 'PINs do not match'); return; }
    if (adminPin.length < 4) { Alert.alert('Error', 'PIN must be at least 4 digits'); return; }
    setLoading(true);
    try {
      const instResult = await db.insert(institutions).values({ name: institutionName.trim() }).returning({ id: institutions.id });
      const institutionId = instResult[0].id;
      await UserService.create({ institution_id: institutionId, name: adminName.trim(), id_number: adminId.trim(), role: 'admin', pin: adminPin });
      await SettingsService.set('institution_name', institutionName.trim());
      Alert.alert('Setup Complete', 'Library system is ready!', [{ text: 'Login', onPress: () => router.replace('/(auth)/login') }]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ paddingBottom: 40 }}>
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      <View className="bg-brand px-6 pb-8 rounded-b-[32px] pt-[60px]">
        <Text className="text-3xl font-extrabold text-white">Bookleaf Setup</Text>
        <Text className="text-sm text-[#A8D5A2] mt-1">Set up your institution and admin account</Text>
      </View>

      <View className="px-6 pt-6 gap-4">
        {/* Institution */}
        <View className="bg-white rounded-2xl p-4 gap-3"
          style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
          <Text className="text-xs font-bold text-brand uppercase tracking-widest">Institution</Text>
          <TextInput
            className="bg-bio border border-mint rounded-xl px-4 py-3 text-base text-[#1C2B1E]"
            value={institutionName}
            onChangeText={setInstitutionName}
            placeholder="Institution name"
            placeholderTextColor="#94A3B8"
          />
        </View>

        {/* Admin account */}
        <View className="bg-white rounded-2xl p-4 gap-3"
          style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
          <Text className="text-xs font-bold text-brand uppercase tracking-widest">Admin Account</Text>
          <TextInput
            className="bg-bio border border-mint rounded-xl px-4 py-3 text-base text-[#1C2B1E]"
            value={adminName}
            onChangeText={setAdminName}
            placeholder="Full name"
            placeholderTextColor="#94A3B8"
          />
          <TextInput
            className="bg-bio border border-mint rounded-xl px-4 py-3 text-base text-[#1C2B1E]"
            value={adminId}
            onChangeText={setAdminId}
            placeholder="ID number"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
          />
          <TextInput
            className="bg-bio border border-mint rounded-xl px-4 py-3 text-base text-[#1C2B1E]"
            value={adminPin}
            onChangeText={setAdminPin}
            placeholder="PIN (min 4 digits)"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            keyboardType="numeric"
          />
          <TextInput
            className="bg-bio border border-mint rounded-xl px-4 py-3 text-base text-[#1C2B1E]"
            value={confirmPin}
            onChangeText={setConfirmPin}
            placeholder="Confirm PIN"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            keyboardType="numeric"
          />
        </View>

        <TouchableOpacity
          className="bg-leaf rounded-2xl py-4 items-center"
          onPress={handleSetup}
          disabled={loading}
          style={{ elevation: 4, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 }}
        >
          <Text className="text-white font-bold text-base">{loading ? 'Setting up…' : 'Complete Setup'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
