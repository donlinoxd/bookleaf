import { Image, StatusBar, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import MASCOT from '../../assets/images/bookleaf-mascot.png';

export default function ScanScreen() {
  return (
    <View className="flex-1 bg-bio">
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />

      <View className="bg-brand px-5 pb-6 rounded-b-[28px]" style={{ paddingTop: 52 }}>
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="text-2xl font-extrabold text-white">Scanner</Text>
            <Text className="text-xs text-[#A8D5A2] mt-1">Quick scan for borrow & return</Text>
          </View>
          <Image source={MASCOT} className="w-20 h-20 -mb-2" resizeMode="contain" />
        </View>
      </View>

      <View className="flex-1 items-center justify-center px-10">
        <View className="w-32 h-32 rounded-full bg-mint items-center justify-center mb-6"
          style={{ elevation: 4, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 8 }}>
          <Ionicons name="scan-outline" size={60} color="#2A5C33" />
        </View>
        <Text className="text-xl font-extrabold text-brand mb-2">Coming Soon</Text>
        <Text className="text-sm text-[#7A9A7E] text-center leading-5">
          QR and barcode scanning for instant borrow & return will be available here.
        </Text>
      </View>
    </View>
  );
}
