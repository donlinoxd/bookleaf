import '../polyfills';
import '../../global.css';
import { useEffect, useMemo, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { TRPCProvider, createTrpcClient } from '../lib/trpc';
import { useAppStore } from '../store/appStore';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Re-create the tRPC client whenever serverUrl changes (user connects to a different server).
  // Must be a string — tRPC v11 resolves url via .toString() at link creation.
  const serverUrl = useAppStore((s) => s.serverUrl);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );
  const trpcClient = useMemo(() => createTrpcClient(serverUrl ?? ''), [serverUrl]);

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }} />
        </GestureHandlerRootView>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
