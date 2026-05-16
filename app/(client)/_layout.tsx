import { Tabs } from 'expo-router';

export default function ClientLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#2563EB' }}>
      <Tabs.Screen name="home" options={{ title: 'Catalog', tabBarLabel: 'Catalog' }} />
      <Tabs.Screen name="my-books" options={{ title: 'My Books', tabBarLabel: 'My Books' }} />
    </Tabs>
  );
}
