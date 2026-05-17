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
        <View style={{ flex: 1, backgroundColor: '#F4F9F4' }}>
            <StatusBar barStyle='light-content' backgroundColor={BRAND} />

            <View style={{ backgroundColor: BRAND, paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 24 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
                        <Ionicons name='arrow-back' size={22} color='#A8D5A2' />
                    </TouchableOpacity>
                    <Text style={{ color: '#A8D5A2', fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>Reports</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800' }}>Patron Report</Text>
                        <Text style={{ color: '#A8D5A2', fontSize: 12, marginTop: 3 }}>
                            {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={{
                            flexDirection: 'row', alignItems: 'center', gap: 6,
                            backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12,
                            paddingHorizontal: 14, paddingVertical: 9,
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
                    <Section title='Overview' badge='CHED'>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                            <MiniStat label='Total Members' value={overview?.total_members ?? 0} accent={BRAND} bg='#E2EFE0' />
                            <MiniStat label='Active' value={overview?.active_members ?? 0} accent='#16A34A' bg='#DCFCE7' />
                            <MiniStat label='Inactive' value={overview?.inactive_members ?? 0} accent='#D97706' bg='#FEF3C7' />
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                            <MiniStat label='Borrowing Now' value={overview?.active_borrowers ?? 0} accent='#0F766E' bg='#CCFBF1' />
                            <MiniStat label='Never Borrowed' value={overview?.never_borrowed ?? 0} accent='#64748B' bg='#F1F5F9' />
                            <MiniStat label='Library Staff' value={overview?.total_staff ?? 0} accent='#7C3AED' bg='#EDE9FE' />
                        </View>
                    </Section>

                    {/* By Patron Type */}
                    <Section title='By Patron Type'>
                        {byType.length === 0 ? (
                            <View style={{ paddingVertical: 16, alignItems: 'center', gap: 6 }}>
                                <Ionicons name='information-circle-outline' size={28} color='#CBD5E1' />
                                <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>
                                    No patron types assigned yet.{'\n'}Add type when registering members.
                                </Text>
                            </View>
                        ) : (
                            <View style={{ gap: 8 }}>
                                {byType.map((row) => {
                                    const c = USER_TYPE_COLOR[row.user_type] ?? { text: '#64748B', bg: '#F1F5F9' }
                                    const pct = overview ? Math.round((row.count / overview.total_members) * 100) : 0
                                    return (
                                        <View key={row.user_type} style={{ gap: 4 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                    <View style={{ backgroundColor: c.bg, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                                                        <Text style={{ fontSize: 12, fontWeight: '700', color: c.text }}>
                                                            {USER_TYPE_LABEL[row.user_type] ?? row.user_type}
                                                        </Text>
                                                    </View>
                                                    <Text style={{ fontSize: 11, color: '#64748B' }}>
                                                        {row.active} active · {row.count - row.active} inactive
                                                    </Text>
                                                </View>
                                                <Text style={{ fontSize: 14, fontWeight: '800', color: c.text }}>{row.count}</Text>
                                            </View>
                                            <View style={{ height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                                                <View style={{ width: `${pct}%`, height: '100%', backgroundColor: c.text + 'CC', borderRadius: 3 }} />
                                            </View>
                                        </View>
                                    )
                                })}
                            </View>
                        )}
                    </Section>

                    {/* By Department */}
                    <Section title='By Department / Program'>
                        {byDepartment.length === 0 ? (
                            <View style={{ paddingVertical: 16, alignItems: 'center', gap: 6 }}>
                                <Ionicons name='information-circle-outline' size={28} color='#CBD5E1' />
                                <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>
                                    No departments on record yet.{'\n'}Add department when registering members.
                                </Text>
                            </View>
                        ) : (
                            <>
                                <TableHeader cols={['Department', 'Members', 'Borrowing']} widths={['flex', 64, 72]} />
                                {byDepartment.map((row, i) => (
                                    <View
                                        key={row.department}
                                        style={{
                                            flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 9,
                                            alignItems: 'center',
                                            backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent',
                                            borderRadius: 6,
                                        }}
                                    >
                                        <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#1C2B1E' }} numberOfLines={1}>
                                            {row.department}
                                        </Text>
                                        <Text style={{ width: 64, fontSize: 12, fontWeight: '700', color: BRAND, textAlign: 'center' }}>
                                            {row.count}
                                        </Text>
                                        <View style={{ width: 72, alignItems: 'center' }}>
                                            {row.active_borrowers > 0 ? (
                                                <View style={{ backgroundColor: '#CCFBF1', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#0F766E' }}>{row.active_borrowers}</Text>
                                                </View>
                                            ) : (
                                                <Text style={{ fontSize: 11, color: '#CBD5E1' }}>—</Text>
                                            )}
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}
                    </Section>

                    {/* Monthly Registrations */}
                    <Section title='New Registrations — Last 6 Months'>
                        {registrations.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <View style={{ gap: 8 }}>
                                {registrations.map((row, i) => (
                                    <View
                                        key={row.month}
                                        style={{
                                            flexDirection: 'row', alignItems: 'center', gap: 8,
                                            backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent',
                                            borderRadius: 8, paddingHorizontal: 4, paddingVertical: 6,
                                        }}
                                    >
                                        <Text style={{ width: 64, fontSize: 11, color: '#64748B', fontWeight: '600' }}>{row.label}</Text>
                                        <View style={{ flex: 1, height: 12, backgroundColor: '#E2EFE0', borderRadius: 4, overflow: 'hidden' }}>
                                            <View style={{ width: `${Math.round((row.count / maxReg) * 100)}%`, height: '100%', backgroundColor: BRAND, borderRadius: 4 }} />
                                        </View>
                                        <Text style={{ width: 32, fontSize: 12, fontWeight: '800', color: BRAND, textAlign: 'right' }}>{row.count}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </Section>

                    {/* Monthly Attendance */}
                    <Section title='Library Attendance — Last 6 Months'>
                        {attendance.length === 0 ? (
                            <View style={{ paddingVertical: 20, alignItems: 'center', gap: 6 }}>
                                <Ionicons name='enter-outline' size={32} color='#CBD5E1' />
                                <Text style={{ fontSize: 13, color: '#94A3B8', fontWeight: '500' }}>No gate attendance data yet</Text>
                            </View>
                        ) : (
                            <View style={{ gap: 8 }}>
                                {attendance.map((row, i) => (
                                    <View
                                        key={row.month}
                                        style={{
                                            flexDirection: 'row', alignItems: 'center', gap: 8,
                                            backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent',
                                            borderRadius: 8, paddingHorizontal: 4, paddingVertical: 6,
                                        }}
                                    >
                                        <Text style={{ width: 64, fontSize: 11, color: '#64748B', fontWeight: '600' }}>{row.label}</Text>
                                        <View style={{ flex: 1, height: 12, backgroundColor: '#CCFBF1', borderRadius: 4, overflow: 'hidden' }}>
                                            <View style={{ width: `${Math.round((row.unique_visitors / maxVisit) * 100)}%`, height: '100%', backgroundColor: '#0F766E', borderRadius: 4 }} />
                                        </View>
                                        <View style={{ alignItems: 'flex-end', width: 72 }}>
                                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F766E' }}>{row.unique_visitors}</Text>
                                            <Text style={{ fontSize: 9, color: '#94A3B8' }}>{row.total_visits} visits</Text>
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
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', elevation: 2, shadowColor: BRAND, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4 }}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#1C2B1E' }}>{title}</Text>
                {badge && (
                    <View style={{ backgroundColor: '#DCFCE7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: BRAND, letterSpacing: 0.5 }}>{badge}</Text>
                    </View>
                )}
            </View>
            <View style={{ padding: 14 }}>{children}</View>
        </View>
    )
}

function TableHeader({ cols, widths }: { cols: string[]; widths: (number | 'flex')[] }) {
    return (
        <View style={{ flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 2 }}>
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
        <View style={{ borderRadius: 12, padding: 12, alignItems: 'center', minWidth: 80, backgroundColor: bg, flexGrow: 1 }}>
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
