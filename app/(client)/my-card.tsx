import { useState } from 'react';
import { Alert, Image, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/appStore';
import { MemberCard } from '../../src/components/members/MemberCard';

import MASCOT from '../../assets/images/bookleaf-mascot.png';

export default function MyCardScreen() {
  const serverUrl = useAppStore((s) => s.serverUrl);
  const [idNumber, setIdNumber] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLookup = async () => {
    const id = idNumber.trim();
    if (!id) return;
    if (!serverUrl) { Alert.alert('Not Connected', 'Connect to a library server first.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/members/${encodeURIComponent(id)}/borrows`);
      if (!res.ok) { Alert.alert('Not Found', 'No member found with that ID.'); return; }
      const data = await res.json();
      setName(data.member_name ?? id);
      setSubmitted(id);
    } catch {
      Alert.alert('Error', 'Could not reach the library server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ paddingBottom: 110 }}>
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      <View className="bg-brand px-5 pb-6 pt-[52px] rounded-b-[28px]">
        <View className="flex-row items-end justify-between mb-4">
          <View>
            <Text className="text-2xl font-extrabold text-white">My Library Card</Text>
            <Text className="text-xs text-[#A8D5A2] mt-1">Enter your ID to generate your QR card</Text>
          </View>
          <Image source={MASCOT} className="w-16 h-16 -mb-1" resizeMode="contain" />
        </View>

        <View className="flex-row bg-white rounded-2xl overflow-hidden"
          style={{ elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 }}>
          <TextInput
            className="flex-1 px-4 py-3.5 text-sm text-[#1C2B1E]"
            value={idNumber}
            onChangeText={setIdNumber}
            placeholder="Your ID number"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={handleLookup}
          />
          <TouchableOpacity className="bg-leaf px-5 justify-center" onPress={handleLookup} disabled={loading}>
            <Text className="text-white font-bold text-sm">{loading ? '…' : 'Get Card'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="px-5 pt-5">
        {submitted ? (
          <>
            <MemberCard
              name={name || submitted}
              idNumber={submitted}
              role="member"
              institutionName="Library Card"
            />
            <View className="bg-mint rounded-2xl px-4 py-3 mt-4 flex-row items-center gap-3">
              <Ionicons name="qr-code-outline" size={22} color="#2A5C33" />
              <Text className="flex-1 text-xs text-brand leading-4 font-medium">
                Show this QR code to the librarian when borrowing or returning books.
              </Text>
            </View>
          </>
        ) : (
          <View className="items-center pt-10">
            <View className="w-28 h-28 rounded-full bg-mint items-center justify-center mb-4">
              <Ionicons name="card-outline" size={52} color="#2A5C33" />
            </View>
            <Text className="text-base font-bold text-brand mb-1">Your card will appear here</Text>
            <Text className="text-xs text-[#7A9A7E] text-center">
              Enter your library ID number above to generate your QR card
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
