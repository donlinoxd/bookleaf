import { Ionicons } from '@expo/vector-icons'
import { Tabs, useRouter } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated from 'react-native-reanimated'
import { CustomTabBar } from '../../src/components/navigation/CustomTabBar'
import { useAppStore } from '../../src/store/appStore'

export default function ServerLayout() {
    const router = useRouter()
    const currentUser = useAppStore((s) => s.currentUser)
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'librarian'

    const swipe = Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([40, Infinity])
        .failOffsetY([-15, 15])
        .onEnd((e) => {
            if (e.translationX > 80 && e.velocityX > 300) {
                router.push('/(server)/ai-chat')
            }
        })

    return (
        <GestureDetector gesture={swipe}>
            <Animated.View style={{ flex: 1 }}>
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
                </Tabs>
            </Animated.View>
        </GestureDetector>
    )
}
