import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { View, Text, ActivityIndicator } from 'react-native';
import { useEffect } from 'react';
import { db, seedDefaults } from '../src/db';
import migrations from '../drizzle/migrations';

const queryClient = new QueryClient();

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

  useEffect(() => {
    if (success) {
      seedDefaults();
    }
  }, [success]);

  if (error) {
    return (
      <View className="flex-1 justify-center items-center">
        <Text>Database error: {error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View className="flex-1 justify-center items-center bg-[#2A5C33]">
        <ActivityIndicator color="#E2EFE0" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView className="flex-1">
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(server)" />
          <Stack.Screen name="(client)" />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
