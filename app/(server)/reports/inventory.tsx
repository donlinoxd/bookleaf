import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import * as Print from 'expo-print'
import { useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { queryKeys } from '../../../src/lib/queryKeys'
import { InventoryAuditService } from '../../../src/services/InventoryAuditService'
import { useAppStore } from '../../../src/store/appStore'
import { buildInventoryAuditHtml } from '../../../src/utils/inventoryAuditHtml'

const BRAND = '#2A5C33'
const LEAF = '#5CB85C'

const MATERIAL_LABEL: Record<string, string> = {
    BOOK: 'Book',
    THESIS: 'Thesis / Dissertation',
    SERIAL: 'Serial / Journal',
    ARTICLE: 'Article',
    AUDIOVISUAL: 'Audiovisual',
    MAP: 'Map',
    MANUSCRIPT: 'Manuscript',
    DIGITAL: 'Digital Resource',
    OTHER: 'Other',
}

export default function InventoryReportScreen() {
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const { institution, settings } = useAppStore()
    const institutionId = institution?.id ?? 0
    const [sharing, setSharing] = useState(false)

    const { data: latestSession, isLoading: l1 } = useQuery({
        queryKey: queryKeys.inventoryLatestSession(institutionId),
        queryFn: () => InventoryAuditService.getLatestSessionSummary(institutionId),
        enabled: !!institutionId,
    })

    const { data: accessionRegister = [], isLoading: l2 } = useQuery({
        queryKey: queryKeys.inventoryAccessionRegister(institutionId),
        queryFn: () => InventoryAuditService.getAccessionRegister(institutionId),
        enabled: !!institutionId,
    })

    const { data: conditionByMaterial = [], isLoading: l3 } = useQuery({
        queryKey: queryKeys.inventoryConditionByMaterial(institutionId),
        queryFn: () => InventoryAuditService.getConditionByMaterial(institutionId),
        enabled: !!institutionId,
    })

    const isLoading = l1 || l2 || l3
    const allReady = !isLoading

    const totalCopies = accessionRegister.reduce((s, r) => s + r.total_copies, 0)
    const totalGood = accessionRegister.reduce((s, r) => s + r.good_copies, 0)
    const totalDamaged = accessionRegister.reduce((s, r) => s + r.damaged_copies, 0)
    const totalLost = accessionRegister.reduce((s, r) => s + r.lost_copies, 0)

    const handleSharePdf = async () => {
        if (!allReady) return
        setSharing(true)
        try {
            const html = buildInventoryAuditHtml({
                institutionName: settings?.institution_name ?? institution?.name ?? 'Library',
                accessionRegister,
                conditionByMaterial,
                latestSession: latestSession ?? null,
            })
            const { uri } = await Print.printToFileAsync({ html, base64: false })
            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: 'Share Inventory & Audit Report',
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
                        <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800' }}>Inventory & Audit</Text>
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
                    {/* Collection Summary */}
                    <Section title='Collection Summary'>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                            <MiniStat label='Total Titles' value={accessionRegister.length} accent={BRAND} bg='#E2EFE0' />
                            <MiniStat label='Total Copies' value={totalCopies} accent='#3A7A45' bg='#DCFCE7' />
                            <MiniStat label='Good' value={totalGood} accent={LEAF} bg='#F0FDF4' />
                            <MiniStat label='Damaged' value={totalDamaged} accent='#D97706' bg='#FEF3C7' />
                            <MiniStat label='Lost' value={totalLost} accent='#DC2626' bg='#FEE2E2' />
                        </View>
                    </Section>

                    {/* Last Physical Count */}
                    <Section title='Last Physical Inventory Count'>
                        {latestSession ? (
                            <View style={{ gap: 10 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Ionicons name='calendar-outline' size={16} color={BRAND} />
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1C2B1E' }}>
                                        {new Date(latestSession.session.started_at).toLocaleDateString('en-PH', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric',
                                        })}
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                    <Chip label={`${latestSession.total_scanned} scanned`} color={BRAND} bg='#E2EFE0' />
                                    <Chip label={`${latestSession.unique_isbns} unique ISBNs`} color='#3A7A45' bg='#DCFCE7' />
                                    {latestSession.ghost_count > 0 && (
                                        <Chip label={`${latestSession.ghost_count} ghost copies`} color='#D97706' bg='#FEF3C7' />
                                    )}
                                    {latestSession.phantom_count > 0 && (
                                        <Chip label={`${latestSession.phantom_count} phantom returns`} color='#D97706' bg='#FEF3C7' />
                                    )}
                                    {latestSession.unknown_count > 0 && (
                                        <Chip label={`${latestSession.unknown_count} unknown ISBNs`} color='#D97706' bg='#FEF3C7' />
                                    )}
                                    {latestSession.ghost_count === 0 &&
                                        latestSession.phantom_count === 0 &&
                                        latestSession.unknown_count === 0 && (
                                            <Chip label='No discrepancies' color='#16A34A' bg='#DCFCE7' />
                                        )}
                                </View>
                            </View>
                        ) : (
                            <View style={{ paddingVertical: 20, alignItems: 'center', gap: 6 }}>
                                <Ionicons name='scan-outline' size={32} color='#CBD5E1' />
                                <Text style={{ fontSize: 13, color: '#94A3B8', fontWeight: '500' }}>No completed inventory scan on record</Text>
                            </View>
                        )}
                    </Section>

                    {/* Condition by Material Type */}
                    <Section title='Condition by Material Type'>
                        {conditionByMaterial.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <>
                                <TableHeader cols={['Material Type', 'Good', 'Dmgd', 'Lost', 'Total']} widths={['flex', 44, 44, 44, 48]} />
                                {conditionByMaterial.map((row, i) => (
                                    <View
                                        key={row.material_type}
                                        style={{
                                            flexDirection: 'row',
                                            paddingHorizontal: 10,
                                            paddingVertical: 9,
                                            alignItems: 'center',
                                            backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent',
                                            borderRadius: 6,
                                        }}
                                    >
                                        <Text style={{ flex: 1, fontSize: 12, color: '#1C2B1E', fontWeight: '500' }}>
                                            {MATERIAL_LABEL[row.material_type] ?? row.material_type}
                                        </Text>
                                        <Text style={{ width: 44, fontSize: 12, fontWeight: '700', color: '#16A34A', textAlign: 'center' }}>
                                            {row.good}
                                        </Text>
                                        <Text
                                            style={{
                                                width: 44,
                                                fontSize: 12,
                                                fontWeight: row.damaged > 0 ? '700' : '400',
                                                color: row.damaged > 0 ? '#D97706' : '#94A3B8',
                                                textAlign: 'center',
                                            }}
                                        >
                                            {row.damaged}
                                        </Text>
                                        <Text
                                            style={{
                                                width: 44,
                                                fontSize: 12,
                                                fontWeight: row.lost > 0 ? '700' : '400',
                                                color: row.lost > 0 ? '#DC2626' : '#94A3B8',
                                                textAlign: 'center',
                                            }}
                                        >
                                            {row.lost}
                                        </Text>
                                        <Text style={{ width: 48, fontSize: 12, fontWeight: '700', color: BRAND, textAlign: 'center' }}>
                                            {row.total}
                                        </Text>
                                    </View>
                                ))}
                            </>
                        )}
                    </Section>

                    {/* Accession Register */}
                    <Section title={`Accession Register (${accessionRegister.length} titles)`}>
                        {accessionRegister.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <>
                                <TableHeader
                                    cols={['#', 'Title / Author', 'Call No.', 'Type', 'Cps', 'G', 'D', 'L']}
                                    widths={[28, 'flex', 72, 64, 32, 28, 28, 28]}
                                />
                                {accessionRegister.map((row, i) => {
                                    const hasDamaged = row.damaged_copies > 0
                                    const hasLost = row.lost_copies > 0
                                    const rowBg = hasLost
                                        ? '#FFF5F5'
                                        : hasDamaged
                                          ? '#FFFBEB'
                                          : i % 2 === 1
                                            ? '#F8FAFC'
                                            : 'transparent'
                                    return (
                                        <View
                                            key={row.id}
                                            style={{
                                                flexDirection: 'row',
                                                paddingHorizontal: 10,
                                                paddingVertical: 8,
                                                alignItems: 'center',
                                                backgroundColor: rowBg,
                                                borderRadius: 6,
                                            }}
                                        >
                                            <Text style={{ width: 28, fontSize: 10, color: '#94A3B8', fontWeight: '600', textAlign: 'center' }}>
                                                {i + 1}
                                            </Text>
                                            <View style={{ flex: 1, paddingRight: 6 }}>
                                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1C2B1E' }} numberOfLines={1}>
                                                    {row.title}
                                                </Text>
                                                <Text style={{ fontSize: 10, color: '#7A9A7E', marginTop: 1 }} numberOfLines={1}>
                                                    {row.author}
                                                </Text>
                                            </View>
                                            <Text style={{ width: 72, fontSize: 10, color: '#64748B' }} numberOfLines={1}>
                                                {row.call_number ?? '—'}
                                            </Text>
                                            <Text style={{ width: 64, fontSize: 10, color: '#64748B' }} numberOfLines={1}>
                                                {MATERIAL_LABEL[row.material_type] ?? row.material_type}
                                            </Text>
                                            <Text style={{ width: 32, fontSize: 11, fontWeight: '700', color: BRAND, textAlign: 'center' }}>
                                                {row.total_copies}
                                            </Text>
                                            <Text style={{ width: 28, fontSize: 11, fontWeight: '700', color: '#16A34A', textAlign: 'center' }}>
                                                {row.good_copies}
                                            </Text>
                                            <Text
                                                style={{
                                                    width: 28,
                                                    fontSize: 11,
                                                    fontWeight: hasDamaged ? '700' : '400',
                                                    color: hasDamaged ? '#D97706' : '#CBD5E1',
                                                    textAlign: 'center',
                                                }}
                                            >
                                                {row.damaged_copies}
                                            </Text>
                                            <Text
                                                style={{
                                                    width: 28,
                                                    fontSize: 11,
                                                    fontWeight: hasLost ? '700' : '400',
                                                    color: hasLost ? '#DC2626' : '#CBD5E1',
                                                    textAlign: 'center',
                                                }}
                                            >
                                                {row.lost_copies}
                                            </Text>
                                        </View>
                                    )
                                })}
                                <View style={{ flexDirection: 'row', gap: 12, marginTop: 10, paddingHorizontal: 4 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#D97706' }} />
                                        <Text style={{ fontSize: 10, color: '#94A3B8' }}>has damaged</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#DC2626' }} />
                                        <Text style={{ fontSize: 10, color: '#94A3B8' }}>has lost</Text>
                                    </View>
                                </View>
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
                        fontSize: 9,
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
        <View style={{ borderRadius: 12, padding: 12, alignItems: 'center', minWidth: 80, backgroundColor: bg, flexGrow: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: accent }}>{value}</Text>
            <Text style={{ fontSize: 10, fontWeight: '600', color: accent + 'CC', textAlign: 'center', marginTop: 2 }}>{label}</Text>
        </View>
    )
}

function Chip({ label, color, bg }: { label: string; color: string; bg: string }) {
    return (
        <View style={{ backgroundColor: bg, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color }}>{label}</Text>
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
