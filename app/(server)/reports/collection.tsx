import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import * as Print from 'expo-print'
import { useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { queryKeys } from '../../../src/lib/queryKeys'
import { CollectionReportService } from '../../../src/services/CollectionReportService'
import { useAppStore } from '../../../src/store/appStore'
import { buildCollectionReportHtml } from '../../../src/utils/collectionReportHtml'

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

const CONDITION_COLOR: Record<string, { text: string; bg: string }> = {
    good: { text: '#16A34A', bg: '#DCFCE7' },
    damaged: { text: '#D97706', bg: '#FEF3C7' },
    lost: { text: '#DC2626', bg: '#FEE2E2' },
}

export default function CollectionReportScreen() {
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const { institution, settings } = useAppStore()
    const institutionId = institution?.id ?? 0
    const [sharing, setSharing] = useState(false)

    const { data: overview, isLoading: loadingOverview } = useQuery({
        queryKey: queryKeys.collectionOverview(institutionId),
        queryFn: () => CollectionReportService.getOverview(institutionId),
        enabled: !!institutionId,
    })

    const { data: byMaterialType = [], isLoading: loadingMaterial } = useQuery({
        queryKey: queryKeys.collectionByMaterialType(institutionId),
        queryFn: () => CollectionReportService.getByMaterialType(institutionId),
        enabled: !!institutionId,
    })

    const { data: byYear = [], isLoading: loadingYear } = useQuery({
        queryKey: queryKeys.collectionByYear(institutionId),
        queryFn: () => CollectionReportService.getByPublicationYear(institutionId),
        enabled: !!institutionId,
    })

    const { data: condition = [], isLoading: loadingCondition } = useQuery({
        queryKey: queryKeys.collectionCondition(institutionId),
        queryFn: () => CollectionReportService.getConditionSummary(institutionId),
        enabled: !!institutionId,
    })

    const isLoading = loadingOverview || loadingMaterial || loadingYear || loadingCondition
    const allReady = overview && byMaterialType.length >= 0 && byYear.length >= 0 && condition.length >= 0

    const handleSharePdf = async () => {
        if (!allReady || !overview) return
        setSharing(true)
        try {
            const html = buildCollectionReportHtml({
                institutionName: settings?.institution_name ?? institution?.name ?? 'Library',
                overview,
                byMaterialType,
                byYear,
                condition,
            })
            const { uri } = await Print.printToFileAsync({ html, base64: false })
            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: 'Share Collection Report',
                UTI: 'com.adobe.pdf',
            })
        } catch (e) {
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
                        <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800' }}>Collection Report</Text>
                        <Text style={{ color: '#A8D5A2', fontSize: 12, marginTop: 3 }}>
                            {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            backgroundColor: sharing || !allReady ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.2)',
                            borderRadius: 12,
                            paddingHorizontal: 14,
                            paddingVertical: 9,
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
                    <Section title='Collection Overview' badge='CHED'>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                            <MiniStat label='Total Titles' value={overview?.total_titles ?? 0} accent={BRAND} bg='#E2EFE0' />
                            <MiniStat label='Total Copies' value={overview?.total_copies ?? 0} accent='#3A7A45' bg='#DCFCE7' />
                            <MiniStat label='Available' value={overview?.available_copies ?? 0} accent={LEAF} bg='#F0FDF4' />
                            <MiniStat label='Borrowed' value={overview?.borrowed_copies ?? 0} accent='#D97706' bg='#FEF3C7' />
                            <MiniStat label='Damaged' value={overview?.damaged_copies ?? 0} accent='#EA580C' bg='#FFF7ED' />
                            <MiniStat label='Lost' value={overview?.lost_copies ?? 0} accent='#DC2626' bg='#FEE2E2' />
                        </View>
                        <View
                            style={{
                                marginTop: 12,
                                backgroundColor: '#E2EFE0',
                                borderRadius: 10,
                                padding: 12,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 10,
                            }}
                        >
                            <Ionicons name='people-outline' size={20} color={BRAND} />
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND }}>
                                    {overview?.copies_per_member ?? 0}:1 collection-to-student ratio
                                </Text>
                                <Text style={{ fontSize: 11, color: '#5A7A5E', marginTop: 2 }}>
                                    Based on {overview?.registered_members ?? 0} registered member{overview?.registered_members !== 1 ? 's' : ''}
                                </Text>
                            </View>
                        </View>
                    </Section>

                    {/* By Material Type */}
                    <Section title='By Material Type'>
                        {byMaterialType.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <>
                                <TableHeader cols={['Material Type', 'Titles', 'Copies']} widths={['flex', 60, 60]} />
                                {byMaterialType.map((row, i) => (
                                    <TableRow
                                        key={row.material_type}
                                        cols={[MATERIAL_LABEL[row.material_type] ?? row.material_type, String(row.titles), String(row.copies)]}
                                        widths={['flex', 60, 60]}
                                        even={i % 2 === 1}
                                    />
                                ))}
                            </>
                        )}
                    </Section>

                    {/* By Publication Year */}
                    <Section title='By Publication Year'>
                        {byYear.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <>
                                <TableHeader cols={['Period', 'Titles', 'Copies']} widths={['flex', 60, 60]} />
                                {byYear.map((row, i) => (
                                    <TableRow
                                        key={row.bucket}
                                        cols={[row.bucket, String(row.titles), String(row.copies)]}
                                        widths={['flex', 60, 60]}
                                        even={i % 2 === 1}
                                    />
                                ))}
                            </>
                        )}
                    </Section>

                    {/* Condition Summary */}
                    <Section title='Copy Condition'>
                        {condition.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                {condition.map((row) => {
                                    const c = CONDITION_COLOR[row.condition] ?? { text: '#64748B', bg: '#F1F5F9' }
                                    return (
                                        <View
                                            key={row.condition}
                                            style={{
                                                flex: 1,
                                                borderRadius: 12,
                                                padding: 14,
                                                alignItems: 'center',
                                                backgroundColor: c.bg,
                                            }}
                                        >
                                            <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>{row.copies}</Text>
                                            <Text
                                                style={{ fontSize: 11, fontWeight: '700', color: c.text, marginTop: 3, textTransform: 'capitalize' }}
                                            >
                                                {row.condition}
                                            </Text>
                                        </View>
                                    )
                                })}
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
            <View
                style={{
                    paddingHorizontal: 16,
                    paddingVertical: 13,
                    borderBottomWidth: 1,
                    borderBottomColor: '#F1F5F9',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                }}
            >
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
                        textAlign: widths[i] !== 'flex' ? 'right' : 'left',
                    }}
                >
                    {col}
                </Text>
            ))}
        </View>
    )
}

function TableRow({ cols, widths, even }: { cols: string[]; widths: (number | 'flex')[]; even: boolean }) {
    return (
        <View
            style={{
                flexDirection: 'row',
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: even ? '#F8FAFC' : 'transparent',
                borderRadius: 6,
            }}
        >
            {cols.map((col, i) => (
                <Text
                    key={i}
                    style={{
                        flex: widths[i] === 'flex' ? 1 : undefined,
                        width: widths[i] !== 'flex' ? widths[i] : undefined,
                        fontSize: 12,
                        color: i === 0 ? '#1C2B1E' : '#3A7A45',
                        fontWeight: i === 0 ? '500' : '700',
                        textAlign: widths[i] !== 'flex' ? 'right' : 'left',
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
        <View
            style={{
                borderRadius: 12,
                padding: 12,
                alignItems: 'center',
                minWidth: 90,
                backgroundColor: bg,
                flexGrow: 1,
            }}
        >
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
