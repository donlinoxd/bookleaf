import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useAppStore } from '../../store/appStore';
import { useTRPC, getTRPCErrorMessage } from '../../lib/trpc';
import MASCOT from '../../../assets/images/bookleaf-mascot.png';

export default function LoginScreen() {
  const router = useRouter();
  const { serverUrl, institutionId, institutionName, setClientSession } = useAppStore();
  const [idNumber, setIdNumber] = useState('');
  const [pin, setPin] = useState('');
  const trpc = useTRPC();

  const loginMutation = useMutation(
    trpc.auth.login.mutationOptions({
      onSuccess: async (result) => {
        if (!result?.user || !result.token || !result.expires_at) {
          Alert.alert('Login Failed', 'Server returned incomplete data.');
          return;
        }
        await setClientSession({
          user: result.user as any,
          token: result.token,
          expires_at: result.expires_at,
          serverUrl: serverUrl!,
          institutionId: institutionId ?? 1,
          institutionName: institutionName ?? 'Library',
        });
        router.replace('/(client)/home');
      },
      onError: (e) => Alert.alert('Login Failed', getTRPCErrorMessage(e)),
    }),
  );

  const handleSignIn = () => {
    if (!idNumber.trim() || !pin.trim()) {
      Alert.alert('Error', 'Please enter your ID and PIN');
      return;
    }
    loginMutation.mutate({ idNumber: idNumber.trim(), pin: pin.trim() });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />
        <View className="bg-brand px-5 pb-8 pt-[52px] rounded-b-[32px] items-center">
          <Image source={MASCOT} className="w-20 h-20 mb-3" resizeMode="contain" />
          <Text className="text-2xl font-extrabold text-white">
            {institutionName ?? 'Library'}
          </Text>
          <Text className="text-xs text-[#A8D5A2] mt-1">Sign in with your library ID and PIN</Text>
        </View>

        <View className="px-5 pt-8 gap-4">
          <View className="gap-1.5">
            <Text className="text-xs font-bold text-brand uppercase tracking-wider">Library ID</Text>
            <TextInput
              className="bg-white border border-mint-dark rounded-2xl px-4 py-4 text-[15px] text-[#1C2B1E]"
              placeholder="e.g. 2024-001"
              value={idNumber}
              onChangeText={setIdNumber}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View className="gap-1.5">
            <Text className="text-xs font-bold text-brand uppercase tracking-wider">PIN</Text>
            <TextInput
              className="bg-white border border-mint-dark rounded-2xl px-4 py-4 text-[15px] text-[#1C2B1E]"
              placeholder="4-digit PIN"
              value={pin}
              onChangeText={setPin}
              secureTextEntry
              keyboardType="number-pad"
            />
          </View>

          <TouchableOpacity
            className="bg-leaf rounded-2xl py-4 items-center mt-2"
            onPress={handleSignIn}
            disabled={loginMutation.isPending}
            style={{ elevation: 6, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }}
          >
            <Text className="text-white font-bold text-base">
              {loginMutation.isPending ? 'Signing in…' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="py-3 items-center flex-row justify-center gap-1"
            onPress={() => router.replace('/(auth)/connect')}
          >
            <Ionicons name="arrow-back-outline" size={14} color="#7A9A7E" />
            <Text className="text-sm text-[#7A9A7E]">Change server</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
