import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import * as Print from 'expo-print'
import { useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { queryKeys } from '../../../lib/queryKeys'
import { FinesReportService } from '../../../services/FinesReportService'
import { useAppStore } from '../../../store/appStore'
import { buildFinesReportHtml } from '../../../utils/finesReportHtml'

const BRAND = '#2A5C33'
const LEAF = '#5CB85C'

function fmt(n: number): string {
    return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(s: string | null): string {
    if (!s) return '—'
    return new Date(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function FinesReportScreen() {
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const { institution, settings } = useAppStore()
    const institutionId = institution?.id ?? 0
    const [sharing, setSharing] = useState(false)

    const { data: summary, isLoading: l1 } = useQuery({
        queryKey: queryKeys.finesReportSummary(institutionId),
        queryFn: () => FinesReportService.getSummary(institutionId),
        enabled: !!institutionId,
    })

    const { data: monthly = [], isLoading: l2 } = useQuery({
        queryKey: queryKeys.finesReportMonthly(institutionId),
        queryFn: () => FinesReportService.getMonthlyCollection(institutionId, 6),
        enabled: !!institutionId,
    })

    const { data: debtors = [], isLoading: l3 } = useQuery({
        queryKey: queryKeys.finesReportDebtors(institutionId),
        queryFn: () => FinesReportService.getTopDebtors(institutionId, 10),
        enabled: !!institutionId,
    })

    const { data: details = [], isLoading: l4 } = useQuery({
        queryKey: queryKeys.finesReportDetails(institutionId),
        queryFn: () => FinesReportService.getDetails(institutionId, 50),
        enabled: !!institutionId,
    })

    const isLoading = l1 || l2 || l3 || l4
    const allReady = !isLoading && !!summary

    const maxCollected = monthly.reduce((m, r) => Math.max(m, r.collected), 1)

    const handleSharePdf = async () => {
        if (!allReady || !summary) return
        setSharing(true)
        try {
            const html = buildFinesReportHtml({
                institutionName: settings?.institution_name ?? institution?.name ?? 'Library',
                summary,
                monthly,
                debtors,
                details,
            })
            const { uri } = await Print.printToFileAsync({ html, base64: false })
            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: 'Share Fines Report',
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
                        <Text className='text-white text-[22px] font-extrabold'>Fines Report</Text>
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
                    <Section title='Summary'>
                        <View className='flex-row gap-[10px] mb-[10px]'>
                            <View className='flex-1 bg-mint rounded-xl p-[14px] items-center'>
                                <Text className='text-[18px] font-extrabold text-brand'>₱{fmt(summary?.total_fines ?? 0)}</Text>
                                <Text style={{ color: BRAND + 'BB' }} className='text-[10px] font-semibold mt-[3px]'>Total Issued</Text>
                            </View>
                        </View>
                        <View className='flex-row gap-[10px]'>
                            <View className='flex-1 bg-[#DCFCE7] rounded-xl p-[14px] items-center'>
                                <Text className='text-[17px] font-extrabold text-[#16A34A]'>₱{fmt(summary?.total_collected ?? 0)}</Text>
                                <Text style={{ color: '#16A34A' + 'BB' }} className='text-[10px] font-semibold mt-[3px]'>Collected</Text>
                                <Text className='text-[10px] text-[#4ADE80] mt-[2px]'>{summary?.paid_count ?? 0} records</Text>
                            </View>
                            <View className='flex-1 bg-[#FEE2E2] rounded-xl p-[14px] items-center'>
                                <Text className='text-[17px] font-extrabold text-[#DC2626]'>₱{fmt(summary?.total_pending ?? 0)}</Text>
                                <Text style={{ color: '#DC2626' + 'BB' }} className='text-[10px] font-semibold mt-[3px]'>Pending</Text>
                                <Text className='text-[10px] text-[#FCA5A5] mt-[2px]'>{summary?.unpaid_count ?? 0} records</Text>
                            </View>
                        </View>
                    </Section>

                    <Section title='Monthly Collection — Last 6 Months'>
                        {monthly.length === 0 ? (
                            <View className='py-5 items-center gap-[6px]'>
                                <Ionicons name='cash-outline' size={32} color='#CBD5E1' />
                                <Text className='text-[13px] text-[#94A3B8] font-medium'>No collection data yet</Text>
                            </View>
                        ) : (
                            <View className='gap-2'>
                                {monthly.map((row, i) => (
                                    <View
                                        key={row.month}
                                        style={{ backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent' }}
                                        className='rounded-lg px-1 py-[6px] flex-row items-center gap-2'
                                    >
                                        <Text className='w-16 text-[11px] text-[#64748B] font-semibold'>{row.label}</Text>
                                        <View className='flex-1 h-3 bg-mint rounded overflow-hidden'>
                                            <View
                                                style={{ width: `${Math.round((row.collected / maxCollected) * 100)}%` }}
                                                className='h-full bg-[#16A34A] rounded'
                                            />
                                        </View>
                                        <Text className='w-[72px] text-[11px] font-bold text-[#16A34A] text-right'>
                                            ₱{fmt(row.collected)}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </Section>

                    <Section title='Top Debtors (Pending)'>
                        {debtors.length === 0 ? (
                            <View className='py-5 items-center gap-[6px]'>
                                <Ionicons name='checkmark-circle-outline' size={36} color={LEAF} />
                                <Text className='text-[13px] text-[#5A7A5E] font-semibold'>No pending fines</Text>
                            </View>
                        ) : (
                            <>
                                <TableHeader cols={['#', 'Member', 'Pending', 'Total']} widths={[28, 'flex', 80, 80]} />
                                {debtors.map((row, i) => (
                                    <View
                                        key={row.user_id}
                                        style={{ backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent' }}
                                        className='flex-row px-[10px] py-[9px] items-center rounded-md'
                                    >
                                        <Text className='w-7 text-[11px] text-[#94A3B8] font-bold'>{i + 1}</Text>
                                        <View className='flex-1'>
                                            <Text className='text-[12px] font-bold text-[#1C2B1E]' numberOfLines={1}>
                                                {row.user_name}
                                            </Text>
                                            <Text className='text-[10px] text-[#7A9A7E] mt-[1px]'>{row.user_id_number}</Text>
                                        </View>
                                        <View className='w-20 items-end'>
                                            <View className='bg-[#FEE2E2] rounded-md px-2 py-[3px]'>
                                                <Text className='text-[12px] font-extrabold text-[#DC2626]'>₱{fmt(row.pending)}</Text>
                                            </View>
                                        </View>
                                        <Text className='w-20 text-[11px] text-[#94A3B8] text-right'>₱{fmt(row.total_fines)}</Text>
                                    </View>
                                ))}
                            </>
                        )}
                    </Section>

                    <Section title={`Fine Records${details.length > 0 ? ` (${details.length})` : ''}`}>
                        {details.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <>
                                <TableHeader cols={['Member', 'Book', 'Due', 'Amount', 'Status']} widths={['flex', 'flex', 68, 64, 56]} />
                                {details.map((row, i) => (
                                    <View
                                        key={row.fine_id}
                                        style={{ backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent' }}
                                        className='flex-row px-[10px] py-2 items-center rounded-md'
                                    >
                                        <View className='flex-1 pr-1'>
                                            <Text className='text-[11px] font-bold text-[#1C2B1E]' numberOfLines={1}>
                                                {row.member_name}
                                            </Text>
                                            <Text className='text-[9px] text-[#7A9A7E] mt-[1px]'>{row.member_id_number}</Text>
                                        </View>
                                        <Text className='flex-1 text-[11px] text-[#1C2B1E] pr-1' numberOfLines={2}>
                                            {row.book_title}
                                        </Text>
                                        <Text className='w-[68px] text-[10px] text-[#D97706]'>
                                            {fmtDate(row.due_date)}
                                        </Text>
                                        <Text className='w-16 text-[11px] font-bold text-[#1C2B1E] text-right'>
                                            ₱{fmt(row.amount)}
                                        </Text>
                                        <View className='w-14 items-center'>
                                            <View
                                                style={{ backgroundColor: row.paid ? '#DCFCE7' : '#FEE2E2' }}
                                                className='rounded-md px-[6px] py-[3px]'
                                            >
                                                <Text style={{ color: row.paid ? '#16A34A' : '#DC2626' }} className='text-[9px] font-bold'>
                                                    {row.paid ? 'Paid' : 'Pending'}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}
                    </Section>
                </ScrollView>
            )}
        </View>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View
            className='bg-white rounded-2xl overflow-hidden'
            style={{ elevation: 2, shadowColor: BRAND, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4 }}
        >
            <View className='px-4 py-[13px] border-b border-[#F1F5F9]'>
                <Text className='text-[13px] font-extrabold text-[#1C2B1E]'>{title}</Text>
            </View>
            <View className='p-[14px]'>{children}</View>
        </View>
    )
}

function TableHeader({ cols, widths }: { cols: string[]; widths: (number | 'flex')[] }) {
    return (
        <View className='flex-row bg-[#F8FAFC] rounded-lg px-[10px] py-[7px] mb-[2px]'>
            {cols.map((col, i) => (
                <Text
                    key={col}
                    style={{
                        flex: widths[i] === 'flex' ? 1 : undefined,
                        width: widths[i] !== 'flex' ? (widths[i] as number) : undefined,
                        fontSize: 9,
                        fontWeight: '700',
                        color: '#64748B',
                        textTransform: 'uppercase',
                        letterSpacing: 0.4,
                        textAlign: typeof widths[i] === 'number' ? 'right' : 'left',
                    }}
                >
                    {col}
                </Text>
            ))}
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
