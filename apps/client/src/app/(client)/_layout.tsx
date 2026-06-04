import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { ErrorBoundary } from '../../components/common/ErrorBoundary'
import { CustomTabBar } from '../../components/navigation/CustomTabBar'

export default function ClientLayout() {
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
    )
}
