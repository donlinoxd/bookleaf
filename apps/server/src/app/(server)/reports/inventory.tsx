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
                        <Text className='text-white text-[22px] font-extrabold'>Inventory & Audit</Text>
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
                    <Section title='Collection Summary'>
                        <View className='flex-row flex-wrap gap-[10px]'>
                            <MiniStat label='Total Titles' value={accessionRegister.length} accent={BRAND} bg='#E2EFE0' />
                            <MiniStat label='Total Copies' value={totalCopies} accent='#3A7A45' bg='#DCFCE7' />
                            <MiniStat label='Good' value={totalGood} accent={LEAF} bg='#F0FDF4' />
                            <MiniStat label='Damaged' value={totalDamaged} accent='#D97706' bg='#FEF3C7' />
                            <MiniStat label='Lost' value={totalLost} accent='#DC2626' bg='#FEE2E2' />
                        </View>
                    </Section>

                    <Section title='Last Physical Inventory Count'>
                        {latestSession ? (
                            <View className='gap-[10px]'>
                                <View className='flex-row items-center gap-2'>
                                    <Ionicons name='calendar-outline' size={16} color={BRAND} />
                                    <Text className='text-[13px] font-bold text-[#1C2B1E]'>
                                        {new Date(latestSession.session.started_at).toLocaleDateString('en-PH', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric',
                                        })}
                                    </Text>
                                </View>
                                <View className='flex-row flex-wrap gap-2'>
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
                            <View className='py-5 items-center gap-[6px]'>
                                <Ionicons name='scan-outline' size={32} color='#CBD5E1' />
                                <Text className='text-[13px] text-[#94A3B8] font-medium'>No completed inventory scan on record</Text>
                            </View>
                        )}
                    </Section>

                    <Section title='Condition by Material Type'>
                        {conditionByMaterial.length === 0 ? (
                            <EmptyRow />
                        ) : (
                            <>
                                <TableHeader cols={['Material Type', 'Good', 'Dmgd', 'Lost', 'Total']} widths={['flex', 44, 44, 44, 48]} />
                                {conditionByMaterial.map((row, i) => (
                                    <View
                                        key={row.material_type}
                                        style={{ backgroundColor: i % 2 === 1 ? '#F8FAFC' : 'transparent' }}
                                        className='flex-row px-[10px] py-[9px] items-center rounded-md'
                                    >
                                        <Text className='flex-1 text-[12px] text-[#1C2B1E] font-medium'>
                                            {MATERIAL_LABEL[row.material_type] ?? row.material_type}
                                        </Text>
                                        <Text className='w-11 text-[12px] font-bold text-[#16A34A] text-center'>
                                            {row.good}
                                        </Text>
                                        <Text
                                            style={{
                                                fontWeight: row.damaged > 0 ? '700' : '400',
                                                color: row.damaged > 0 ? '#D97706' : '#94A3B8',
                                            }}
                                            className='w-11 text-[12px] text-center'
                                        >
                                            {row.damaged}
                                        </Text>
                                        <Text
                                            style={{
                                                fontWeight: row.lost > 0 ? '700' : '400',
                                                color: row.lost > 0 ? '#DC2626' : '#94A3B8',
                                            }}
                                            className='w-11 text-[12px] text-center'
                                        >
                                            {row.lost}
                                        </Text>
                                        <Text className='w-12 text-[12px] font-bold text-brand text-center'>
                                            {row.total}
                                        </Text>
                                    </View>
                                ))}
                            </>
                        )}
                    </Section>

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
                                            style={{ backgroundColor: rowBg }}
                                            className='flex-row px-[10px] py-2 items-center rounded-md'
                                        >
                                            <Text className='w-7 text-[10px] text-[#94A3B8] font-semibold text-center'>
                                                {i + 1}
                                            </Text>
                                            <View className='flex-1 pr-[6px]'>
                                                <Text className='text-[12px] font-bold text-[#1C2B1E]' numberOfLines={1}>
                                                    {row.title}
                                                </Text>
                                                <Text className='text-[10px] text-[#7A9A7E] mt-[1px]' numberOfLines={1}>
                                                    {row.author}
                                                </Text>
                                            </View>
                                            <Text className='w-[72px] text-[10px] text-[#64748B]' numberOfLines={1}>
                                                {row.call_number ?? '—'}
                                            </Text>
                                            <Text className='w-16 text-[10px] text-[#64748B]' numberOfLines={1}>
                                                {MATERIAL_LABEL[row.material_type] ?? row.material_type}
                                            </Text>
                                            <Text className='w-8 text-[11px] font-bold text-brand text-center'>
                                                {row.total_copies}
                                            </Text>
                                            <Text className='w-7 text-[11px] font-bold text-[#16A34A] text-center'>
                                                {row.good_copies}
                                            </Text>
                                            <Text
                                                style={{
                                                    fontWeight: hasDamaged ? '700' : '400',
                                                    color: hasDamaged ? '#D97706' : '#CBD5E1',
                                                }}
                                                className='w-7 text-[11px] text-center'
                                            >
                                                {row.damaged_copies}
                                            </Text>
                                            <Text
                                                style={{
                                                    fontWeight: hasLost ? '700' : '400',
                                                    color: hasLost ? '#DC2626' : '#CBD5E1',
                                                }}
                                                className='w-7 text-[11px] text-center'
                                            >
                                                {row.lost_copies}
                                            </Text>
                                        </View>
                                    )
                                })}
                                <View className='flex-row gap-3 mt-[10px] px-1'>
                                    <View className='flex-row items-center gap-1'>
                                        <View className='w-[10px] h-[10px] rounded-[2px] bg-[#FFFBEB] border border-[#D97706]' />
                                        <Text className='text-[10px] text-[#94A3B8]'>has damaged</Text>
                                    </View>
                                    <View className='flex-row items-center gap-1'>
                                        <View className='w-[10px] h-[10px] rounded-[2px] bg-[#FFF5F5] border border-[#DC2626]' />
                                        <Text className='text-[10px] text-[#94A3B8]'>has lost</Text>
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
        <View style={{ backgroundColor: bg }} className='rounded-xl p-3 items-center min-w-[80px] grow'>
            <Text style={{ color: accent }} className='text-[22px] font-extrabold'>{value}</Text>
            <Text style={{ color: accent + 'CC' }} className='text-[10px] font-semibold text-center mt-[2px]'>{label}</Text>
        </View>
    )
}

function Chip({ label, color, bg }: { label: string; color: string; bg: string }) {
    return (
        <View style={{ backgroundColor: bg }} className='rounded-md px-[10px] py-1'>
            <Text style={{ color }} className='text-[11px] font-bold'>{label}</Text>
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
