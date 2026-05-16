import { Tabs } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { Ionicons } from '@expo/vector-icons';

export default function ServerLayout() {
  const currentUser = useAppStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'librarian';

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#2563EB' }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="books"
        options={{
          title: 'Books',
          tabBarLabel: 'Books',
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="borrow"
        options={{
          title: 'Borrow/Return',
          tabBarLabel: 'Borrow',
          tabBarIcon: ({ color, size }) => <Ionicons name="swap-horizontal-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: 'Members',
          tabBarLabel: 'Members',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="opac"
        options={{
          title: 'OPAC',
          tabBarLabel: 'Catalog',
          tabBarIcon: ({ color, size }) => <Ionicons name="search-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="book/[id]" options={{ href: null }} />
      <Tabs.Screen name="book/add" options={{ href: null }} />
      <Tabs.Screen name="member/[id]" options={{ href: null }} />
      <Tabs.Screen name="member/add" options={{ href: null }} />
    </Tabs>
  );
}
