import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import * as Print from 'expo-print'
import { useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { queryKeys } from '../../../lib/queryKeys'
import { CollectionReportService } from '../../../services/CollectionReportService'
import { useAppStore } from '../../../store/appStore'
import { buildCollectionReportHtml } from '../../../utils/collectionReportHtml'

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
                        <Text className='text-white text-[22px] font-extrabold'>Collection Report</Text>
                        <Text className='text-[#A8D5A2] text-[12px] mt-[3px]'>
                            {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </Text>
                    </View>
                    <TouchableOpacity
                        className='flex-row items-center gap-[6px] rounded-xl px-[14px] py-[9px]'
                        style={{ backgroundColor: sharing || !allReady ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.2)' }}
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
                    <Section title='Collection Overview' badge='CHED'>
                        <View className='flex-row flex-wrap gap-[10px]'>
                            <MiniStat label='Total Titles' value={overview?.total_titles ?? 0} accent={BRAND} bg='#E2EFE0' />
                            <MiniStat label='Total Copies' value={overview?.total_copies ?? 0} accent='#3A7A45' bg='#DCFCE7' />
                            <MiniStat label='Available' value={overview?.available_copies ?? 0} accent={LEAF} bg='#F0FDF4' />
                            <MiniStat label='Borrowed' value={overview?.borrowed_copies ?? 0} accent='#D97706' bg='#FEF3C7' />
                            <MiniStat label='Damaged' value={overview?.damaged_copies ?? 0} accent='#EA580C' bg='#FFF7ED' />
                            <MiniStat label='Lost' value={overview?.lost_copies ?? 0} accent='#DC2626' bg='#FEE2E2' />
                        </View>
                        <View className='mt-3 bg-mint rounded-[10px] p-3 flex-row items-center gap-[10px]'>
                            <Ionicons name='people-outline' size={20} color={BRAND} />
                            <View className='flex-1'>
                                <Text className='text-[13px] font-bold text-brand'>
                                    {overview?.copies_per_member ?? 0}:1 collection-to-student ratio
                                </Text>
                                <Text className='text-[11px] text-[#5A7A5E] mt-[2px]'>
                                    Based on {overview?.registered_members ?? 0} registered member{overview?.registered_members !== 1 ? 's' : ''}
                                </Text>
                            </View>
                        </View>
                    </Section>

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

                    <Section title='Copy Condition'>
                        {condition.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <View className='flex-row gap-[10px]'>
                                {condition.map((row) => {
                                    const c = CONDITION_COLOR[row.condition] ?? { text: '#64748B', bg: '#F1F5F9' }
                                    return (
                                        <View
                                            key={row.condition}
                                            style={{ backgroundColor: c.bg }}
                                            className='flex-1 rounded-xl p-[14px] items-center'
                                        >
                                            <Text style={{ color: c.text }} className='text-[22px] font-extrabold'>{row.copies}</Text>
                                            <Text
                                                style={{ color: c.text }}
                                                className='text-[11px] font-bold mt-[3px] capitalize'
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
            style={{ backgroundColor: even ? '#F8FAFC' : 'transparent' }}
            className='flex-row px-[10px] py-[9px] rounded-md'
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
            style={{ backgroundColor: bg }}
            className='rounded-xl p-3 items-center min-w-[90px] grow'
        >
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
