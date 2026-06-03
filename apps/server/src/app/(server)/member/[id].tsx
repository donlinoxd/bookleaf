import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { MemberCard } from '../../../components/members/MemberCard'
import { queryKeys } from '../../../lib/queryKeys'
import { BorrowService } from '../../../services/BorrowService'
import { UserService } from '../../../services/UserService'
import { useAppStore } from '../../../store/appStore'
import { Fine, User, UserRole, UserType } from '@bookleaf/types'
import { printMemberCard } from '../../../utils/printMemberCard'

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
            <View className="flex-1 justify-center items-center bg-bio">
                <ActivityIndicator size="large" color="#2A5C33" />
            </View>
        )
    }

    if (!member) {
        return (
            <View className="flex-1 justify-center items-center bg-bio">
                <Text className="text-red-600 text-base">Member not found</Text>
            </View>
        )
    }

    return (
        <>
            <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ paddingBottom: 120 }}>
                {/* Header */}
                <View className="bg-brand px-5 pb-6 pt-[52px] rounded-b-[28px]">
                    <View className="flex-row items-center justify-between mb-5">
                        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center gap-1">
                            <Ionicons name="chevron-back" size={20} color="#A8D5A2" />
                            <Text className="text-[#A8D5A2] text-sm font-medium">Back</Text>
                        </TouchableOpacity>
                        <View className="flex-row gap-2">
                            {isAdmin && (
                                <TouchableOpacity
                                    className="bg-[#1C3E23] rounded-xl px-3 py-2"
                                    onPress={() => setPinVisible(true)}
                                >
                                    <Text className="text-[#A8D5A2] text-sm font-bold">Reset PIN</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                className="bg-[#1C3E23] rounded-xl px-3 py-2"
                                onPress={() => setEditVisible(true)}
                            >
                                <Text className="text-[#A8D5A2] text-sm font-bold">Edit</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Member hero */}
                    <View className="flex-row gap-4 items-center">
                        <View
                            className="w-16 h-16 rounded-2xl items-center justify-center"
                            style={{ backgroundColor: '#1C3E23' }}
                        >
                            <Text className="text-2xl font-extrabold text-[#A8D5A2]">
                                {member.name.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        <View className="flex-1">
                            <Text className="text-white font-extrabold text-lg leading-6">{member.name}</Text>
                            <Text className="text-[#A8D5A2] text-sm mt-0.5">ID: {member.id_number}</Text>
                            <View className="flex-row gap-2 mt-2 flex-wrap">
                                <View className="rounded-md px-2 py-0.5 bg-[#1C3E23]">
                                    <Text className="text-[11px] font-bold uppercase text-[#A8D5A2]">{member.role}</Text>
                                </View>
                                {member.user_type && (
                                    <View className="rounded-md px-2 py-0.5 bg-[#1C3E23]">
                                        <Text className="text-[11px] font-bold uppercase text-[#A8D5A2]">{member.user_type}</Text>
                                    </View>
                                )}
                                <View className={`rounded-md px-2 py-0.5 ${member.is_active ? 'bg-[#DCFCE7]' : 'bg-[#FEE2E2]'}`}>
                                    <Text className={`text-[11px] font-bold ${member.is_active ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                                        {member.is_active ? 'Active' : 'Inactive'}
                                    </Text>
                                </View>
                            </View>
                            {member.department ? (
                                <Text className="text-[#7A9A7E] text-xs mt-1">{member.department}</Text>
                            ) : null}
                        </View>
                        {isAdmin && (
                            <TouchableOpacity
                                className={`rounded-xl px-3 py-2 ${member.is_active ? 'bg-[#FEE2E2]' : 'bg-[#DCFCE7]'}`}
                                onPress={handleToggleStatus}
                            >
                                <Text className={`text-xs font-bold ${member.is_active ? 'text-[#DC2626]' : 'text-[#16A34A]'}`}>
                                    {member.is_active ? 'Deactivate' : 'Reactivate'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                <View className="p-4 gap-3">
                    {/* Stats */}
                    <View className="flex-row gap-3">
                        <StatCard label="Borrowed" value={activeBorrows.length} />
                        <StatCard label="Total History" value={history.length} />
                        <StatCard label="Unpaid Fines" value={fines.length} highlight={fines.length > 0 ? 'red' : undefined} />
                    </View>

                    {/* Member Card */}
                    <Section
                        title="Member Card"
                        action={{ label: printing ? 'Preparing…' : 'Print / Share', onPress: handlePrintCard, disabled: printing }}
                    >
                        <MemberCard
                            name={member.name}
                            idNumber={member.id_number}
                            role={member.role}
                            institutionName={institution?.name ?? 'Library'}
                            getRef={(ref) => { qrRef.current = ref }}
                        />
                    </Section>

                    {/* Outstanding Fines */}
                    {fines.length > 0 && (
                        <Section
                            title="Outstanding Fines"
                            badge={`₱${totalFines.toFixed(2)}`}
                            badgeColor="#DC2626"
                        >
                            {fines.map((fine) => (
                                <View key={fine.id} className="flex-row items-center justify-between py-2.5 border-t border-[#F1F5F9]">
                                    <Text className="text-base font-bold text-[#DC2626]">₱{fine.amount.toFixed(2)}</Text>
                                    <TouchableOpacity
                                        className="bg-[#DCFCE7] rounded-xl px-3 py-1.5"
                                        onPress={() => handlePayFine(fine)}
                                    >
                                        <Text className="text-xs font-bold text-[#16A34A]">Mark Paid</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </Section>
                    )}

                    {/* Currently Borrowed */}
                    <Section title={`Currently Borrowed (${activeBorrows.length})`}>
                        {activeBorrows.length === 0 ? (
                            <Text className="text-sm text-[#94A3B8] text-center py-2">No books currently borrowed</Text>
                        ) : (
                            activeBorrows.map((b) => (
                                <View key={b.id} className="flex-row items-center py-2.5 border-t border-[#F1F5F9]">
                                    <View className="flex-1">
                                        <Text className="text-sm font-semibold text-[#1C2B1E]">{b.book_title}</Text>
                                        <Text className="text-xs text-[#7A9A7E] mt-0.5">{b.book_author}</Text>
                                    </View>
                                    <View className="items-end">
                                        <Text className={`text-xs font-semibold ${isOverdue(b.due_date) ? 'text-[#DC2626]' : 'text-[#5A7A5E]'}`}>
                                            {isOverdue(b.due_date) ? 'OVERDUE' : `Due ${new Date(b.due_date).toLocaleDateString()}`}
                                        </Text>
                                    </View>
                                </View>
                            ))
                        )}
                    </Section>

                    {/* Borrow History */}
                    <Section title={`Borrow History (${history.length})`}>
                        {history.length === 0 ? (
                            <Text className="text-sm text-[#94A3B8] text-center py-2">No borrow history</Text>
                        ) : (
                            history.map((b) => (
                                <View key={b.id} className="flex-row items-center py-2.5 border-t border-[#F1F5F9]">
                                    <View className="flex-1">
                                        <Text className="text-sm font-semibold text-[#1C2B1E]">{b.book_title}</Text>
                                        <Text className="text-xs text-[#7A9A7E] mt-0.5">{new Date(b.borrowed_at).toLocaleDateString()}</Text>
                                    </View>
                                    {b.returned_at ? (
                                        <Text className="text-xs font-semibold text-leaf">Returned</Text>
                                    ) : (
                                        <Text className={`text-xs font-semibold ${isOverdue(b.due_date) ? 'text-[#DC2626]' : 'text-brand'}`}>
                                            {isOverdue(b.due_date) ? 'Overdue' : 'Active'}
                                        </Text>
                                    )}
                                </View>
                            ))
                        )}
                    </Section>
                </View>
            </ScrollView>

            <EditMemberModal
                visible={editVisible}
                member={member}
                onClose={() => setEditVisible(false)}
                onSaved={() => setEditVisible(false)}
                userId={userId}
            />

            <ResetPinModal
                visible={pinVisible}
                member={member}
                onClose={() => setPinVisible(false)}
                onSaved={() => setPinVisible(false)}
            />
        </>
    )
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: 'red' }) {
    const borderColor = highlight === 'red' ? '#DC2626' : undefined
    return (
        <View
            className="flex-1 bg-white rounded-2xl p-3 items-center"
            style={{
                elevation: 2,
                shadowColor: '#2A5C33',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 4,
                borderTopWidth: borderColor ? 3 : 0,
                borderTopColor: borderColor,
            }}
        >
            <Text className="text-2xl font-extrabold text-[#1C2B1E]">{value}</Text>
            <Text className="text-xs text-[#7A9A7E] mt-0.5 text-center">{label}</Text>
        </View>
    )
}

function Section({
    title,
    children,
    action,
    badge,
    badgeColor,
}: {
    title: string
    children: React.ReactNode
    action?: { label: string; onPress: () => void; disabled?: boolean }
    badge?: string
    badgeColor?: string
}) {
    return (
        <View
            className="bg-white rounded-2xl p-4"
            style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }}
        >
            <View className="flex-row items-center justify-between mb-3">
                <Text className="text-sm font-bold text-[#1C2B1E]">{title}</Text>
                {badge && (
                    <Text className="text-sm font-bold" style={{ color: badgeColor ?? '#1C2B1E' }}>{badge}</Text>
                )}
                {action && (
                    <TouchableOpacity
                        className="bg-mint rounded-lg px-3 py-1"
                        onPress={action.onPress}
                        disabled={action.disabled}
                        style={action.disabled ? { opacity: 0.5 } : undefined}
                    >
                        <Text className="text-xs font-bold text-brand">{action.label}</Text>
                    </TouchableOpacity>
                )}
            </View>
            {children}
        </View>
    )
}

// ─── Edit Member Modal ────────────────────────────────────────────────────────

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
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <View className="flex-1 bg-bio">
                <View className="bg-brand flex-row items-center justify-between px-5 pb-4 pt-16 rounded-b-[20px]">
                    <TouchableOpacity onPress={onClose}>
                        <Text className="text-[#A8D5A2] text-sm font-medium">Cancel</Text>
                    </TouchableOpacity>
                    <Text className="text-white font-extrabold text-base">Edit Member</Text>
                    <TouchableOpacity onPress={handleSave} disabled={updateMutation.isPending}>
                        {updateMutation.isPending
                            ? <ActivityIndicator color="#A8D5A2" size="small" />
                            : <Text className="text-[#A8D5A2] text-sm font-bold">Save</Text>}
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
                    <FormSection label="Basic Info">
                        <TextInput
                            className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
                            value={name}
                            onChangeText={setName}
                            placeholder="Full name *"
                            placeholderTextColor="#94A3B8"
                        />
                        <TextInput
                            className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
                            value={idNumber}
                            onChangeText={setIdNumber}
                            placeholder="ID number *"
                            placeholderTextColor="#94A3B8"
                            autoCapitalize="none"
                        />
                        <TextInput
                            className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
                            value={department}
                            onChangeText={setDepartment}
                            placeholder="Department / Program"
                            placeholderTextColor="#94A3B8"
                        />
                    </FormSection>

                    <FormSection label="Role">
                        <View className="flex-row gap-2">
                            {ROLES.map((r) => (
                                <TouchableOpacity
                                    key={r}
                                    className="flex-1 rounded-xl py-2.5 items-center border"
                                    style={role === r
                                        ? { backgroundColor: ROLE_COLOR[r], borderColor: ROLE_COLOR[r] }
                                        : { backgroundColor: '#FFFFFF', borderColor: '#E2EFE0' }}
                                    onPress={() => setRole(r)}
                                >
                                    <Text
                                        className="text-xs font-bold capitalize"
                                        style={{ color: role === r ? '#FFFFFF' : '#2A5C33' }}
                                    >
                                        {r}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </FormSection>

                    <FormSection label="Patron Type">
                        <View className="flex-row gap-2 flex-wrap">
                            {USER_TYPES.map((t) => {
                                const active = userType === t.value
                                return (
                                    <TouchableOpacity
                                        key={t.value}
                                        className="flex-1 rounded-xl py-2.5 items-center border"
                                        style={active
                                            ? { backgroundColor: '#2A5C33', borderColor: '#2A5C33' }
                                            : { backgroundColor: '#FFFFFF', borderColor: '#E2EFE0' }}
                                        onPress={() => setUserType(active ? null : t.value)}
                                    >
                                        <Text
                                            className="text-xs font-bold"
                                            style={{ color: active ? '#FFFFFF' : '#2A5C33' }}
                                        >
                                            {t.label}
                                        </Text>
                                    </TouchableOpacity>
                                )
                            })}
                        </View>
                    </FormSection>
                </ScrollView>
            </View>
        </Modal>
    )
}

// ─── Reset PIN Modal ──────────────────────────────────────────────────────────

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
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <View className="flex-1 bg-bio">
                <View className="bg-brand flex-row items-center justify-between px-5 pb-4 pt-16 rounded-b-[20px]">
                    <TouchableOpacity onPress={onClose}>
                        <Text className="text-[#A8D5A2] text-sm font-medium">Cancel</Text>
                    </TouchableOpacity>
                    <Text className="text-white font-extrabold text-base">Reset PIN</Text>
                    <TouchableOpacity onPress={handleReset} disabled={saving}>
                        {saving
                            ? <ActivityIndicator color="#A8D5A2" size="small" />
                            : <Text className="text-[#A8D5A2] text-sm font-bold">Reset</Text>}
                    </TouchableOpacity>
                </View>

                <View style={{ padding: 16, gap: 12 }}>
                    <View className="bg-mint rounded-2xl px-4 py-3 flex-row items-center gap-3">
                        <Ionicons name="person-circle-outline" size={24} color="#2A5C33" />
                        <View>
                            <Text className="text-xs font-semibold text-[#7A9A7E]">Resetting PIN for</Text>
                            <Text className="text-sm font-bold text-brand">{member.name}</Text>
                        </View>
                    </View>

                    <FormSection label="New PIN">
                        <TextInput
                            className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
                            value={newPin}
                            onChangeText={setNewPin}
                            placeholder="Min 4 digits"
                            placeholderTextColor="#94A3B8"
                            secureTextEntry
                            keyboardType="numeric"
                        />
                        <TextInput
                            className="bg-white border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
                            value={confirmPin}
                            onChangeText={setConfirmPin}
                            placeholder="Confirm PIN"
                            placeholderTextColor="#94A3B8"
                            secureTextEntry
                            keyboardType="numeric"
                        />
                    </FormSection>
                </View>
            </View>
        </Modal>
    )
}

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <View
            className="bg-white rounded-2xl p-4 gap-3"
            style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
        >
            <Text className="text-xs font-bold text-brand uppercase tracking-widest">{label}</Text>
            {children}
        </View>
    )
}
