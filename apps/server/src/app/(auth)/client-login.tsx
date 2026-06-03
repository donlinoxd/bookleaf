import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useAppStore } from '../../store/appStore'

import MASCOT from '../../../assets/images/bookleaf-mascot.png'

export default function ClientLoginScreen() {
    const router = useRouter()
    const { serverUrl, setCurrentUser, setClientSession } = useAppStore()
    const [idNumber, setIdNumber] = useState('')
    const [pin, setPin] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSignIn = async () => {
        if (!idNumber.trim() || !pin.trim()) {
            Alert.alert('Error', 'Please enter your ID and PIN')
            return
        }
        if (!serverUrl) return
        setLoading(true)
        try {
            const res = await fetch(`${serverUrl}/api/auth/member`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idNumber: idNumber.trim(), pin: pin.trim() }),
            })
            const data = await res.json()
            if (res.status === 429) {
                const mins = Math.ceil((data.retry_after ?? 60) / 60)
                Alert.alert('Too Many Attempts', `Please try again in about ${mins} minute${mins === 1 ? '' : 's'}.`)
                return
            }
            if (!res.ok || data.error) {
                Alert.alert('Login Failed', data.error ?? 'Invalid ID or PIN')
                return
            }
            if (!data.user || !data.token || !data.expires_at) {
                Alert.alert('Login Failed', 'Server returned incomplete data. Make sure the library server is up to date.')
                return
            }
            await setClientSession({
                user: data.user,
                token: data.token,
                expires_at: data.expires_at,
                serverUrl,
            })
            router.replace('/(client)/home')
        } catch {
            Alert.alert('Error', 'Could not reach the library server.')
        } finally {
            setLoading(false)
        }
    }

    const handleGuest = () => {
        setCurrentUser(null)
        router.replace('/(client)/home')
    }

    return (
        <KeyboardAvoidingView className='flex-1 bg-bio' behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps='handled'>
                {/* Header */}
                <View className='bg-brand items-center px-6 pb-8 rounded-b-[36px] pt-16'>
                    <Image source={MASCOT} className='w-20 h-20 mb-3' resizeMode='contain' />
                    <Text className='text-3xl font-extrabold text-white'>Bookleaf</Text>
                    <Text className='text-sm text-[#A8D5A2] mt-1'>Connected to library</Text>
                </View>

                <View className='flex-1 px-6 pt-8 gap-5'>
                    {/* Sign In card */}
                    <View
                        className='bg-white rounded-2xl p-5 gap-4'
                        style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                    >
                        <View className='flex-row items-center gap-2'>
                            <Ionicons name='person-circle-outline' size={22} color='#2A5C33' />
                            <Text className='text-base font-extrabold text-[#1C2B1E]'>Sign In</Text>
                        </View>

                        <View className='gap-3'>
                            <View>
                                <Text className='text-xs font-bold text-brand uppercase tracking-widest mb-1.5'>ID Number</Text>
                                <TextInput
                                    className='bg-bio border border-mint rounded-2xl px-4 py-3.5 text-base text-[#1C2B1E]'
                                    value={idNumber}
                                    onChangeText={setIdNumber}
                                    placeholder='Enter your ID number'
                                    placeholderTextColor='#94A3B8'
                                    autoCapitalize='none'
                                />
                            </View>
                            <View>
                                <Text className='text-xs font-bold text-brand uppercase tracking-widest mb-1.5'>PIN</Text>
                                <TextInput
                                    className='bg-bio border border-mint rounded-2xl px-4 py-3.5 text-base text-[#1C2B1E]'
                                    value={pin}
                                    onChangeText={setPin}
                                    placeholder='Enter your PIN'
                                    placeholderTextColor='#94A3B8'
                                    secureTextEntry
                                    keyboardType='numeric'
                                    onSubmitEditing={handleSignIn}
                                />
                            </View>
                        </View>

                        <TouchableOpacity
                            className='bg-leaf rounded-2xl py-4 items-center'
                            onPress={handleSignIn}
                            disabled={loading}
                            style={{
                                elevation: 4,
                                shadowColor: '#5CB85C',
                                shadowOffset: { width: 0, height: 3 },
                                shadowOpacity: 0.3,
                                shadowRadius: 6,
                            }}
                        >
                            <Text className='text-white font-bold text-base'>{loading ? 'Signing in…' : 'Sign In'}</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Divider */}
                    <View className='flex-row items-center gap-3'>
                        <View className='flex-1 h-px bg-mint-dark' />
                        <Text className='text-xs font-semibold text-[#94A3B8]'>OR</Text>
                        <View className='flex-1 h-px bg-mint-dark' />
                    </View>

                    {/* Guest card */}
                    <TouchableOpacity
                        className='bg-white rounded-2xl p-5 flex-row items-center gap-4'
                        onPress={handleGuest}
                        style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                        activeOpacity={0.75}
                    >
                        <View className='w-11 h-11 bg-mint rounded-xl items-center justify-center'>
                            <Ionicons name='book-outline' size={22} color='#2A5C33' />
                        </View>
                        <View className='flex-1'>
                            <Text className='text-sm font-bold text-[#1C2B1E]'>Browse as Guest</Text>
                            <Text className='text-xs text-[#7A9A7E] mt-0.5'>Search the catalog without signing in</Text>
                        </View>
                        <Ionicons name='chevron-forward' size={18} color='#94A3B8' />
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    )
}
