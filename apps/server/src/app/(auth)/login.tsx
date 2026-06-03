import { eq } from 'drizzle-orm'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Image, KeyboardAvoidingView, Platform, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { db } from '@bookleaf/db'
import { institutions } from '@bookleaf/db'
import { SettingsService } from '../../services/SettingsService'
import { UserService } from '../../services/UserService'
import { useAppStore } from '../../store/appStore'

import MASCOT from '../../../assets/'images/bookleaf-mascot.png'

export default function LoginScreen() {
    const router = useRouter()
    const { setCurrentUser, setSettings, setInstitution } = useAppStore()
    const [idNumber, setIdNumber] = useState('')
    const [pin, setPin] = useState('')
    const [loading, setLoading] = useState(false)

    const handleLogin = async () => {
        if (!idNumber.trim() || !pin.trim()) {
            Alert.alert('Error', 'Please enter your ID and PIN')
            return
        }
        setLoading(true)
        try {
            const user = await UserService.authenticate(idNumber.trim(), pin.trim())
            if (!user) {
                Alert.alert('Login Failed', 'Invalid ID number or PIN')
                return
            }
            const [settings, institutionRows] = await Promise.all([
                SettingsService.getAll(),
                db.select().from(institutions).where(eq(institutions.id, user.institution_id)).limit(1),
            ])
            const institution = institutionRows[0] ?? null
            setCurrentUser(user)
            setSettings(settings)
            if (institution) setInstitution(institution)
            router.replace(user.role === 'admin' || user.role === 'librarian' ? '/(server)/dashboard' : '/(server)/opac')
        } catch {
            Alert.alert('Error', 'Login failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <KeyboardAvoidingView className='flex-1 bg-bio' behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />

            {/* Header */}
            <View className='bg-brand items-center px-6 pb-8 rounded-b-[36px] pt-16'>
                <Image source={MASCOT} className='w-20 h-20 mb-3' resizeMode='contain' />
                <Text className='text-3xl font-extrabold text-white'>Bookleaf</Text>
                <Text className='text-sm text-[#A8D5A2] mt-1'>Sign in to continue</Text>
            </View>

            <View className='flex-1 px-6 pt-8'>
                <View className='gap-3'>
                    <View>
                        <Text className='text-xs font-bold text-brand uppercase tracking-widest mb-1.5'>ID Number</Text>
                        <TextInput
                            className='bg-white border border-mint rounded-2xl px-4 py-3.5 text-base text-[#1C2B1E]'
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
                            className='bg-white border border-mint rounded-2xl px-4 py-3.5 text-base text-[#1C2B1E]'
                            value={pin}
                            onChangeText={setPin}
                            placeholder='Enter your PIN'
                            placeholderTextColor='#94A3B8'
                            secureTextEntry
                            keyboardType='numeric'
                        />
                    </View>

                    <TouchableOpacity
                        className='bg-leaf rounded-2xl py-4 items-center mt-2'
                        onPress={handleLogin}
                        disabled={loading}
                        style={{ elevation: 4, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 }}
                    >
                        <Text className='text-white font-bold text-base'>{loading ? 'Signing in…' : 'Sign In'}</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity className='mt-6 items-center' onPress={() => router.push('/(auth)/guest')}>
                    <Text className='text-brand font-semibold text-sm'>Browse catalog as guest</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    )
}
