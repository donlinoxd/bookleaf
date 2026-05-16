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
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#2563EB" />
    </View>
  );
}
