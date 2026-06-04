// Polyfill `crypto.getRandomValues` for React Native — must run before any
// module that imports crypto-js. See src/polyfills.ts for details.
import { db, migrations, seedDefaults } from '@bookleaf/db'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { Text, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import '../../global.css'
import { ErrorBoundary } from '../components/common/ErrorBoundary'
import '../polyfills'

SplashScreen.preventAutoHideAsync()

const queryClient = new QueryClient()

export default function RootLayout() {
    const { success, error } = useMigrations(db, migrations)

    useEffect(() => {
        if (success) {
            seedDefaults()
            SplashScreen.hideAsync()
        }
    }, [success])

    useEffect(() => {
        if (error) SplashScreen.hideAsync()
    }, [error])

    if (error) {
        return (
            <View className='flex-1 justify-center items-center'>
                <Text>Database error: {error.message}</Text>
            </View>
        )
    }

    if (!success) return null

    return (
        <GestureHandlerRootView className='flex-1'>
            <ErrorBoundary>
                <QueryClientProvider client={queryClient}>
                    <StatusBar style='dark' />
                    <Stack screenOptions={{ headerShown: false }}>
                        <Stack.Screen name='index' />
                        <Stack.Screen name='(auth)' />
                        <Stack.Screen name='(server)' />
                    </Stack>
                </QueryClientProvider>
            </ErrorBoundary>
        </GestureHandlerRootView>
    )
}
