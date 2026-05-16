import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ClientLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#2A5C33', tabBarInactiveTintColor: '#94A3B8' }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Catalog',
          tabBarLabel: 'Catalog',
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="my-books"
        options={{
          title: 'My Books',
          tabBarLabel: 'My Books',
          tabBarIcon: ({ color, size }) => <Ionicons name="bookmark-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="my-card"
        options={{
          title: 'My Card',
          tabBarLabel: 'My Card',
          tabBarIcon: ({ color, size }) => <Ionicons name="card-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
