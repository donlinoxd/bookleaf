import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import * as Print from 'expo-print'
import { useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { queryKeys } from '../../../src/lib/queryKeys'
import { BorrowService } from '../../../src/services/BorrowService'
import { CirculationReportService } from '../../../src/services/CirculationReportService'
import { useAppStore } from '../../../src/store/appStore'
import { buildCirculationReportHtml } from '../../../src/utils/circulationReportHtml'

const BRAND = '#2A5C33'
const LEAF = '#5CB85C'

export default function CirculationReportScreen() {
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const { institution, settings } = useAppStore()
    const institutionId = institution?.id ?? 0
    const [sharing, setSharing] = useState(false)

    const { data: overview, isLoading: l1 } = useQuery({
        queryKey: queryKeys.circulationOverview(institutionId),
        queryFn: () => CirculationReportService.getOverview(institutionId),
        enabled: !!institutionId,
    })

    const { data: monthly = [], isLoading: l2 } = useQuery({
        queryKey: queryKeys.circulationMonthly(institutionId),
        queryFn: () => CirculationReportService.getMonthlyTrends(institutionId, 12),
        enabled: !!institutionId,
    })

    const { data: topBorrowers = [], isLoading: l3 } = useQuery({
        queryKey: queryKeys.circulationTopBorrowers(institutionId),
        queryFn: () => CirculationReportService.getTopBorrowers(institutionId, 10),
        enabled: !!institutionId,
    })

    const { data: mostBorrowed = [], isLoading: l4 } = useQuery({
        queryKey: queryKeys.circulationMostBorrowed(institutionId),
        queryFn: () => CirculationReportService.getMostBorrowed(institutionId, 10),
        enabled: !!institutionId,
    })

    const { data: overdue = [], isLoading: l5 } = useQuery({
        queryKey: queryKeys.overdue(),
        queryFn: BorrowService.getOverdue,
    })

    const isLoading = l1 || l2 || l3 || l4 || l5
    const allReady = !isLoading && !!overview

    const maxBorrows = monthly.reduce((m, r) => Math.max(m, r.borrows, r.returns), 1)

    const handleSharePdf = async () => {
        if (!allReady || !overview) return
        setSharing(true)
        try {
            const html = buildCirculationReportHtml({
                institutionName: settings?.institution_name ?? institution?.name ?? 'Library',
                overview,
                monthly,
                topBorrowers,
                mostBorrowed,
                overdue,
            })
            const { uri } = await Print.printToFileAsync({ html, base64: false })
            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: 'Share Circulation Report',
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
                        <Text className='text-white text-[22px] font-extrabold'>Circulation Report</Text>
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
                    <Section title='Overview'>
                        <View className='flex-row flex-wrap gap-[10px]'>
                            <MiniStat label='Total Borrows' value={overview?.total_borrows ?? 0} accent={BRAND} bg='#E2EFE0' />
                            <MiniStat label='Currently Out' value={overview?.currently_borrowed ?? 0} accent='#D97706' bg='#FEF3C7' />
                            <MiniStat label='Overdue' value={overview?.overdue ?? 0} accent='#DC2626' bg='#FEE2E2' />
                            <MiniStat label='Returned' value={overview?.returned ?? 0} accent={LEAF} bg='#DCFCE7' />
                            <MiniStat label='Active Borrowers' value={overview?.active_borrowers ?? 0} accent='#7C3AED' bg='#EDE9FE' />
                        </View>
                    </Section>

                    <Section title='Monthly Trends — Last 12 Months'>
                        {monthly.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <View className='gap-[6px]'>
                                <View className='flex-row px-1 mb-[2px]'>
                                    <Text className='w-[72px] text-[10px] font-bold text-[#64748B] uppercase'>
                                        Month
                                    </Text>
                                    <Text className='flex-1 text-[10px] font-bold text-brand uppercase'>
                                        Borrowed
                                    </Text>
                                    <Text className='flex-1 text-[10px] font-bold text-leaf uppercase'>
                                        Returned
                                    </Text>
                                </View>
                                {monthly.map((row, i) => (
                                    <View
                                        key={row.month}
                                        style={{ backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent' }}
                                        className='rounded-lg px-1 py-[6px] gap-1'
                                    >
                                        <View className='flex-row items-center'>
                                            <Text className='w-[72px] text-[11px] text-[#64748B] font-semibold'>{row.label}</Text>
                                            <View className='flex-1 flex-row items-center gap-[6px]'>
                                                <View
                                                    style={{
                                                        flex: row.borrows / maxBorrows,
                                                        backgroundColor: BRAND + 'CC',
                                                        maxWidth: '70%',
                                                    }}
                                                    className='h-[10px] rounded-[3px]'
                                                />
                                                <Text className='text-[11px] font-bold text-brand'>{row.borrows}</Text>
                                            </View>
                                        </View>
                                        <View className='flex-row items-center'>
                                            <View className='w-[72px]' />
                                            <View className='flex-1 flex-row items-center gap-[6px]'>
                                                <View
                                                    style={{
                                                        flex: row.returns / maxBorrows,
                                                        backgroundColor: LEAF + 'CC',
                                                        maxWidth: '70%',
                                                    }}
                                                    className='h-[10px] rounded-[3px]'
                                                />
                                                <Text className='text-[11px] font-bold text-leaf'>{row.returns}</Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                                <View className='flex-row gap-4 mt-[6px] px-1'>
                                    <View className='flex-row items-center gap-[5px]'>
                                        <View style={{ backgroundColor: BRAND + 'CC' }} className='w-3 h-[10px] rounded-[2px]' />
                                        <Text className='text-[10px] text-[#64748B]'>Borrowed</Text>
                                    </View>
                                    <View className='flex-row items-center gap-[5px]'>
                                        <View style={{ backgroundColor: LEAF + 'CC' }} className='w-3 h-[10px] rounded-[2px]' />
                                        <Text className='text-[10px] text-[#64748B]'>Returned</Text>
                                    </View>
                                </View>
                            </View>
                        )}
                    </Section>

                    <Section title='Most Borrowed Books'>
                        {mostBorrowed.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <>
                                <TableHeader cols={['#', 'Title', 'Author', 'Times']} widths={[28, 'flex', 'flex', 44]} />
                                {mostBorrowed.map((row, i) => (
                                    <View
                                        key={row.resource_id}
                                        style={{ backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent' }}
                                        className='flex-row px-[10px] py-[9px] items-center rounded-md'
                                    >
                                        <Text className='w-7 text-[11px] text-[#94A3B8] font-bold'>{i + 1}</Text>
                                        <View className='flex-1 pr-2'>
                                            <Text className='text-[12px] font-bold text-[#1C2B1E]' numberOfLines={1}>
                                                {row.title}
                                            </Text>
                                            <Text className='text-[11px] text-[#7A9A7E] mt-[1px]' numberOfLines={1}>
                                                {row.author}
                                            </Text>
                                        </View>
                                        <View className='w-11 items-center'>
                                            <View className='bg-mint rounded-lg px-2 py-[3px]'>
                                                <Text className='text-[12px] font-extrabold text-brand'>{row.borrow_count}</Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}
                    </Section>

                    <Section title='Top Borrowers'>
                        {topBorrowers.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <>
                                <TableHeader cols={['#', 'Name', 'Total', 'Active']} widths={[28, 'flex', 48, 48]} />
                                {topBorrowers.map((row, i) => (
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
                                            <Text className='text-[11px] text-[#7A9A7E] mt-[1px]'>{row.user_id_number}</Text>
                                        </View>
                                        <Text className='w-12 text-[12px] font-bold text-brand text-center'>
                                            {row.total_borrows}
                                        </Text>
                                        <View className='w-12 items-center'>
                                            {row.active_borrows > 0 ? (
                                                <View className='bg-[#FEF3C7] rounded-md px-[6px] py-[2px]'>
                                                    <Text className='text-[11px] font-bold text-[#D97706]'>{row.active_borrows}</Text>
                                                </View>
                                            ) : (
                                                <Text className='text-[11px] text-[#94A3B8]'>—</Text>
                                            )}
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}
                    </Section>

                    <Section title={`Overdue Materials${overdue.length > 0 ? ` (${overdue.length})` : ''}`}>
                        {overdue.length === 0 ? (
                            <View className='py-5 items-center gap-[6px]'>
                                <Ionicons name='checkmark-circle-outline' size={36} color='#5CB85C' />
                                <Text className='text-[13px] text-[#5A7A5E] font-semibold'>No overdue materials</Text>
                            </View>
                        ) : (
                            <>
                                <TableHeader cols={['Member', 'Book', 'Due', 'Days']} widths={['flex', 'flex', 72, 44]} />
                                {overdue.map((row, i) => {
                                    const daysOverdue = Math.ceil((Date.now() - new Date(row.due_date).getTime()) / 86400000)
                                    return (
                                        <View
                                            key={row.id}
                                            style={{ backgroundColor: i % 2 === 1 ? '#FFF7ED' : 'transparent' }}
                                            className='flex-row px-[10px] py-[9px] items-center rounded-md'
                                        >
                                            <View className='flex-1 pr-[6px]'>
                                                <Text className='text-[12px] font-bold text-[#1C2B1E]' numberOfLines={1}>
                                                    {row.member_name}
                                                </Text>
                                                <Text className='text-[10px] text-[#7A9A7E]'>{row.member_id_number}</Text>
                                            </View>
                                            <Text className='flex-1 text-[11px] text-[#1C2B1E] pr-[6px]' numberOfLines={2}>
                                                {row.book_title}
                                            </Text>
                                            <Text className='w-[72px] text-[11px] text-[#D97706] font-semibold'>
                                                {new Date(row.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                            </Text>
                                            <View className='w-11 items-center'>
                                                <View className='bg-[#FEE2E2] rounded-md px-[5px] py-[2px]'>
                                                    <Text className='text-[10px] font-extrabold text-[#DC2626]'>{daysOverdue}d</Text>
                                                </View>
                                            </View>
                                        </View>
                                    )
                                })}
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
                        width: widths[i] !== 'flex' ? widths[i] : undefined,
                        fontSize: 10,
                        fontWeight: '700',
                        color: '#64748B',
                        textTransform: 'uppercase',
                        letterSpacing: 0.4,
                        textAlign: typeof widths[i] === 'number' ? 'center' : 'left',
                    }}
                >
                    {col}
                </Text>
            ))}
        </View>
    )
}

function MiniStat({ label, value, accent, bg }: { label: string; value: number; accent: string; bg: string }) {
    return (
        <View style={{ backgroundColor: bg }} className='rounded-xl p-3 items-center min-w-[90px] grow'>
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
