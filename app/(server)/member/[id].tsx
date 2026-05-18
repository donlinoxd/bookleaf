import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { MemberCard } from '../../../src/components/members/MemberCard'
import { queryKeys } from '../../../src/lib/queryKeys'
import { BorrowService } from '../../../src/services/BorrowService'
import { UserService } from '../../../src/services/UserService'
import { useAppStore } from '../../../src/store/appStore'
import { Fine, User, UserRole, UserType } from '../../../src/types'
import { printMemberCard } from '../../../src/utils/printMemberCard'

const ROLE_COLOR: Record<UserRole, string> = {
    admin: '#7C3AED',
    librarian: '#2563EB',
    member: '#16A34A',
}

export default function MemberDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const router = useRouter()
    const queryClient = useQueryClient()
    const currentUser = useAppStore((s) => s.currentUser)
    const institution = useAppStore((s) => s.institution)
    const isAdmin = currentUser?.role === 'admin'
    const userId = parseInt(id)

    const [editVisible, setEditVisible] = useState(false)
    const [pinVisible, setPinVisible] = useState(false)
    const [printing, setPrinting] = useState(false)
    const qrRef = useRef<{ toDataURL: (cb: (data: string) => void) => void } | null>(null)

    const { data: member, isLoading } = useQuery({
        queryKey: queryKeys.member(userId),
        queryFn: () => UserService.getById(userId),
        enabled: !!userId,
    })

    const { data: activeBorrows = [] } = useQuery({
        queryKey: queryKeys.activeBorrows(userId),
        queryFn: () => BorrowService.getActiveByUser(userId),
        enabled: !!userId,
    })

    const { data: history = [] } = useQuery({
        queryKey: queryKeys.memberHistory(userId),
        queryFn: () => BorrowService.getFullHistoryByUser(userId),
        enabled: !!userId,
    })

    const { data: fines = [] } = useQuery({
        queryKey: queryKeys.memberFines(userId),
        queryFn: () => BorrowService.getUserFines(userId),
        enabled: !!userId,
    })

    const toggleStatusMutation = useMutation({
        mutationFn: (isActive: boolean) => UserService.updateStatus(userId, isActive),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.member(userId) })
            queryClient.invalidateQueries({ queryKey: ['members'] })
        },
        onError: (e: any) => Alert.alert('Error', e.message),
    })

    const payFineMutation = useMutation({
        mutationFn: (fineId: number) => BorrowService.payFine(fineId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.memberFines(userId) })
            queryClient.invalidateQueries({ queryKey: queryKeys.member(userId) })
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        },
        onError: (e: any) => Alert.alert('Error', e.message),
    })

    const handleToggleStatus = () => {
        if (!member) return
        const action = member.is_active ? 'Deactivate' : 'Reactivate'
        Alert.alert(`${action} Member`, `${action} ${member.name}?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: action,
                style: member.is_active ? 'destructive' : 'default',
                onPress: () => toggleStatusMutation.mutate(!member.is_active),
            },
        ])
    }

    const handlePayFine = (fine: Fine) => {
        Alert.alert('Mark as Paid', `Mark ₱${fine.amount.toFixed(2)} fine as paid?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Mark Paid', onPress: () => payFineMutation.mutate(fine.id) },
        ])
    }

    const handlePrintCard = () => {
        if (!member || !qrRef.current) return
        setPrinting(true)
        qrRef.current.toDataURL(async (dataUrl) => {
            try {
                await printMemberCard({
                    name: member.name,
                    idNumber: member.id_number,
                    role: member.role,
                    institutionName: institution?.name ?? 'Library',
                    qrDataUrl: `data:image/png;base64,${dataUrl}`,
                })
            } catch (e) {
                Alert.alert('Print Failed', e instanceof Error ? e.message : 'Could not generate card PDF.')
            } finally {
                setPrinting(false)
            }
        })
    }

    const totalFines = fines.reduce((sum, f) => sum + f.amount, 0)
    const isOverdue = (dueDate: string) => new Date(dueDate) < new Date()

    if (isLoading) {
        return (
            <View className='flex-1 justify-center items-center'>
                <ActivityIndicator size='large' color='#2563EB' />
            </View>
        )
    }

    if (!member) {
        return (
            <View className='flex-1 justify-center items-center'>
                <Text className='text-[#DC2626] text-base'>Member not found</Text>
            </View>
        )
    }

    return (
        <>
            <ScrollView className='flex-1 bg-[#F8FAFC]' contentContainerStyle={{ paddingBottom: 120 }}>
                <View
                    className='flex-row justify-between items-center px-4 bg-white border-b border-[#F1F5F9]'
                    style={{ paddingTop: 52, paddingBottom: 12 }}
                >
                    <TouchableOpacity onPress={() => router.back()}>
                        <Text className='text-[15px] text-[#2563EB] font-semibold'>← Back</Text>
                    </TouchableOpacity>
                    <View className='flex-row gap-2'>
                        {isAdmin && (
                            <TouchableOpacity className='bg-[#F1F5F9] rounded-lg px-3 py-[6px]' onPress={() => setPinVisible(true)}>
                                <Text className='text-[13px] font-semibold text-[#374151]'>Reset PIN</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity className='bg-[#F1F5F9] rounded-lg px-3 py-[6px]' onPress={() => setEditVisible(true)}>
                            <Text className='text-[13px] font-semibold text-[#374151]'>Edit</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View className='flex-row items-center p-5 bg-white gap-[14px]'>
                    <View
                        className='w-[60px] h-[60px] rounded-[30px] items-center justify-center'
                        style={{ backgroundColor: ROLE_COLOR[member.role] + '20' }}
                    >
                        <Text className='text-[26px] font-bold' style={{ color: ROLE_COLOR[member.role] }}>
                            {member.name.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                    <View className='flex-1 gap-1'>
                        <Text className='text-[18px] font-bold text-[#1E293B]'>{member.name}</Text>
                        <Text className='text-[14px] text-[#64748B]'>ID: {member.id_number}</Text>
                        <View className='flex-row gap-[6px] mt-1'>
                            <View className='rounded px-2 py-[3px]' style={{ backgroundColor: ROLE_COLOR[member.role] + '20' }}>
                                <Text className='text-[12px] font-bold uppercase' style={{ color: ROLE_COLOR[member.role] }}>
                                    {member.role}
                                </Text>
                            </View>
                            {member.user_type && (
                                <View className='rounded px-2 py-[3px] bg-mint'>
                                    <Text className='text-[12px] font-bold uppercase text-brand'>{member.user_type}</Text>
                                </View>
                            )}
                            <View className={`rounded px-2 py-[3px] ${member.is_active ? 'bg-[#DCFCE7]' : 'bg-[#FEE2E2]'}`}>
                                <Text className='text-[12px] font-semibold text-[#374151]'>{member.is_active ? 'Active' : 'Inactive'}</Text>
                            </View>
                        </View>
                        {member.department ? <Text className='text-[12px] text-[#7A9A7E] mt-[2px]'>{member.department}</Text> : null}
                    </View>
                    {isAdmin && (
                        <TouchableOpacity
                            className={`rounded-lg px-3 py-2 ${member.is_active ? 'bg-[#FEE2E2]' : 'bg-[#DCFCE7]'}`}
                            onPress={handleToggleStatus}
                        >
                            <Text className='text-[12px] font-bold text-[#374151]'>{member.is_active ? 'Deactivate' : 'Reactivate'}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View className='mx-4 mb-3'>
                    <View className='flex-row justify-between items-center mb-[10px]'>
                        <Text className='text-[15px] font-bold text-[#1E293B] mb-3'>Member Card</Text>
                        <TouchableOpacity
                            className='bg-[#F1F5F9] rounded-lg px-3 py-[6px]'
                            style={printing ? { opacity: 0.5 } : undefined}
                            onPress={handlePrintCard}
                            disabled={printing}
                        >
                            <Text className='text-[13px] font-semibold text-[#374151]'>{printing ? 'Preparing…' : 'Print / Share'}</Text>
                        </TouchableOpacity>
                    </View>
                    <MemberCard
                        name={member.name}
                        idNumber={member.id_number}
                        role={member.role}
                        institutionName={institution?.name ?? 'Library'}
                        getRef={(ref) => {
                            qrRef.current = ref
                        }}
                    />
                </View>

                <View className='flex-row mx-4 my-3 gap-[10px]'>
                    <StatCard label='Currently Borrowed' value={activeBorrows.length} color='#2563EB' />
                    <StatCard label='Total Borrows' value={history.length} color='#7C3AED' />
                    <StatCard label='Unpaid Fines' value={fines.length} color={fines.length > 0 ? '#DC2626' : '#16A34A'} />
                </View>

                {fines.length > 0 && (
                    <View className='bg-white mx-4 mb-3 rounded-xl p-4' style={{ elevation: 1 }}>
                        <View className='flex-row justify-between items-center mb-3'>
                            <Text className='text-[15px] font-bold text-[#1E293B] mb-3'>Outstanding Fines</Text>
                            <Text className='text-[14px] font-bold text-[#DC2626]'>Total: ₱{totalFines.toFixed(2)}</Text>
                        </View>
                        {fines.map((fine) => (
                            <View key={fine.id} className='flex-row items-center justify-between py-2 border-t border-[#F1F5F9]'>
                                <Text className='text-base font-bold text-[#DC2626]'>₱{fine.amount.toFixed(2)}</Text>
                                <TouchableOpacity className='bg-[#DCFCE7] rounded-lg px-3 py-[6px]' onPress={() => handlePayFine(fine)}>
                                    <Text className='text-[13px] font-semibold text-[#16A34A]'>Mark Paid</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}

                <View className='bg-white mx-4 mb-3 rounded-xl p-4' style={{ elevation: 1 }}>
                    <Text className='text-[15px] font-bold text-[#1E293B] mb-3'>Currently Borrowed ({activeBorrows.length})</Text>
                    {activeBorrows.length === 0 ? (
                        <Text className='text-[14px] text-[#94A3B8] text-center py-2'>No books currently borrowed</Text>
                    ) : (
                        activeBorrows.map((b) => (
                            <View key={b.id} className='flex-row items-center py-[10px] border-t border-[#F1F5F9]'>
                                <View className='flex-1'>
                                    <Text className='text-[14px] font-semibold text-[#1E293B]'>{b.book_title}</Text>
                                    <Text className='text-[12px] text-[#94A3B8] mt-[2px]'>{b.book_author}</Text>
                                </View>
                                <View className='items-end'>
                                    <Text className={`text-[12px] font-semibold ${isOverdue(b.due_date) ? 'text-[#DC2626]' : 'text-[#64748B]'}`}>
                                        {isOverdue(b.due_date) ? 'OVERDUE' : `Due ${new Date(b.due_date).toLocaleDateString()}`}
                                    </Text>
                                </View>
                            </View>
                        ))
                    )}
                </View>

                <View className='bg-white mx-4 mb-3 rounded-xl p-4' style={{ elevation: 1 }}>
                    <Text className='text-[15px] font-bold text-[#1E293B] mb-3'>Borrow History ({history.length})</Text>
                    {history.length === 0 ? (
                        <Text className='text-[14px] text-[#94A3B8] text-center py-2'>No borrow history</Text>
                    ) : (
                        history.map((b) => (
                            <View key={b.id} className='flex-row items-center py-2 border-t border-[#F1F5F9]'>
                                <View className='flex-1'>
                                    <Text className='text-[14px] font-semibold text-[#1E293B]'>{b.book_title}</Text>
                                    <Text className='text-[12px] text-[#94A3B8] mt-[2px]'>{new Date(b.borrowed_at).toLocaleDateString()}</Text>
                                </View>
                                {b.returned_at ? (
                                    <Text className='text-[12px] font-semibold text-[#16A34A]'>Returned</Text>
                                ) : (
                                    <Text className={`text-[12px] font-semibold ${isOverdue(b.due_date) ? 'text-[#DC2626]' : 'text-[#2563EB]'}`}>
                                        {isOverdue(b.due_date) ? 'Overdue' : 'Active'}
                                    </Text>
                                )}
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>

            <EditMemberModal
                visible={editVisible}
                member={member}
                onClose={() => setEditVisible(false)}
                onSaved={() => setEditVisible(false)}
                userId={userId}
            />

            <ResetPinModal visible={pinVisible} member={member} onClose={() => setPinVisible(false)} onSaved={() => setPinVisible(false)} />
        </>
    )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <View className='flex-1 bg-white rounded-[10px] p-3 items-center border-t-[3px]' style={{ borderTopColor: color, elevation: 1 }}>
            <Text className='text-[22px] font-bold' style={{ color }}>
                {value}
            </Text>
            <Text className='text-[11px] text-[#64748B] mt-[2px] text-center'>{label}</Text>
        </View>
    )
}

interface EditModalProps {
    visible: boolean
    member: User
    onClose: () => void
    onSaved: () => void
    userId: number
}

const ROLES: UserRole[] = ['member', 'librarian', 'admin']
const USER_TYPES: { value: UserType; label: string }[] = [
    { value: 'student', label: 'Student' },
    { value: 'faculty', label: 'Faculty' },
    { value: 'alumni', label: 'Alumni' },
    { value: 'external', label: 'External' },
]

function EditMemberModal({ visible, member, onClose, onSaved, userId }: EditModalProps) {
    const queryClient = useQueryClient()
    const [name, setName] = useState(member.name)
    const [idNumber, setIdNumber] = useState(member.id_number)
    const [role, setRole] = useState<UserRole>(member.role)
    const [userType, setUserType] = useState<UserType | null>(member.user_type ?? null)
    const [department, setDepartment] = useState(member.department ?? '')

    useEffect(() => {
        setName(member.name)
        setIdNumber(member.id_number)
        setRole(member.role)
        setUserType(member.user_type ?? null)
        setDepartment(member.department ?? '')
    }, [member])

    const updateMutation = useMutation({
        mutationFn: () =>
            UserService.update(member.id, {
                name: name.trim(),
                id_number: idNumber.trim(),
                role,
                department: department.trim() || undefined,
                user_type: userType,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.member(userId) })
            queryClient.invalidateQueries({ queryKey: ['members'] })
            onSaved()
        },
        onError: (e: any) => Alert.alert('Error', e.message ?? 'Failed to save'),
    })

    const handleSave = () => {
        if (!name.trim() || !idNumber.trim()) {
            Alert.alert('Error', 'Name and ID number are required')
            return
        }
        updateMutation.mutate()
    }

    return (
        <Modal visible={visible} animationType='slide' presentationStyle='pageSheet'>
            <View className='flex-1 bg-[#F8FAFC]'>
                <View className='flex-row justify-between items-center p-4 pt-5 bg-white border-b border-[#F1F5F9]'>
                    <TouchableOpacity onPress={onClose}>
                        <Text className='text-[15px] text-[#64748B]'>Cancel</Text>
                    </TouchableOpacity>
                    <Text className='text-base font-bold text-[#1E293B]'>Edit Member</Text>
                    <TouchableOpacity onPress={handleSave} disabled={updateMutation.isPending}>
                        <Text className='text-[15px] font-bold text-[#2563EB]'>{updateMutation.isPending ? 'Saving…' : 'Save'}</Text>
                    </TouchableOpacity>
                </View>
                <ScrollView className='p-4'>
                    <Text className='text-[13px] font-semibold text-[#374151] mb-[6px] mt-[14px]'>Full Name *</Text>
                    <TextInput
                        className='bg-white border border-[#E2E8F0] rounded-[10px] px-[14px] py-3 text-[15px]'
                        value={name}
                        onChangeText={setName}
                        placeholder='Full name'
                    />

                    <Text className='text-[13px] font-semibold text-[#374151] mb-[6px] mt-[14px]'>ID Number *</Text>
                    <TextInput
                        className='bg-white border border-[#E2E8F0] rounded-[10px] px-[14px] py-3 text-[15px]'
                        value={idNumber}
                        onChangeText={setIdNumber}
                        placeholder='ID number'
                        autoCapitalize='none'
                    />

                    <Text className='text-[13px] font-semibold text-[#374151] mb-[6px] mt-[14px]'>Role</Text>
                    <View className='flex-row gap-2 mt-1'>
                        {ROLES.map((r) => (
                            <TouchableOpacity
                                key={r}
                                className='flex-1 rounded-lg py-[10px] items-center bg-[#F1F5F9]'
                                style={role === r ? { backgroundColor: ROLE_COLOR[r] } : undefined}
                                onPress={() => setRole(r)}
                            >
                                <Text
                                    className='text-[13px] font-semibold capitalize text-[#374151]'
                                    style={role === r ? { color: '#FFFFFF' } : undefined}
                                >
                                    {r}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text className='text-[13px] font-semibold text-[#374151] mb-[6px] mt-[14px]'>Patron Type</Text>
                    <View className='flex-row gap-2 mt-1'>
                        {USER_TYPES.map((t) => {
                            const active = userType === t.value
                            return (
                                <TouchableOpacity
                                    key={t.value}
                                    className='flex-1 rounded-lg py-[10px] items-center bg-[#F1F5F9]'
                                    style={active ? { backgroundColor: '#2A5C33' } : undefined}
                                    onPress={() => setUserType(active ? null : t.value)}
                                >
                                    <Text
                                        className='text-[13px] font-semibold capitalize text-[#374151]'
                                        style={active ? { color: '#FFFFFF' } : undefined}
                                    >
                                        {t.label}
                                    </Text>
                                </TouchableOpacity>
                            )
                        })}
                    </View>

                    <Text className='text-[13px] font-semibold text-[#374151] mb-[6px] mt-[14px]'>Department / Program</Text>
                    <TextInput
                        className='bg-white border border-[#E2E8F0] rounded-[10px] px-[14px] py-3 text-[15px]'
                        value={department}
                        onChangeText={setDepartment}
                        placeholder='e.g. College of Engineering'
                    />
                </ScrollView>
            </View>
        </Modal>
    )
}

interface PinModalProps {
    visible: boolean
    member: User
    onClose: () => void
    onSaved: () => void
}

function ResetPinModal({ visible, member, onClose, onSaved }: PinModalProps) {
    const [newPin, setNewPin] = useState('')
    const [confirmPin, setConfirmPin] = useState('')
    const [saving, setSaving] = useState(false)

    const handleReset = async () => {
        if (newPin.length < 4) {
            Alert.alert('Error', 'PIN must be at least 4 digits')
            return
        }
        if (newPin !== confirmPin) {
            Alert.alert('Error', 'PINs do not match')
            return
        }
        setSaving(true)
        try {
            await UserService.changePin(member.id, newPin)
            setNewPin('')
            setConfirmPin('')
            Alert.alert('Done', `PIN for ${member.name} has been reset.`)
            onSaved()
        } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Failed to reset PIN')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal visible={visible} animationType='slide' presentationStyle='pageSheet'>
            <View className='flex-1 bg-[#F8FAFC]'>
                <View className='flex-row justify-between items-center p-4 pt-5 bg-white border-b border-[#F1F5F9]'>
                    <TouchableOpacity onPress={onClose}>
                        <Text className='text-[15px] text-[#64748B]'>Cancel</Text>
                    </TouchableOpacity>
                    <Text className='text-base font-bold text-[#1E293B]'>Reset PIN</Text>
                    <TouchableOpacity onPress={handleReset} disabled={saving}>
                        <Text className='text-[15px] font-bold text-[#2563EB]'>{saving ? 'Saving…' : 'Reset'}</Text>
                    </TouchableOpacity>
                </View>
                <View className='p-4'>
                    <Text className='text-[14px] text-[#64748B] mb-4'>Resetting PIN for {member.name}</Text>
                    <Text className='text-[13px] font-semibold text-[#374151] mb-[6px] mt-[14px]'>New PIN *</Text>
                    <TextInput
                        className='bg-white border border-[#E2E8F0] rounded-[10px] px-[14px] py-3 text-[15px]'
                        value={newPin}
                        onChangeText={setNewPin}
                        placeholder='Min 4 digits'
                        secureTextEntry
                        keyboardType='numeric'
                    />
                    <Text className='text-[13px] font-semibold text-[#374151] mb-[6px] mt-[14px]'>Confirm PIN *</Text>
                    <TextInput
                        className='bg-white border border-[#E2E8F0] rounded-[10px] px-[14px] py-3 text-[15px]'
                        value={confirmPin}
                        onChangeText={setConfirmPin}
                        placeholder='Repeat PIN'
                        secureTextEntry
                        keyboardType='numeric'
                    />
                </View>
            </View>
        </Modal>
    )
}
