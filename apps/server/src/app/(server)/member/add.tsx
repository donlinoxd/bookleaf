import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { UserService } from '../../../src/services/UserService'
import { useAppStore } from '../../../src/store/appStore'
import { UserRole, UserType } from '../../../src/types'

const ROLES: UserRole[] = ['member', 'librarian', 'admin']

const USER_TYPES: { value: UserType; label: string }[] = [
    { value: 'student', label: 'Student' },
    { value: 'faculty', label: 'Faculty' },
    { value: 'alumni', label: 'Alumni' },
    { value: 'external', label: 'External' },
]

const ROLE_CONFIG: Record<UserRole, { label: string; hint: string; active: string; activeBg: string }> = {
    member: { label: 'Member', hint: 'Borrow only', active: '#15803D', activeBg: '#DCFCE7' },
    librarian: { label: 'Librarian', hint: 'Manage books', active: '#2A5C33', activeBg: '#E2EFE0' },
    admin: { label: 'Admin', hint: 'Full access', active: '#7C3AED', activeBg: '#EDE9FE' },
}

export default function AddMemberScreen() {
    const router = useRouter()
    const queryClient = useQueryClient()
    const institution = useAppStore((s) => s.institution)
    const [name, setName] = useState('')
    const [idNumber, setIdNumber] = useState('')
    const [role, setRole] = useState<UserRole>('member')
    const [userType, setUserType] = useState<UserType | null>(null)
    const [department, setDepartment] = useState('')
    const [pin, setPin] = useState('')
    const [confirmPin, setConfirmPin] = useState('')

    const createMutation = useMutation({
        mutationFn: () =>
            UserService.create({
                institution_id: institution!.id,
                name: name.trim(),
                id_number: idNumber.trim(),
                role,
                pin,
                department: department.trim() || undefined,
                user_type: userType ?? undefined,
            }),
        onSuccess: (userId) => {
            queryClient.invalidateQueries({ queryKey: ['members'] })
            Alert.alert('Member Added', `${name.trim()} has been registered.`, [
                { text: 'View Profile', onPress: () => router.replace(`/(server)/member/${userId}`) },
                { text: 'Add Another', onPress: () => router.replace('/(server)/member/add') },
            ])
        },
        onError: (e: any) => {
            Alert.alert('Error', e.message?.includes('UNIQUE') ? 'That ID number is already registered.' : (e.message ?? 'Failed to save member'))
        },
    })

    const handleSave = () => {
        if (!name.trim()) {
            Alert.alert('Error', 'Full name is required')
            return
        }
        if (!idNumber.trim()) {
            Alert.alert('Error', 'ID number is required')
            return
        }
        if (pin.length < 4) {
            Alert.alert('Error', 'PIN must be at least 4 digits')
            return
        }
        if (pin !== confirmPin) {
            Alert.alert('Error', 'PINs do not match')
            return
        }
        if (!institution) {
            Alert.alert('Error', 'No institution found')
            return
        }
        createMutation.mutate()
    }

    const pinStrength = pin.length >= 6 ? 'strong' : pin.length >= 4 ? 'ok' : 'weak'

    return (
        <View className='flex-1 bg-bio'>
            {/* Top bar */}
            <View className='bg-brand flex-row items-center justify-between px-5 pb-4 pt-[52px] rounded-b-[24px]'>
                <TouchableOpacity onPress={() => router.back()} className='flex-row items-center gap-1'>
                    <Ionicons name='chevron-back' size={20} color='#A8D5A2' />
                    <Text className='text-[#A8D5A2] text-sm font-medium'>Cancel</Text>
                </TouchableOpacity>
                <Text className='text-white font-extrabold text-base'>Add Member</Text>
                <TouchableOpacity
                    className='bg-leaf rounded-xl px-4 py-2 items-center min-w-[60px]'
                    onPress={handleSave}
                    disabled={createMutation.isPending}
                    style={{ elevation: 3, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 }}
                >
                    {createMutation.isPending ? (
                        <ActivityIndicator color='#FFFFFF' size='small' />
                    ) : (
                        <Text className='text-white font-bold text-sm'>Save</Text>
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 150 }}>
                {/* Personal info */}
                <View
                    className='bg-white rounded-2xl p-4 gap-3'
                    style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                >
                    <Text className='text-xs font-bold text-brand uppercase tracking-widest'>Personal Info</Text>
                    <TextInput
                        className='bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]'
                        value={name}
                        onChangeText={setName}
                        placeholder='Full name *'
                        placeholderTextColor='#94A3B8'
                    />
                    <TextInput
                        className='bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]'
                        value={idNumber}
                        onChangeText={setIdNumber}
                        placeholder='ID number * (must be unique)'
                        placeholderTextColor='#94A3B8'
                        autoCapitalize='none'
                    />
                </View>

                {/* Role */}
                <View
                    className='bg-white rounded-2xl p-4 gap-3'
                    style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                >
                    <Text className='text-xs font-bold text-brand uppercase tracking-widest'>Role</Text>
                    <View className='flex-row gap-2'>
                        {ROLES.map((r) => {
                            const cfg = ROLE_CONFIG[r]
                            const active = role === r
                            return (
                                <TouchableOpacity
                                    key={r}
                                    className='flex-1 rounded-xl py-3 items-center gap-0.5'
                                    style={{ backgroundColor: active ? cfg.activeBg : '#F1F5F9' }}
                                    onPress={() => setRole(r)}
                                >
                                    <Text className='text-sm font-bold capitalize' style={{ color: active ? cfg.active : '#64748B' }}>
                                        {cfg.label}
                                    </Text>
                                    <Text className='text-[10px]' style={{ color: active ? cfg.active + 'AA' : '#94A3B8' }}>
                                        {cfg.hint}
                                    </Text>
                                </TouchableOpacity>
                            )
                        })}
                    </View>
                </View>

                {/* Patron Classification */}
                <View
                    className='bg-white rounded-2xl p-4 gap-3'
                    style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                >
                    <Text className='text-xs font-bold text-brand uppercase tracking-widest'>Patron Classification</Text>
                    <Text className='text-xs text-[#7A9A7E]'>Used for accreditation reports. Optional but recommended.</Text>
                    <View className='flex-row flex-wrap gap-2'>
                        {USER_TYPES.map((t) => {
                            const active = userType === t.value
                            return (
                                <TouchableOpacity
                                    key={t.value}
                                    className='rounded-xl px-4 py-2.5'
                                    style={{ backgroundColor: active ? '#2A5C33' : '#F1F5F9' }}
                                    onPress={() => setUserType(active ? null : t.value)}
                                >
                                    <Text className='text-sm font-bold' style={{ color: active ? '#FFFFFF' : '#64748B' }}>
                                        {t.label}
                                    </Text>
                                </TouchableOpacity>
                            )
                        })}
                    </View>
                    <TextInput
                        className='bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]'
                        value={department}
                        onChangeText={setDepartment}
                        placeholder='Department / Program (optional)'
                        placeholderTextColor='#94A3B8'
                    />
                </View>

                {/* PIN */}
                <View
                    className='bg-white rounded-2xl p-4 gap-3'
                    style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                >
                    <Text className='text-xs font-bold text-brand uppercase tracking-widest'>Login PIN</Text>
                    <Text className='text-xs text-[#7A9A7E]'>The member will use this PIN to log in to the system.</Text>
                    <TextInput
                        className='bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]'
                        value={pin}
                        onChangeText={setPin}
                        placeholder='PIN (min 4 digits) *'
                        placeholderTextColor='#94A3B8'
                        secureTextEntry
                        keyboardType='numeric'
                    />
                    <TextInput
                        className='bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]'
                        value={confirmPin}
                        onChangeText={setConfirmPin}
                        placeholder='Confirm PIN *'
                        placeholderTextColor='#94A3B8'
                        secureTextEntry
                        keyboardType='numeric'
                    />
                    {pin.length > 0 && (
                        <View
                            className={`rounded-xl py-2.5 px-4 ${pinStrength === 'strong' ? 'bg-mint' : pinStrength === 'ok' ? 'bg-yellow-50' : 'bg-red-50'}`}
                        >
                            <Text
                                className={`text-xs font-bold text-center ${pinStrength === 'strong' ? 'text-brand' : pinStrength === 'ok' ? 'text-yellow-700' : 'text-red-600'}`}
                            >
                                {pinStrength === 'strong'
                                    ? 'Strong PIN ✓'
                                    : pinStrength === 'ok'
                                      ? 'Acceptable PIN'
                                      : `${4 - pin.length} more digit${4 - pin.length > 1 ? 's' : ''} needed`}
                            </Text>
                        </View>
                    )}
                </View>
            </ScrollView>
        </View>
    )
}
