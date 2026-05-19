import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from '../src/store/appStore';
import { AppMode } from '../src/types';

export default function Index() {
  const router = useRouter();
  const setMode = useAppStore((s) => s.setMode);

  useEffect(() => {
    (async () => {
      const savedMode = await AsyncStorage.getItem('app_mode') as AppMode | null;
      if (savedMode === 'server') {
        setMode('server');
        router.replace('/(auth)/login');
      } else if (savedMode === 'client') {
        setMode('client');
        router.replace('/(auth)/connect');
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
