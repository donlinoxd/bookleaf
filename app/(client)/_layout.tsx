import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CustomTabBar } from '../../src/components/navigation/CustomTabBar';

export default function ClientLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} accentRoute="my-books" />}
    >
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
    </Tabs>
  );
}
