import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../store/appStore';

export default function Index() {
  const router = useRouter();
  const hydrateClientSession = useAppStore((s) => s.hydrateClientSession);

  useEffect(() => {
    (async () => {
      const restored = await hydrateClientSession();
      router.replace(restored ? '/(client)/home' : '/(auth)/connect');
    })();
  }, []);

  return (
    <View className="flex-1 justify-center items-center bg-[#2A5C33]">
      <ActivityIndicator size="large" color="#E2EFE0" />
    </View>
  );
}
