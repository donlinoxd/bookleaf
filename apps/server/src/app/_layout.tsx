// Polyfill `crypto.getRandomValues` for React Native — must run before any
// module that imports crypto-js. See src/polyfills.ts for details.
import '../polyfills';
import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { View, Text } from 'react-native';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { db, seedDefaults } from '@bookleaf/db';
import { migrations } from '@bookleaf/db';
import { ErrorBoundary } from '../components/common/ErrorBoundary';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

  useEffect(() => {
    if (success) {
      seedDefaults();
      SplashScreen.hideAsync();
    }
  }, [success]);

  useEffect(() => {
    if (error) SplashScreen.hideAsync();
  }, [error]);

  if (error) {
    return (
      <View className="flex-1 justify-center items-center">
        <Text>Database error: {error.message}</Text>
      </View>
    );
  }

  if (!success) return null;

  return (
    <GestureHandlerRootView className="flex-1">
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(server)" />
            <Stack.Screen name="(client)" />
          </Stack>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
