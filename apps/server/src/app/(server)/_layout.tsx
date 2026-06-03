import { Ionicons } from '@expo/vector-icons'
import { Tabs, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { CustomTabBar } from '../../components/navigation/CustomTabBar'
import { ErrorBoundary } from '../../components/common/ErrorBoundary'
import { ServerBridge } from '../../services/ServerBridge'
import { useAppStore } from '../../store/appStore'

export default function ServerLayout() {
    const router = useRouter()
    const mode = useAppStore((s) => s.mode)
    const currentUser = useAppStore((s) => s.currentUser)
    const institution = useAppStore((s) => s.institution)
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'librarian'

    // Mode guard: bounce back to the boot screen if this device isn't
    // actually in server mode. Boot will re-route based on persisted
    // app_mode, which is the canonical source of truth.
    useEffect(() => {
        if (mode !== null && mode !== 'server') {
            router.replace('/')
        }
    }, [mode])

    useEffect(() => {
        if (mode === 'server' && institution?.id) {
            ServerBridge.start(institution.id, () => {});
        }
    }, [mode, institution?.id])

    return (
        <ErrorBoundary>
        <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <CustomTabBar {...props} accentRoute='scan' />}>
                    <Tabs.Screen
                        name='dashboard'
                        options={{
                            title: 'Dashboard',
                            tabBarLabel: 'Home',
                            tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />,
                        }}
                    />
                    <Tabs.Screen
                        name='books'
                        options={{
                            title: 'Catalog',
                            tabBarLabel: 'Catalog',
                            tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'library' : 'library-outline'} size={size} color={color} />,
                        }}
                    />
                    <Tabs.Screen
                        name='scan'
                        options={{
                            title: 'Scan',
                            tabBarLabel: 'Scan',
                            tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'scan' : 'scan-outline'} size={size} color={color} />,
                        }}
                    />
                    <Tabs.Screen
                        name='members'
                        options={{
                            title: 'Members',
                            tabBarLabel: 'Members',
                            href: isAdmin ? undefined : null,
                            tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={size} color={color} />,
                        }}
                    />
                    <Tabs.Screen
                        name='opac'
                        options={{
                            title: 'OPAC',
                            tabBarLabel: 'OPAC',
                            tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'search' : 'search-outline'} size={size} color={color} />,
                        }}
                    />
                    <Tabs.Screen name='ai-chat' options={{ href: null }} />
                    <Tabs.Screen name='borrow' options={{ href: null }} />
                    <Tabs.Screen name='settings' options={{ href: null }} />
                    <Tabs.Screen name='book/[id]' options={{ href: null }} />
                    <Tabs.Screen name='book/add' options={{ href: null }} />
                    <Tabs.Screen name='member/[id]' options={{ href: null }} />
                    <Tabs.Screen name='member/add' options={{ href: null }} />
                    <Tabs.Screen name='inventory-scan' options={{ href: null }} />
                    <Tabs.Screen name='inventory-report/[sessionId]' options={{ href: null }} />
                    <Tabs.Screen name='gate-scan' options={{ href: null }} />
                    <Tabs.Screen name='gate-qr' options={{ href: null }} />
                    <Tabs.Screen name='reports' options={{ href: null }} />
                    <Tabs.Screen name='reservations' options={{ href: null }} />
        </Tabs>
        </ErrorBoundary>
    )
}
