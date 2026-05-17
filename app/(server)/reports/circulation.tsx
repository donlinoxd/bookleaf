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
        <View style={{ flex: 1, backgroundColor: '#F4F9F4' }}>
            <StatusBar barStyle='light-content' backgroundColor={BRAND} />

            {/* Header */}
            <View style={{ backgroundColor: BRAND, paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
                        <Ionicons name='arrow-back' size={22} color='#A8D5A2' />
                    </TouchableOpacity>
                    <Text style={{ color: '#A8D5A2', fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>Reports</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800' }}>Circulation Report</Text>
                        <Text style={{ color: '#A8D5A2', fontSize: 12, marginTop: 3 }}>
                            {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            backgroundColor: 'rgba(255,255,255,0.2)',
                            borderRadius: 12,
                            paddingHorizontal: 14,
                            paddingVertical: 9,
                            opacity: sharing || !allReady ? 0.6 : 1,
                        }}
                        onPress={handleSharePdf}
                        disabled={sharing || !allReady}
                    >
                        {sharing ? <ActivityIndicator size='small' color='#FFFFFF' /> : <Ionicons name='share-outline' size={17} color='#FFFFFF' />}
                        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>{sharing ? 'Preparing…' : 'Share PDF'}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {isLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size='large' color={LEAF} />
                    <Text style={{ marginTop: 12, fontSize: 13, color: '#7A9A7E', fontWeight: '600' }}>Loading report…</Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
                    {/* Overview */}
                    <Section title='Overview'>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                            <MiniStat label='Total Borrows' value={overview?.total_borrows ?? 0} accent={BRAND} bg='#E2EFE0' />
                            <MiniStat label='Currently Out' value={overview?.currently_borrowed ?? 0} accent='#D97706' bg='#FEF3C7' />
                            <MiniStat label='Overdue' value={overview?.overdue ?? 0} accent='#DC2626' bg='#FEE2E2' />
                            <MiniStat label='Returned' value={overview?.returned ?? 0} accent={LEAF} bg='#DCFCE7' />
                            <MiniStat label='Active Borrowers' value={overview?.active_borrowers ?? 0} accent='#7C3AED' bg='#EDE9FE' />
                        </View>
                    </Section>

                    {/* Monthly Trends */}
                    <Section title='Monthly Trends — Last 12 Months'>
                        {monthly.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <View style={{ gap: 6 }}>
                                <View style={{ flexDirection: 'row', paddingHorizontal: 4, marginBottom: 2 }}>
                                    <Text style={{ width: 72, fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>
                                        Month
                                    </Text>
                                    <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: BRAND, textTransform: 'uppercase' }}>
                                        Borrowed
                                    </Text>
                                    <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: LEAF, textTransform: 'uppercase' }}>
                                        Returned
                                    </Text>
                                </View>
                                {monthly.map((row, i) => (
                                    <View
                                        key={row.month}
                                        style={{
                                            backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent',
                                            borderRadius: 8,
                                            paddingHorizontal: 4,
                                            paddingVertical: 6,
                                            gap: 4,
                                        }}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Text style={{ width: 72, fontSize: 11, color: '#64748B', fontWeight: '600' }}>{row.label}</Text>
                                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <View
                                                    style={{
                                                        flex: row.borrows / maxBorrows,
                                                        height: 10,
                                                        backgroundColor: BRAND + 'CC',
                                                        borderRadius: 3,
                                                        maxWidth: '70%',
                                                    }}
                                                />
                                                <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND }}>{row.borrows}</Text>
                                            </View>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <View style={{ width: 72 }} />
                                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <View
                                                    style={{
                                                        flex: row.returns / maxBorrows,
                                                        height: 10,
                                                        backgroundColor: LEAF + 'CC',
                                                        borderRadius: 3,
                                                        maxWidth: '70%',
                                                    }}
                                                />
                                                <Text style={{ fontSize: 11, fontWeight: '700', color: LEAF }}>{row.returns}</Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                                <View style={{ flexDirection: 'row', gap: 16, marginTop: 6, paddingHorizontal: 4 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                        <View style={{ width: 12, height: 10, backgroundColor: BRAND + 'CC', borderRadius: 2 }} />
                                        <Text style={{ fontSize: 10, color: '#64748B' }}>Borrowed</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                        <View style={{ width: 12, height: 10, backgroundColor: LEAF + 'CC', borderRadius: 2 }} />
                                        <Text style={{ fontSize: 10, color: '#64748B' }}>Returned</Text>
                                    </View>
                                </View>
                            </View>
                        )}
                    </Section>

                    {/* Most Borrowed Books */}
                    <Section title='Most Borrowed Books'>
                        {mostBorrowed.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <>
                                <TableHeader cols={['#', 'Title', 'Author', 'Times']} widths={[28, 'flex', 'flex', 44]} />
                                {mostBorrowed.map((row, i) => (
                                    <View
                                        key={row.resource_id}
                                        style={{
                                            flexDirection: 'row',
                                            paddingHorizontal: 10,
                                            paddingVertical: 9,
                                            alignItems: 'center',
                                            backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent',
                                            borderRadius: 6,
                                        }}
                                    >
                                        <Text style={{ width: 28, fontSize: 11, color: '#94A3B8', fontWeight: '700' }}>{i + 1}</Text>
                                        <View style={{ flex: 1, paddingRight: 8 }}>
                                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#1C2B1E' }} numberOfLines={1}>
                                                {row.title}
                                            </Text>
                                            <Text style={{ fontSize: 11, color: '#7A9A7E', marginTop: 1 }} numberOfLines={1}>
                                                {row.author}
                                            </Text>
                                        </View>
                                        <View style={{ width: 44, alignItems: 'center' }}>
                                            <View style={{ backgroundColor: '#E2EFE0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                                                <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND }}>{row.borrow_count}</Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}
                    </Section>

                    {/* Top Borrowers */}
                    <Section title='Top Borrowers'>
                        {topBorrowers.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <>
                                <TableHeader cols={['#', 'Name', 'Total', 'Active']} widths={[28, 'flex', 48, 48]} />
                                {topBorrowers.map((row, i) => (
                                    <View
                                        key={row.user_id}
                                        style={{
                                            flexDirection: 'row',
                                            paddingHorizontal: 10,
                                            paddingVertical: 9,
                                            alignItems: 'center',
                                            backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent',
                                            borderRadius: 6,
                                        }}
                                    >
                                        <Text style={{ width: 28, fontSize: 11, color: '#94A3B8', fontWeight: '700' }}>{i + 1}</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#1C2B1E' }} numberOfLines={1}>
                                                {row.user_name}
                                            </Text>
                                            <Text style={{ fontSize: 11, color: '#7A9A7E', marginTop: 1 }}>{row.user_id_number}</Text>
                                        </View>
                                        <Text style={{ width: 48, fontSize: 12, fontWeight: '700', color: BRAND, textAlign: 'center' }}>
                                            {row.total_borrows}
                                        </Text>
                                        <View style={{ width: 48, alignItems: 'center' }}>
                                            {row.active_borrows > 0 ? (
                                                <View
                                                    style={{ backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}
                                                >
                                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#D97706' }}>{row.active_borrows}</Text>
                                                </View>
                                            ) : (
                                                <Text style={{ fontSize: 11, color: '#94A3B8' }}>—</Text>
                                            )}
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}
                    </Section>

                    {/* Overdue */}
                    <Section title={`Overdue Materials${overdue.length > 0 ? ` (${overdue.length})` : ''}`}>
                        {overdue.length === 0 ? (
                            <View style={{ paddingVertical: 20, alignItems: 'center', gap: 6 }}>
                                <Ionicons name='checkmark-circle-outline' size={36} color='#5CB85C' />
                                <Text style={{ fontSize: 13, color: '#5A7A5E', fontWeight: '600' }}>No overdue materials</Text>
                            </View>
                        ) : (
                            <>
                                <TableHeader cols={['Member', 'Book', 'Due', 'Days']} widths={['flex', 'flex', 72, 44]} />
                                {overdue.map((row, i) => {
                                    const daysOverdue = Math.ceil((Date.now() - new Date(row.due_date).getTime()) / 86400000)
                                    return (
                                        <View
                                            key={row.id}
                                            style={{
                                                flexDirection: 'row',
                                                paddingHorizontal: 10,
                                                paddingVertical: 9,
                                                alignItems: 'center',
                                                backgroundColor: i % 2 === 1 ? '#FFF7ED' : 'transparent',
                                                borderRadius: 6,
                                            }}
                                        >
                                            <View style={{ flex: 1, paddingRight: 6 }}>
                                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1C2B1E' }} numberOfLines={1}>
                                                    {row.member_name}
                                                </Text>
                                                <Text style={{ fontSize: 10, color: '#7A9A7E' }}>{row.member_id_number}</Text>
                                            </View>
                                            <Text style={{ flex: 1, fontSize: 11, color: '#1C2B1E', paddingRight: 6 }} numberOfLines={2}>
                                                {row.book_title}
                                            </Text>
                                            <Text style={{ width: 72, fontSize: 11, color: '#D97706', fontWeight: '600' }}>
                                                {new Date(row.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                            </Text>
                                            <View style={{ width: 44, alignItems: 'center' }}>
                                                <View
                                                    style={{ backgroundColor: '#FEE2E2', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}
                                                >
                                                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#DC2626' }}>{daysOverdue}d</Text>
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
            style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                overflow: 'hidden',
                elevation: 2,
                shadowColor: BRAND,
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.07,
                shadowRadius: 4,
            }}
        >
            <View style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#1C2B1E' }}>{title}</Text>
            </View>
            <View style={{ padding: 14 }}>{children}</View>
        </View>
    )
}

function TableHeader({ cols, widths }: { cols: string[]; widths: (number | 'flex')[] }) {
    return (
        <View
            style={{ flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 2 }}
        >
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
        <View style={{ borderRadius: 12, padding: 12, alignItems: 'center', minWidth: 90, backgroundColor: bg, flexGrow: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: accent }}>{value}</Text>
            <Text style={{ fontSize: 10, fontWeight: '600', color: accent + 'CC', textAlign: 'center', marginTop: 2 }}>{label}</Text>
        </View>
    )
}

function EmptyRow() {
    return (
        <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: '#94A3B8', fontWeight: '500' }}>No data available</Text>
        </View>
    )
}
