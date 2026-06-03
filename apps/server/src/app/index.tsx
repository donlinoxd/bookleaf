import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@bookleaf/db';
import { institutions } from '@bookleaf/db';
import { useAppStore } from '../src/store/appStore';
import { AppMode } from '@bookleaf/types';

export default function Index() {
  const router = useRouter();
  const setMode = useAppStore((s) => s.setMode);
  const hydrateClientSession = useAppStore((s) => s.hydrateClientSession);

  useEffect(() => {
    (async () => {
      const savedMode = await AsyncStorage.getItem('app_mode') as AppMode | null;
      if (savedMode === 'server') {
        setMode('server');
        // If the user picked "server" but quit before completing registration,
        // no institution row exists yet — send them back to finish setup.
        const existing = await db.select({ id: institutions.id }).from(institutions).limit(1);
        router.replace(existing.length > 0 ? '/(auth)/login' : '/(auth)/register');
      } else if (savedMode === 'client') {
        setMode('client');
        const restored = await hydrateClientSession();
        router.replace(restored ? '/(client)/home' : '/(auth)/connect');
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
