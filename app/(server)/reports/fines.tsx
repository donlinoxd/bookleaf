import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import * as Print from 'expo-print'
import { useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { queryKeys } from '../../../src/lib/queryKeys'
import { FinesReportService } from '../../../src/services/FinesReportService'
import { useAppStore } from '../../../src/store/appStore'
import { buildFinesReportHtml } from '../../../src/utils/finesReportHtml'

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
                        <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800' }}>Fines Report</Text>
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
                    {/* Summary */}
                    <Section title='Summary'>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                            <View style={{ flex: 1, backgroundColor: '#E2EFE0', borderRadius: 12, padding: 14, alignItems: 'center' }}>
                                <Text style={{ fontSize: 18, fontWeight: '800', color: BRAND }}>₱{fmt(summary?.total_fines ?? 0)}</Text>
                                <Text style={{ fontSize: 10, fontWeight: '600', color: BRAND + 'BB', marginTop: 3 }}>Total Issued</Text>
                            </View>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <View style={{ flex: 1, backgroundColor: '#DCFCE7', borderRadius: 12, padding: 14, alignItems: 'center' }}>
                                <Text style={{ fontSize: 17, fontWeight: '800', color: '#16A34A' }}>₱{fmt(summary?.total_collected ?? 0)}</Text>
                                <Text style={{ fontSize: 10, fontWeight: '600', color: '#16A34A' + 'BB', marginTop: 3 }}>Collected</Text>
                                <Text style={{ fontSize: 10, color: '#4ADE80', marginTop: 2 }}>{summary?.paid_count ?? 0} records</Text>
                            </View>
                            <View style={{ flex: 1, backgroundColor: '#FEE2E2', borderRadius: 12, padding: 14, alignItems: 'center' }}>
                                <Text style={{ fontSize: 17, fontWeight: '800', color: '#DC2626' }}>₱{fmt(summary?.total_pending ?? 0)}</Text>
                                <Text style={{ fontSize: 10, fontWeight: '600', color: '#DC2626' + 'BB', marginTop: 3 }}>Pending</Text>
                                <Text style={{ fontSize: 10, color: '#FCA5A5', marginTop: 2 }}>{summary?.unpaid_count ?? 0} records</Text>
                            </View>
                        </View>
                    </Section>

                    {/* Monthly Collection */}
                    <Section title='Monthly Collection — Last 6 Months'>
                        {monthly.length === 0 ? (
                            <View style={{ paddingVertical: 20, alignItems: 'center', gap: 6 }}>
                                <Ionicons name='cash-outline' size={32} color='#CBD5E1' />
                                <Text style={{ fontSize: 13, color: '#94A3B8', fontWeight: '500' }}>No collection data yet</Text>
                            </View>
                        ) : (
                            <View style={{ gap: 8 }}>
                                {monthly.map((row, i) => (
                                    <View
                                        key={row.month}
                                        style={{
                                            backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent',
                                            borderRadius: 8,
                                            paddingHorizontal: 4,
                                            paddingVertical: 6,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 8,
                                        }}
                                    >
                                        <Text style={{ width: 64, fontSize: 11, color: '#64748B', fontWeight: '600' }}>{row.label}</Text>
                                        <View style={{ flex: 1, height: 12, backgroundColor: '#E2EFE0', borderRadius: 4, overflow: 'hidden' }}>
                                            <View
                                                style={{
                                                    width: `${Math.round((row.collected / maxCollected) * 100)}%`,
                                                    height: '100%',
                                                    backgroundColor: '#16A34A',
                                                    borderRadius: 4,
                                                }}
                                            />
                                        </View>
                                        <Text style={{ width: 72, fontSize: 11, fontWeight: '700', color: '#16A34A', textAlign: 'right' }}>
                                            ₱{fmt(row.collected)}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </Section>

                    {/* Top Debtors */}
                    <Section title='Top Debtors (Pending)'>
                        {debtors.length === 0 ? (
                            <View style={{ paddingVertical: 20, alignItems: 'center', gap: 6 }}>
                                <Ionicons name='checkmark-circle-outline' size={36} color={LEAF} />
                                <Text style={{ fontSize: 13, color: '#5A7A5E', fontWeight: '600' }}>No pending fines</Text>
                            </View>
                        ) : (
                            <>
                                <TableHeader cols={['#', 'Member', 'Pending', 'Total']} widths={[28, 'flex', 80, 80]} />
                                {debtors.map((row, i) => (
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
                                            <Text style={{ fontSize: 10, color: '#7A9A7E', marginTop: 1 }}>{row.user_id_number}</Text>
                                        </View>
                                        <View style={{ width: 80, alignItems: 'flex-end' }}>
                                            <View style={{ backgroundColor: '#FEE2E2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                                                <Text style={{ fontSize: 12, fontWeight: '800', color: '#DC2626' }}>₱{fmt(row.pending)}</Text>
                                            </View>
                                        </View>
                                        <Text style={{ width: 80, fontSize: 11, color: '#94A3B8', textAlign: 'right' }}>₱{fmt(row.total_fines)}</Text>
                                    </View>
                                ))}
                            </>
                        )}
                    </Section>

                    {/* Fine Records */}
                    <Section title={`Fine Records${details.length > 0 ? ` (${details.length})` : ''}`}>
                        {details.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <>
                                <TableHeader cols={['Member', 'Book', 'Due', 'Amount', 'Status']} widths={['flex', 'flex', 68, 64, 56]} />
                                {details.map((row, i) => (
                                    <View
                                        key={row.fine_id}
                                        style={{
                                            flexDirection: 'row',
                                            paddingHorizontal: 10,
                                            paddingVertical: 8,
                                            alignItems: 'center',
                                            backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent',
                                            borderRadius: 6,
                                        }}
                                    >
                                        <View style={{ flex: 1, paddingRight: 4 }}>
                                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#1C2B1E' }} numberOfLines={1}>
                                                {row.member_name}
                                            </Text>
                                            <Text style={{ fontSize: 9, color: '#7A9A7E', marginTop: 1 }}>{row.member_id_number}</Text>
                                        </View>
                                        <Text style={{ flex: 1, fontSize: 11, color: '#1C2B1E', paddingRight: 4 }} numberOfLines={2}>
                                            {row.book_title}
                                        </Text>
                                        <Text style={{ width: 68, fontSize: 10, color: '#D97706' }}>
                                            {fmtDate(row.due_date)}
                                        </Text>
                                        <Text style={{ width: 64, fontSize: 11, fontWeight: '700', color: '#1C2B1E', textAlign: 'right' }}>
                                            ₱{fmt(row.amount)}
                                        </Text>
                                        <View style={{ width: 56, alignItems: 'center' }}>
                                            <View
                                                style={{
                                                    backgroundColor: row.paid ? '#DCFCE7' : '#FEE2E2',
                                                    borderRadius: 6,
                                                    paddingHorizontal: 6,
                                                    paddingVertical: 3,
                                                }}
                                            >
                                                <Text style={{ fontSize: 9, fontWeight: '700', color: row.paid ? '#16A34A' : '#DC2626' }}>
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
        <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: '#94A3B8', fontWeight: '500' }}>No data available</Text>
        </View>
    )
}
