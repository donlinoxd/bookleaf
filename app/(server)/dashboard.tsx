import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Image, ScrollView, StatusBar, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native'
import { BarChart, BarItem } from '../../src/components/charts/BarChart'
import { DonutRing } from '../../src/components/charts/DonutRing'
import { ServerStatusCard } from '../../src/components/common/ServerStatusCard'
import { queryKeys } from '../../src/lib/queryKeys'
import { BorrowService } from '../../src/services/BorrowService'
import { CirculationReportService } from '../../src/services/CirculationReportService'
import { FinesReportService } from '../../src/services/FinesReportService'
import { GateService } from '../../src/services/GateService'
import { PatronReportService } from '../../src/services/PatronReportService'
import { ReportService } from '../../src/services/ReportService'
import { useAppStore } from '../../src/store/appStore'

import MASCOT from '../../assets/images/leaf-welcome.png'

const CARD_SHADOW = {
    elevation: 2,
    shadowColor: '#2A5C33',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
}

export default function DashboardScreen() {
    const router = useRouter()
    const { currentUser, institution, settings } = useAppStore()
    const { width } = useWindowDimensions()
    const chartWidth = width - 64

    const iid = institution?.id ?? 0
    const enabled = !!institution

    const { data: inventoryStats } = useQuery({
        queryKey: queryKeys.dashboard(iid),
        queryFn: () => ReportService.inventorySummary(iid),
        enabled,
    })

    const { data: overdueAll = [] } = useQuery({
        queryKey: queryKeys.overdue(),
        queryFn: BorrowService.getOverdue,
    })

    const { data: patronOverview } = useQuery({
        queryKey: queryKeys.patronOverview(iid),
        queryFn: () => PatronReportService.getOverview(iid),
        enabled,
    })

    const { data: gateToday } = useQuery({
        queryKey: [...queryKeys.gateTodayLogs(iid), 'count'],
        queryFn: () => GateService.getTodayCount(iid),
        enabled,
    })

    const { data: finesSummary } = useQuery({
        queryKey: queryKeys.finesReportSummary(iid),
        queryFn: () => FinesReportService.getSummary(iid),
        enabled,
    })

    const { data: newMembersData = [] } = useQuery({
        queryKey: queryKeys.patronRegistrations(iid),
        queryFn: () => PatronReportService.getMonthlyRegistrations(iid, 1),
        enabled,
    })

    const { data: monthlyTrends = [] } = useQuery({
        queryKey: queryKeys.circulationMonthly(iid),
        queryFn: () => CirculationReportService.getMonthlyTrends(iid, 6),
        enabled,
    })

    const { data: mostBorrowed = [] } = useQuery({
        queryKey: queryKeys.circulationMostBorrowed(iid),
        queryFn: () => CirculationReportService.getMostBorrowed(iid, 5),
        enabled,
    })

    const { data: attendance = [] } = useQuery({
        queryKey: queryKeys.patronAttendance(iid),
        queryFn: () => PatronReportService.getMonthlyAttendance(iid, 6),
        enabled,
    })

    const firstName = currentUser?.name?.split(' ')[0] ?? 'there'
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'librarian'

    const overdue = overdueAll.slice(0, 5)
    const newThisMonth = newMembersData[newMembersData.length - 1]?.count ?? 0

    const totalFines = finesSummary?.total_fines ?? 0
    const collected = finesSummary?.total_collected ?? 0
    const totalPending = finesSummary?.total_pending ?? 0
    const finesRatio = totalFines > 0 ? collected / totalFines : 0

    const circulationData: BarItem[] = monthlyTrends.map((m) => ({
        label: m.label,
        primary: m.borrows,
        secondary: m.returns,
    }))

    const attendanceData: BarItem[] = attendance.map((m) => ({
        label: m.label,
        primary: m.unique_visitors,
    }))

    const topBooks = mostBorrowed.filter((b) => b.borrow_count > 0).slice(0, 5)
    const maxBorrowCount = Math.max(...topBooks.map((b) => b.borrow_count), 1)

    const formatPeso = (n: number) => {
        if (n >= 1000) return `₱${(n / 1000).toFixed(1)}k`
        return `₱${Math.round(n)}`
    }

    return (
        <ScrollView className='flex-1 bg-bio' contentContainerStyle={{ paddingBottom: 150 }}>
            <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />

            {/* Header */}
            <View className='bg-brand px-5 pb-6 pt-[52px] rounded-b-[28px]'>
                <View className='flex-row items-end justify-between'>
                    <View className='flex-1'>
                        <Text className='text-xs font-semibold text-[#A8D5A2] tracking-widest uppercase mb-1'>Good day,</Text>
                        <Text className='text-2xl font-extrabold text-white'>{firstName}</Text>
                        <Text className='text-sm text-[#A8D5A2] mt-0.5 font-medium'>{settings?.institution_name}</Text>
                    </View>
                    <View className='items-start flex-row gap-2'>
                        <TouchableOpacity onPress={() => router.push('/(server)/ai-chat')} hitSlop={8}>
                            <Image source={MASCOT} className='w-24 h-24 -mb-2' resizeMode='contain' />
                        </TouchableOpacity>

                        <View className='gap-2'>
                            {isAdmin && (
                                <TouchableOpacity onPress={() => router.push('/(server)/settings')} hitSlop={8}>
                                    <Ionicons name='settings-outline' size={22} color='#A8D5A2' />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </View>

            <View className='px-4 mt-4 gap-4'>
                {isAdmin && institution && <ServerStatusCard institutionId={institution.id} />}

                {/* Collection stats */}
                <View>
                    <SectionLabel>Collection</SectionLabel>
                    <View className='flex-row gap-2 mt-2'>
                        <StatCard label='Total Books' value={String(inventoryStats?.total_copies ?? 0)} accent='#2A5C33' bg='#E2EFE0' />
                        <StatCard label='Available' value={String(inventoryStats?.available_copies ?? 0)} accent='#5CB85C' bg='#DCFCE7' />
                        <StatCard label='Borrowed' value={String(inventoryStats?.borrowed_copies ?? 0)} accent='#D97706' bg='#FEF3C7' />
                        <StatCard label='Overdue' value={String(overdueAll.length)} accent='#DC2626' bg='#FEE2E2' />
                    </View>
                </View>

                {/* Patron & financial stats */}
                <View>
                    <SectionLabel>Patrons & Finance</SectionLabel>
                    <View className='flex-row gap-2 mt-2'>
                        <StatCard label='Members' value={String(patronOverview?.total_members ?? 0)} accent='#2A5C33' bg='#E2EFE0' />
                        <StatCard label='Today' value={String(gateToday?.total ?? 0)} accent='#0F766E' bg='#CCFBF1' />
                        <StatCard label='Fines Due' value={formatPeso(totalPending)} accent='#B45309' bg='#FEF3C7' small />
                        <StatCard label='New /mo' value={String(newThisMonth)} accent='#1E6B8C' bg='#E0F2FE' />
                    </View>
                </View>

                {/* Circulation Trend */}
                <View className='bg-white rounded-2xl p-4' style={CARD_SHADOW}>
                    <View className='flex-row items-center justify-between mb-1'>
                        <Text className='text-base font-bold text-[#1C2B1E]'>Circulation Trend</Text>
                        <View className='flex-row items-center gap-3'>
                            <LegendDot color='#2A5C33' label='Borrows' />
                            <LegendDot color='#A8D5A2' label='Returns' />
                        </View>
                    </View>
                    <Text className='text-xs text-[#7A9A7E] mb-3'>Last 6 months</Text>
                    {circulationData.length > 0 ? (
                        <BarChart data={circulationData} width={chartWidth} height={130} primaryColor='#2A5C33' secondaryColor='#A8D5A2' />
                    ) : (
                        <EmptyChart label='No circulation data yet' />
                    )}
                </View>

                {/* Quick Actions */}
                <View className='bg-white rounded-2xl p-4' style={CARD_SHADOW}>
                    <Text className='text-base font-bold text-[#1C2B1E] mb-3'>Quick Actions</Text>
                    <View className='flex-row gap-3'>
                        <ActionButton label='Check Out' emoji='📤' color='#2A5C33' onPress={() => router.push('/(server)/borrow')} />
                        <ActionButton label='Return' emoji='📥' color='#5CB85C' onPress={() => router.push('/(server)/borrow')} />
                        <ActionButton label='Inventory' emoji='🔍' color='#1E6B8C' onPress={() => router.push('/(server)/inventory-scan')} />
                        <ActionButton label='Gate' emoji='🚪' color='#7C3AED' onPress={() => router.push('/(server)/gate-scan')} />
                        <ActionButton label='Reports' emoji='📊' color='#0F766E' onPress={() => router.push('/(server)/reports')} />
                    </View>
                </View>

                {/* Fines Overview */}
                <View className='bg-white rounded-2xl p-4' style={CARD_SHADOW}>
                    <Text className='text-base font-bold text-[#1C2B1E] mb-4'>Fines Overview</Text>
                    <View className='flex-row items-center gap-5'>
                        <DonutRing
                            ratio={finesRatio}
                            color='#5CB85C'
                            trackColor='#FEE2E2'
                            size={100}
                            strokeWidth={13}
                            label={totalFines > 0 ? `${Math.round(finesRatio * 100)}%` : '—'}
                            sublabel={totalFines > 0 ? 'collected' : 'no fines'}
                        />
                        <View className='flex-1 gap-2.5'>
                            <FineStatRow label='Total Issued' value={formatPeso(totalFines)} color='#1C2B1E' />
                            <View className='h-px bg-[#F1F5F9]' />
                            <FineStatRow label='Collected' value={formatPeso(collected)} color='#5CB85C' />
                            <FineStatRow label='Pending' value={formatPeso(totalPending)} color='#DC2626' />
                            <View className='h-px bg-[#F1F5F9]' />
                            <FineStatRow label='Unpaid Cases' value={String(finesSummary?.unpaid_count ?? 0)} color='#D97706' />
                        </View>
                    </View>
                </View>

                {/* Most Borrowed Books */}
                {topBooks.length > 0 && (
                    <View className='bg-white rounded-2xl p-4' style={CARD_SHADOW}>
                        <Text className='text-base font-bold text-[#1C2B1E] mb-1'>Most Borrowed</Text>
                        <Text className='text-xs text-[#7A9A7E] mb-3'>All time top titles</Text>
                        {topBooks.map((book, idx) => (
                            <View key={book.resource_id} className={`py-2.5 ${idx > 0 ? 'border-t border-[#F1F5F9]' : ''}`}>
                                <View className='flex-row items-center mb-2'>
                                    <View className='w-5 h-5 rounded-full bg-[#E2EFE0] items-center justify-center mr-2.5 shrink-0'>
                                        <Text className='text-[10px] font-bold text-[#2A5C33]'>{idx + 1}</Text>
                                    </View>
                                    <View className='flex-1'>
                                        <Text className='text-sm font-semibold text-[#1C2B1E]' numberOfLines={1}>
                                            {book.title}
                                        </Text>
                                        <Text className='text-xs text-[#7A9A7E]' numberOfLines={1}>
                                            {book.author}
                                        </Text>
                                    </View>
                                    <View className='bg-[#E2EFE0] rounded-full px-2 py-0.5 ml-2 shrink-0'>
                                        <Text className='text-xs font-bold text-[#2A5C33]'>{book.borrow_count}×</Text>
                                    </View>
                                </View>
                                <View className='h-1.5 bg-[#F1F5F9] rounded-full ml-7 overflow-hidden'>
                                    <View
                                        className='h-full rounded-full bg-[#2A5C33]'
                                        style={{ width: `${(book.borrow_count / maxBorrowCount) * 100}%` }}
                                    />
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Monthly Attendance */}
                <View className='bg-white rounded-2xl p-4' style={CARD_SHADOW}>
                    <View className='flex-row items-center justify-between mb-1'>
                        <Text className='text-base font-bold text-[#1C2B1E]'>Monthly Attendance</Text>
                        <LegendDot color='#0F766E' label='Visitors' />
                    </View>
                    <Text className='text-xs text-[#7A9A7E] mb-3'>Unique gate entries per month</Text>
                    {attendanceData.length > 0 ? (
                        <BarChart data={attendanceData} width={chartWidth} height={120} primaryColor='#0F766E' />
                    ) : (
                        <EmptyChart label='No gate data recorded yet' />
                    )}
                </View>

                {/* Overdue Books */}
                <View className='bg-white rounded-2xl p-4' style={CARD_SHADOW}>
                    <View className='flex-row items-center justify-between mb-3'>
                        <Text className='text-base font-bold text-[#1C2B1E]'>Overdue Books</Text>
                        {overdueAll.length > 0 && (
                            <View className='bg-red-100 rounded-full px-2.5 py-0.5'>
                                <Text className='text-xs font-bold text-red-600'>{overdueAll.length}</Text>
                            </View>
                        )}
                    </View>
                    {overdue.length === 0 ? (
                        <View className='items-center py-4'>
                            <Text className='text-2xl mb-1'>✅</Text>
                            <Text className='text-sm text-[#7A9A7E] font-medium'>No overdue books</Text>
                        </View>
                    ) : (
                        overdue.map((record, index) => (
                            <View key={record.id} className={`flex-row items-center py-3 ${index > 0 ? 'border-t border-[#F1F5F9]' : ''}`}>
                                <View className='flex-1'>
                                    <Text className='text-sm font-semibold text-[#1C2B1E]'>{record.book_title}</Text>
                                    <Text className='text-xs text-[#5A7A5E] mt-0.5'>
                                        {record.member_name} · {record.member_id_number}
                                    </Text>
                                </View>
                                <View className='bg-red-100 rounded-lg px-2.5 py-1 ml-3'>
                                    <Text className='text-xs font-bold text-red-600'>{new Date(record.due_date).toLocaleDateString()}</Text>
                                </View>
                            </View>
                        ))
                    )}
                </View>
            </View>
        </ScrollView>
    )
}

function SectionLabel({ children }: { children: string }) {
    return <Text className='text-xs font-bold text-[#7A9A7E] tracking-widest uppercase'>{children}</Text>
}

function StatCard({ label, value, accent, bg, small }: { label: string; value: string; accent: string; bg: string; small?: boolean }) {
    return (
        <View
            className='flex-1 rounded-2xl p-3 items-center'
            style={{
                backgroundColor: bg,
                elevation: 1,
                shadowColor: accent,
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 2,
            }}
        >
            <Text className={`font-extrabold ${small ? 'text-lg' : 'text-2xl'}`} style={{ color: accent }}>
                {value}
            </Text>
            <Text className='text-[10px] font-semibold text-center mt-0.5' style={{ color: accent + 'CC' }}>
                {label}
            </Text>
        </View>
    )
}

function ActionButton({ label, emoji, color, onPress }: { label: string; emoji: string; color: string; onPress: () => void }) {
    return (
        <TouchableOpacity className='flex-1 rounded-xl py-3 items-center gap-1' style={{ backgroundColor: color }} onPress={onPress}>
            <Text className='text-lg'>{emoji}</Text>
            <Text className='text-white text-xs font-bold'>{label}</Text>
        </TouchableOpacity>
    )
}

function LegendDot({ color, label }: { color: string; label: string }) {
    return (
        <View className='flex-row items-center gap-1'>
            <View className='w-2.5 h-2.5 rounded-full' style={{ backgroundColor: color }} />
            <Text className='text-xs text-[#7A9A7E]'>{label}</Text>
        </View>
    )
}

function FineStatRow({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View className='flex-row items-center justify-between'>
            <Text className='text-xs text-[#7A9A7E]'>{label}</Text>
            <Text className='text-sm font-bold' style={{ color }}>
                {value}
            </Text>
        </View>
    )
}

function EmptyChart({ label }: { label: string }) {
    return (
        <View className='items-center justify-center py-8'>
            <Ionicons name='bar-chart-outline' size={28} color='#C8DBC9' />
            <Text className='text-sm text-[#A8C5AA] mt-2'>{label}</Text>
        </View>
    )
}
