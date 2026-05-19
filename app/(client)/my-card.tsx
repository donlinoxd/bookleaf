import { Image, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { MemberCard } from '../../src/components/members/MemberCard';

import MASCOT from '../../assets/images/bookleaf-mascot.png';

export default function MyCardScreen() {
  const { currentUser } = useAppStore();
  const router = useRouter();

  // Guest state — prompt to sign in
  if (!currentUser) {
    return (
      <View className="flex-1 bg-bio">
        <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />
        <View className="bg-brand px-5 pb-6 pt-[52px] rounded-b-[28px]">
          <View className="flex-row items-end justify-between">
            <View>
              <Text className="text-2xl font-extrabold text-white">My Library Card</Text>
              <Text className="text-xs text-[#A8D5A2] mt-1">Your personal QR library card</Text>
            </View>
            <Image source={MASCOT} className="w-16 h-16 -mb-1" resizeMode="contain" />
          </View>
        </View>
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <View className="w-16 h-16 bg-mint rounded-2xl items-center justify-center">
            <Ionicons name="card-outline" size={36} color="#2A5C33" />
          </View>
          <View className="items-center gap-1">
            <Text className="text-base font-bold text-[#1C2B1E]">Sign in to get your card</Text>
            <Text className="text-sm text-[#7A9A7E] text-center">Your QR library card is generated automatically once you sign in.</Text>
          </View>
          <TouchableOpacity
            className="bg-leaf rounded-2xl px-8 py-3.5 mt-2"
            onPress={() => router.push('/(auth)/client-login')}
            style={{ elevation: 4, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 }}
          >
            <Text className="text-white font-bold">Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ paddingBottom: 110 }}>
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      <View className="bg-brand px-5 pb-6 pt-[52px] rounded-b-[28px]">
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="text-2xl font-extrabold text-white">My Library Card</Text>
            <Text className="text-xs text-[#A8D5A2] mt-1">{currentUser.name}</Text>
          </View>
          <Image source={MASCOT} className="w-16 h-16 -mb-1" resizeMode="contain" />
        </View>
      </View>

      <View className="px-5 pt-5">
        <MemberCard
          name={currentUser.name}
          idNumber={currentUser.id_number}
          role={currentUser.role}
          institutionName="Library Card"
        />
        <View className="bg-mint rounded-2xl px-4 py-3 mt-4 flex-row items-center gap-3">
          <Ionicons name="qr-code-outline" size={22} color="#2A5C33" />
          <Text className="flex-1 text-xs text-brand leading-4 font-medium">
            Show this QR code to the librarian when borrowing or returning books.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
