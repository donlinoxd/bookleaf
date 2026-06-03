import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import * as Print from 'expo-print'
import { useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { queryKeys } from '../../../src/lib/queryKeys'
import { PatronReportService } from '../../../src/services/PatronReportService'
import { useAppStore } from '../../../src/store/appStore'
import { buildPatronReportHtml } from '../../../src/utils/patronReportHtml'

const BRAND = '#2A5C33'
const LEAF = '#5CB85C'

const USER_TYPE_LABEL: Record<string, string> = {
    student: 'Student',
    faculty: 'Faculty / Staff',
    alumni: 'Alumni',
    external: 'External',
}

const USER_TYPE_COLOR: Record<string, { text: string; bg: string }> = {
    student: { text: '#2A5C33', bg: '#E2EFE0' },
    faculty: { text: '#0F766E', bg: '#CCFBF1' },
    alumni: { text: '#7C3AED', bg: '#EDE9FE' },
    external: { text: '#B45309', bg: '#FEF3C7' },
}

export default function PatronReportScreen() {
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const { institution, settings } = useAppStore()
    const institutionId = institution?.id ?? 0
    const [sharing, setSharing] = useState(false)

    const { data: overview, isLoading: l1 } = useQuery({
        queryKey: queryKeys.patronOverview(institutionId),
        queryFn: () => PatronReportService.getOverview(institutionId),
        enabled: !!institutionId,
    })

    const { data: byType = [], isLoading: l2 } = useQuery({
        queryKey: queryKeys.patronByType(institutionId),
        queryFn: () => PatronReportService.getByType(institutionId),
        enabled: !!institutionId,
    })

    const { data: byDepartment = [], isLoading: l3 } = useQuery({
        queryKey: queryKeys.patronByDepartment(institutionId),
        queryFn: () => PatronReportService.getByDepartment(institutionId),
        enabled: !!institutionId,
    })

    const { data: registrations = [], isLoading: l4 } = useQuery({
        queryKey: queryKeys.patronRegistrations(institutionId),
        queryFn: () => PatronReportService.getMonthlyRegistrations(institutionId, 6),
        enabled: !!institutionId,
    })

    const { data: attendance = [], isLoading: l5 } = useQuery({
        queryKey: queryKeys.patronAttendance(institutionId),
        queryFn: () => PatronReportService.getMonthlyAttendance(institutionId, 6),
        enabled: !!institutionId,
    })

    const isLoading = l1 || l2 || l3 || l4 || l5
    const allReady = !isLoading && !!overview

    const maxReg = registrations.reduce((m, r) => Math.max(m, r.count), 1)
    const maxVisit = attendance.reduce((m, r) => Math.max(m, r.unique_visitors), 1)

    const handleSharePdf = async () => {
        if (!allReady || !overview) return
        setSharing(true)
        try {
            const html = buildPatronReportHtml({
                institutionName: settings?.institution_name ?? institution?.name ?? 'Library',
                overview,
                byType,
                byDepartment,
                registrations,
                attendance,
            })
            const { uri } = await Print.printToFileAsync({ html, base64: false })
            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: 'Share Patron Report',
                UTI: 'com.adobe.pdf',
            })
        } catch {
            Alert.alert('Error', 'Could not generate PDF. Please try again.')
        } finally {
            setSharing(false)
        }
    }

    return (
        <View className='flex-1 bg-[#F4F9F4]'>
            <StatusBar barStyle='light-content' backgroundColor={BRAND} />

            <View style={{ paddingTop: insets.top + 16 }} className='bg-brand px-5 pb-6'>
                <View className='flex-row items-center gap-3 mb-2'>
                    <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
                        <Ionicons name='arrow-back' size={22} color='#A8D5A2' />
                    </TouchableOpacity>
                    <Text className='text-[#A8D5A2] text-[11px] font-semibold tracking-[1.2px] uppercase'>Reports</Text>
                </View>
                <View className='flex-row items-end justify-between'>
                    <View className='flex-1'>
                        <Text className='text-white text-[22px] font-extrabold'>Patron Report</Text>
                        <Text className='text-[#A8D5A2] text-[12px] mt-[3px]'>
                            {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </Text>
                    </View>
                    <TouchableOpacity
                        className='flex-row items-center gap-[6px] bg-[rgba(255,255,255,0.2)] rounded-xl px-[14px] py-[9px]'
                        style={{ opacity: sharing || !allReady ? 0.6 : 1 }}
                        onPress={handleSharePdf}
                        disabled={sharing || !allReady}
                    >
                        {sharing ? <ActivityIndicator size='small' color='#FFFFFF' /> : <Ionicons name='share-outline' size={17} color='#FFFFFF' />}
                        <Text className='text-white font-bold text-[13px]'>{sharing ? 'Preparing…' : 'Share PDF'}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {isLoading ? (
                <View className='flex-1 items-center justify-center'>
                    <ActivityIndicator size='large' color={LEAF} />
                    <Text className='mt-3 text-[13px] text-[#7A9A7E] font-semibold'>Loading report…</Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 150 }} showsVerticalScrollIndicator={false}>

                    <Section title='Overview' badge='CHED'>
                        <View className='flex-row flex-wrap gap-[10px] mb-[10px]'>
                            <MiniStat label='Total Members' value={overview?.total_members ?? 0} accent={BRAND} bg='#E2EFE0' />
                            <MiniStat label='Active' value={overview?.active_members ?? 0} accent='#16A34A' bg='#DCFCE7' />
                            <MiniStat label='Inactive' value={overview?.inactive_members ?? 0} accent='#D97706' bg='#FEF3C7' />
                        </View>
                        <View className='flex-row flex-wrap gap-[10px]'>
                            <MiniStat label='Borrowing Now' value={overview?.active_borrowers ?? 0} accent='#0F766E' bg='#CCFBF1' />
                            <MiniStat label='Never Borrowed' value={overview?.never_borrowed ?? 0} accent='#64748B' bg='#F1F5F9' />
                            <MiniStat label='Library Staff' value={overview?.total_staff ?? 0} accent='#7C3AED' bg='#EDE9FE' />
                        </View>
                    </Section>

                    <Section title='By Patron Type'>
                        {byType.length === 0 ? (
                            <View className='py-4 items-center gap-[6px]'>
                                <Ionicons name='information-circle-outline' size={28} color='#CBD5E1' />
                                <Text className='text-[12px] text-[#94A3B8] text-center'>
                                    No patron types assigned yet.{'\n'}Add type when registering members.
                                </Text>
                            </View>
                        ) : (
                            <View className='gap-2'>
                                {byType.map((row) => {
                                    const c = USER_TYPE_COLOR[row.user_type] ?? { text: '#64748B', bg: '#F1F5F9' }
                                    const pct = overview ? Math.round((row.count / overview.total_members) * 100) : 0
                                    return (
                                        <View key={row.user_type} className='gap-1'>
                                            <View className='flex-row items-center justify-between'>
                                                <View className='flex-row items-center gap-2'>
                                                    <View style={{ backgroundColor: c.bg }} className='rounded-md px-[10px] py-1'>
                                                        <Text style={{ color: c.text }} className='text-[12px] font-bold'>
                                                            {USER_TYPE_LABEL[row.user_type] ?? row.user_type}
                                                        </Text>
                                                    </View>
                                                    <Text className='text-[11px] text-[#64748B]'>
                                                        {row.active} active · {row.count - row.active} inactive
                                                    </Text>
                                                </View>
                                                <Text style={{ color: c.text }} className='text-[14px] font-extrabold'>{row.count}</Text>
                                            </View>
                                            <View className='h-[6px] bg-[#F1F5F9] rounded-[3px] overflow-hidden'>
                                                <View style={{ width: `${pct}%`, backgroundColor: c.text + 'CC' }} className='h-full rounded-[3px]' />
                                            </View>
                                        </View>
                                    )
                                })}
                            </View>
                        )}
                    </Section>

                    <Section title='By Department / Program'>
                        {byDepartment.length === 0 ? (
                            <View className='py-4 items-center gap-[6px]'>
                                <Ionicons name='information-circle-outline' size={28} color='#CBD5E1' />
                                <Text className='text-[12px] text-[#94A3B8] text-center'>
                                    No departments on record yet.{'\n'}Add department when registering members.
                                </Text>
                            </View>
                        ) : (
                            <>
                                <TableHeader cols={['Department', 'Members', 'Borrowing']} widths={['flex', 64, 72]} />
                                {byDepartment.map((row, i) => (
                                    <View
                                        key={row.department}
                                        style={{ backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent' }}
                                        className='flex-row px-[10px] py-[9px] items-center rounded-md'
                                    >
                                        <Text className='flex-1 text-[12px] font-semibold text-[#1C2B1E]' numberOfLines={1}>
                                            {row.department}
                                        </Text>
                                        <Text className='w-16 text-[12px] font-bold text-brand text-center'>
                                            {row.count}
                                        </Text>
                                        <View className='w-[72px] items-center'>
                                            {row.active_borrowers > 0 ? (
                                                <View className='bg-[#CCFBF1] rounded-md px-2 py-[3px]'>
                                                    <Text className='text-[11px] font-bold text-[#0F766E]'>{row.active_borrowers}</Text>
                                                </View>
                                            ) : (
                                                <Text className='text-[11px] text-[#CBD5E1]'>—</Text>
                                            )}
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}
                    </Section>

                    <Section title='New Registrations — Last 6 Months'>
                        {registrations.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <View className='gap-2'>
                                {registrations.map((row, i) => (
                                    <View
                                        key={row.month}
                                        style={{ backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent' }}
                                        className='flex-row items-center gap-2 rounded-lg px-1 py-[6px]'
                                    >
                                        <Text className='w-16 text-[11px] text-[#64748B] font-semibold'>{row.label}</Text>
                                        <View className='flex-1 h-3 bg-mint rounded overflow-hidden'>
                                            <View style={{ width: `${Math.round((row.count / maxReg) * 100)}%` }} className='h-full bg-brand rounded' />
                                        </View>
                                        <Text className='w-8 text-[12px] font-extrabold text-brand text-right'>{row.count}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </Section>

                    <Section title='Library Attendance — Last 6 Months'>
                        {attendance.length === 0 ? (
                            <View className='py-5 items-center gap-[6px]'>
                                <Ionicons name='enter-outline' size={32} color='#CBD5E1' />
                                <Text className='text-[13px] text-[#94A3B8] font-medium'>No gate attendance data yet</Text>
                            </View>
                        ) : (
                            <View className='gap-2'>
                                {attendance.map((row, i) => (
                                    <View
                                        key={row.month}
                                        style={{ backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent' }}
                                        className='flex-row items-center gap-2 rounded-lg px-1 py-[6px]'
                                    >
                                        <Text className='w-16 text-[11px] text-[#64748B] font-semibold'>{row.label}</Text>
                                        <View className='flex-1 h-3 bg-[#CCFBF1] rounded overflow-hidden'>
                                            <View style={{ width: `${Math.round((row.unique_visitors / maxVisit) * 100)}%` }} className='h-full bg-[#0F766E] rounded' />
                                        </View>
                                        <View className='items-end w-[72px]'>
                                            <Text className='text-[12px] font-extrabold text-[#0F766E]'>{row.unique_visitors}</Text>
                                            <Text className='text-[9px] text-[#94A3B8]'>{row.total_visits} visits</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}
                    </Section>
                </ScrollView>
            )}
        </View>
    )
}

function Section({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
    return (
        <View
            className='bg-white rounded-2xl overflow-hidden'
            style={{ elevation: 2, shadowColor: BRAND, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4 }}
        >
            <View className='px-4 py-[13px] border-b border-[#F1F5F9] flex-row items-center gap-2'>
                <Text className='text-[13px] font-extrabold text-[#1C2B1E]'>{title}</Text>
                {badge && (
                    <View className='bg-[#DCFCE7] rounded px-[6px] py-[2px]'>
                        <Text className='text-[9px] font-bold text-brand tracking-[0.5px]'>{badge}</Text>
                    </View>
                )}
            </View>
            <View className='p-[14px]'>{children}</View>
        </View>
    )
}

function TableHeader({ cols, widths }: { cols: string[]; widths: (number | 'flex')[] }) {
    return (
        <View className='flex-row bg-[#F8FAFC] rounded-lg px-[10px] py-[7px] mb-[2px]'>
            {cols.map((col, i) => (
                <Text key={col} style={{ flex: widths[i] === 'flex' ? 1 : undefined, width: widths[i] !== 'flex' ? (widths[i] as number) : undefined, fontSize: 9, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: typeof widths[i] === 'number' ? 'center' : 'left' }}>
                    {col}
                </Text>
            ))}
        </View>
    )
}

function MiniStat({ label, value, accent, bg }: { label: string; value: number; accent: string; bg: string }) {
    return (
        <View style={{ backgroundColor: bg }} className='rounded-xl p-3 items-center min-w-[80px] grow'>
            <Text style={{ color: accent }} className='text-[22px] font-extrabold'>{value}</Text>
            <Text style={{ color: accent + 'CC' }} className='text-[10px] font-semibold text-center mt-[2px]'>{label}</Text>
        </View>
    )
}

function EmptyRow() {
    return (
        <View className='py-5 items-center'>
            <Text className='text-[13px] text-[#94A3B8] font-medium'>No data available</Text>
        </View>
    )
}
