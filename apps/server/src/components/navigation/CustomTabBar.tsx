import { Ionicons } from '@expo/vector-icons'
import { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const BRAND = '#2A5C33'
const LEAF = '#5CB85C'
const INACTIVE = '#94A3B8'

interface Props extends BottomTabBarProps {
    accentRoute?: string
}

const HIDDEN_ROUTES = ['scan', 'ai-chat', 'inventory-scan', 'gate-scan']

export function CustomTabBar({ state, descriptors, navigation, accentRoute }: Props) {
    const insets = useSafeAreaInsets()

    const activeRoute = state.routes[state.index]
    if (HIDDEN_ROUTES.includes(activeRoute.name)) return null

    const visibleRoutes = state.routes.filter((route) => {
        const opts = descriptors[route.key].options
        if (!opts.tabBarButton) return true
        try {
            return (opts.tabBarButton as Function)({ children: null }) !== null
        } catch {
            return true
        }
    })

    const accentIdx = accentRoute ? visibleRoutes.findIndex((r) => r.name === accentRoute) : null

    return (
        <View
            style={{
                position: 'absolute',
                bottom: Math.max(insets.bottom, 8) + 8,
                left: 16,
                right: 16,
            }}
        >
            <View
                className="flex-row bg-white rounded-[28px] py-[10px] px-[6px] items-center"
                style={{
                    elevation: 10,
                    shadowColor: '#2A5C33',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.15,
                    shadowRadius: 16,
                }}
            >
                {visibleRoutes.map((route, idx) => {
                    const opts = descriptors[route.key].options
                    const label = (opts.tabBarLabel ?? opts.title ?? route.name) as string
                    const isActive = route.key === state.routes[state.index].key
                    const isAccent = idx === accentIdx

                    const press = () => {
                        const ev = navigation.emit({
                            type: 'tabPress',
                            target: route.key,
                            canPreventDefault: true,
                        })
                        if (!isActive && !ev.defaultPrevented) navigation.navigate(route.name)
                    }

                    // Center accent — scanner button
                    if (isAccent) {
                        return (
                            <TouchableOpacity key={route.key} onPress={press} activeOpacity={0.85} className="flex-1 items-center">
                                <View
                                    className="w-[58px] h-[58px] rounded-full bg-leaf items-center justify-center border-[3px] border-white"
                                    style={{
                                        marginTop: -28,
                                        elevation: 8,
                                        shadowColor: LEAF,
                                        shadowOffset: { width: 0, height: 4 },
                                        shadowOpacity: 0.4,
                                        shadowRadius: 8,
                                    }}
                                >
                                    <Ionicons name='scan-outline' size={26} color='#FFFFFF' />
                                </View>
                                <Text className="text-[10px] text-[#94A3B8] font-medium mt-[3px]" numberOfLines={1}>
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        )
                    }

                    // Regular tab — filled icon + sage label when active, no background
                    return (
                        <TouchableOpacity
                            key={route.key}
                            onPress={press}
                            activeOpacity={0.7}
                            className="flex-1 items-center py-1"
                        >
                            {opts.tabBarIcon?.({
                                focused: isActive,
                                color: isActive ? BRAND : INACTIVE,
                                size: 22,
                            })}
                            <Text
                                className={`text-[10px] mt-[3px] ${isActive ? 'text-brand font-bold' : 'text-[#94A3B8] font-medium'}`}
                                numberOfLines={1}
                            >
                                {label}
                            </Text>
                        </TouchableOpacity>
                    )
                })}
            </View>
        </View>
    )
}
