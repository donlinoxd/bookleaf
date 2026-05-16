import { Tabs } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';

export default function ServerLayout() {
  const currentUser = useAppStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'librarian';

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#2563EB' }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarLabel: 'Home' }} />
      <Tabs.Screen name="books" options={{ title: 'Books', tabBarLabel: 'Books' }} />
      <Tabs.Screen name="borrow" options={{ title: 'Borrow/Return', tabBarLabel: 'Borrow' }} />
      <Tabs.Screen name="members" options={{ title: 'Members', tabBarLabel: 'Members', href: isAdmin ? undefined : null }} />
      <Tabs.Screen name="opac" options={{ title: 'OPAC', tabBarLabel: 'Catalog' }} />
    </Tabs>
  );
}
