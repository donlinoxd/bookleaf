import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@bookleaf/db';
import { institutions } from '@bookleaf/db';
import { useAppStore } from '../store/appStore';

export default function Index() {
  const router = useRouter();
  const setMode = useAppStore((s) => s.setMode);

  useEffect(() => {
    (async () => {
      const savedMode = await AsyncStorage.getItem('app_mode');
      if (savedMode === 'server') {
        setMode('server');
        const existing = await db.select({ id: institutions.id }).from(institutions).limit(1);
        router.replace(existing.length > 0 ? '/(auth)/login' : '/(auth)/register');
      } else {
        router.replace('/(auth)/setup');
      }
    })();
  }, []);

  return (
    <View className="flex-1 justify-center items-center bg-[#2A5C33]">
      <ActivityIndicator size="large" color="#E2EFE0" />
    </View>
  );
}
