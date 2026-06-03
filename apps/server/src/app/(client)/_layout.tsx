import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { CustomTabBar } from '../../src/components/navigation/CustomTabBar';
import { ErrorBoundary } from '../../src/components/common/ErrorBoundary';
import { useAppStore } from '../../src/store/appStore';

export default function ClientLayout() {
  const router = useRouter();
  const mode = useAppStore((s) => s.mode);

  // Mode guard: bounce back to the boot screen if this device isn't
  // actually in client mode. Boot will re-route based on persisted
  // app_mode.
  useEffect(() => {
    if (mode !== null && mode !== 'client') {
      router.replace('/');
    }
  }, [mode]);

  return (
    <ErrorBoundary>
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: 'Catalog',
          tabBarLabel: 'Catalog',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'book' : 'book-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-books"
        options={{
          title: 'My Books',
          tabBarLabel: 'My Books',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'bookmark' : 'bookmark-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-card"
        options={{
          title: 'My Card',
          tabBarLabel: 'My Card',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'card' : 'card-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="gate"
        options={{
          title: 'Gate',
          tabBarLabel: 'Gate',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'qr-code' : 'qr-code-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="book/[id]" options={{ href: null }} />
    </Tabs>
    </ErrorBoundary>
  );
}
