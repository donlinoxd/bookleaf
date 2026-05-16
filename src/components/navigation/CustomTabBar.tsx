import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND = '#2A5C33';
const LEAF = '#5CB85C';
const INACTIVE = '#94A3B8';

interface Props extends BottomTabBarProps {
  accentRoute?: string;
}

export function CustomTabBar({ state, descriptors, navigation, accentRoute }: Props) {
  const insets = useSafeAreaInsets();

  const visibleRoutes = state.routes.filter((route) => {
    const opts = descriptors[route.key].options;
    if (!opts.tabBarButton) return true;
    try {
      return (opts.tabBarButton as Function)({ children: null }) !== null;
    } catch {
      return true;
    }
  });

  const accentIdx = accentRoute
    ? visibleRoutes.findIndex((r) => r.name === accentRoute)
    : Math.floor(visibleRoutes.length / 2);

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
        style={{
          flexDirection: 'row',
          backgroundColor: '#FFFFFF',
          borderRadius: 28,
          paddingVertical: 10,
          paddingHorizontal: 6,
          alignItems: 'center',
          elevation: 10,
          shadowColor: '#2A5C33',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.15,
          shadowRadius: 16,
        }}
      >
        {visibleRoutes.map((route, idx) => {
          const opts = descriptors[route.key].options;
          const label = (opts.tabBarLabel ?? opts.title ?? route.name) as string;
          const isActive = route.key === state.routes[state.index].key;
          const isAccent = idx === accentIdx;

          const press = () => {
            const ev = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isActive && !ev.defaultPrevented) navigation.navigate(route.name);
          };

          // Center accent — scanner button
          if (isAccent) {
            return (
              <TouchableOpacity
                key={route.key}
                onPress={press}
                activeOpacity={0.85}
                style={{ flex: 1, alignItems: 'center' }}
              >
                <View
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 29,
                    backgroundColor: LEAF,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: -28,
                    elevation: 8,
                    shadowColor: LEAF,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.4,
                    shadowRadius: 8,
                    borderWidth: 3,
                    borderColor: '#FFFFFF',
                  }}
                >
                  <Ionicons name="scan-outline" size={26} color="#FFFFFF" />
                </View>
                <Text
                  style={{
                    fontSize: 10,
                    color: INACTIVE,
                    fontWeight: '500',
                    marginTop: 3,
                  }}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          }

          // Regular tab — filled icon + sage label when active, no background
          return (
            <TouchableOpacity
              key={route.key}
              onPress={press}
              activeOpacity={0.7}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}
            >
              {opts.tabBarIcon?.({
                focused: isActive,
                color: isActive ? BRAND : INACTIVE,
                size: 22,
              })}
              <Text
                style={{
                  fontSize: 10,
                  color: isActive ? BRAND : INACTIVE,
                  fontWeight: isActive ? '700' : '500',
                  marginTop: 3,
                }}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
