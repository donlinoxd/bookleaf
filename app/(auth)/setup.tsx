import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { Image, StatusBar, Text, TouchableOpacity, View } from 'react-native'
import { useAppStore } from '../../src/store/appStore'

import MASCOT from '../../assets/images/bookleaf-mascot.png'

export default function SetupScreen() {
    const router = useRouter()
    const setMode = useAppStore((s) => s.setMode)

    const selectMode = async (mode: 'server' | 'client') => {
        await AsyncStorage.setItem('app_mode', mode)
        setMode(mode)
        router.replace(mode === 'server' ? '/(auth)/register' : '/(auth)/connect')
    }

    return (
        <View className='flex-1 bg-bio px-6 justify-center'>
            <StatusBar barStyle='dark-content' backgroundColor='#FAFDF9' />

            <View className='items-center mb-10'>
                <Image source={MASCOT} className='w-32 h-32 mb-4' resizeMode='contain' />
                <Text className='text-4xl font-extrabold text-brand'>Bookleaf</Text>
                <Text className='text-base text-[#7A9A7E] mt-2 text-center'>Choose how this device will be used</Text>
            </View>

            <View className='gap-4'>
                {/* Server card */}
                <TouchableOpacity
                    className='bg-brand rounded-3xl p-6'
                    onPress={() => selectMode('server')}
                    style={{ elevation: 6, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 }}
                    activeOpacity={0.88}
                >
                    <Text className='text-3xl mb-3'>📚</Text>
                    <Text className='text-xl font-extrabold text-white mb-2'>Bookleaf Server</Text>
                    <Text className='text-sm text-[#A8D5A2] leading-5 mb-3'>
                        This device manages the library.{'\n'}Hosts the database and API for all other devices.
                    </Text>
                    <View className='bg-[#ffffff20] self-start rounded-full px-3 py-1'>
                        <Text className='text-xs text-white font-semibold'>For the librarian's device</Text>
                    </View>
                </TouchableOpacity>

                {/* Client card */}
                <TouchableOpacity
                    className='bg-white rounded-3xl p-6 border-2 border-mint'
                    onPress={() => selectMode('client')}
                    style={{ elevation: 3, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 }}
                    activeOpacity={0.88}
                >
                    <Text className='text-3xl mb-3'>🔍</Text>
                    <Text className='text-xl font-extrabold text-brand mb-2'>OPAC Client</Text>
                    <Text className='text-sm text-[#5A7A5E] leading-5 mb-3'>
                        Browse and search the library catalog.{'\n'}Connects to the server over Wi-Fi.
                    </Text>
                    <View className='bg-mint self-start rounded-full px-3 py-1'>
                        <Text className='text-xs text-brand font-semibold'>For students and teachers</Text>
                    </View>
                </TouchableOpacity>
            </View>
        </View>
    )
}
