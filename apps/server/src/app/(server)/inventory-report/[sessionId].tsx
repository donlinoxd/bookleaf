import { Ionicons } from '@expo/vector-icons'
import * as Print from 'expo-print'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { InventoryService } from '../../../src/services/InventoryService'
import { useAppStore } from '../../../src/store/appStore'
import { DiscrepancyReport, ExtraCopy, GhostCopy, PhantomReturn, UnknownScan } from '@bookleaf/types'

const BRAND = '#2A5C33'
const LEAF = '#5CB85C'

export default function InventoryReportScreen() {
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
    const institution = useAppStore((s) => s.institution)
    const settings = useAppStore((s) => s.settings)

    const [report, setReport] = useState<DiscrepancyReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [exporting, setExporting] = useState(false)

    useEffect(() => {
        if (!sessionId || !institution) return
        InventoryService.getDiscrepancyReport(Number(sessionId), institution.id)
            .then(setReport)
            .finally(() => setLoading(false))
    }, [sessionId, institution])

    const handleExportPDF = async () => {
        if (!report) return
        setExporting(true)
        try {
            const html = buildReportHtml(report, settings?.institution_name ?? 'Library')
            const { uri } = await Print.printToFileAsync({ html, base64: false })
            const canShare = await Sharing.isAvailableAsync()
            if (canShare) {
                await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' })
            } else {
                Alert.alert('Exported', `PDF saved to: ${uri}`)
            }
        } catch (e: any) {
            Alert.alert('Export Failed', e.message)
        } finally {
            setExporting(false)
        }
    }

    if (loading) {
        return (
            <View className='flex-1 bg-[#F4F9F4] items-center justify-center'>
                <ActivityIndicator size='large' color={LEAF} />
            </View>
        )
    }

    if (!report) {
        return (
            <View className='flex-1 bg-[#F4F9F4] items-center justify-center px-8'>
                <Text className='text-base text-[#7A9A7E]'>Report not found.</Text>
                <TouchableOpacity className='mt-4' onPress={() => router.back()}>
                    <Text className='text-[#5CB85C] font-bold'>Go Back</Text>
                </TouchableOpacity>
            </View>
        )
    }

    const totalDiscrepancies = report.ghost_copies.length + report.phantom_returns.length + report.unknown_scans.length + report.extra_copies.length

    return (
        <View className='flex-1 bg-[#F4F9F4]'>
            <StatusBar barStyle='light-content' backgroundColor={BRAND} />

            {/* Header */}
            <View className='bg-brand px-5 pb-5' style={{ paddingTop: insets.top + 12 }}>
                <View className='flex-row items-center gap-3 mb-3'>
                    <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
                        <Ionicons name='arrow-back' size={22} color='#A8D5A2' />
                    </TouchableOpacity>
                    <View className='flex-1'>
                        <Text className='text-[#A8D5A2] text-[10px] font-semibold tracking-[1.2px] uppercase'>Inventory Report</Text>
                        <Text className='text-white text-base font-extrabold'>
                            {new Date(report.started_at).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
                        </Text>
                    </View>
                    <TouchableOpacity
                        className='rounded-[10px] px-[14px] py-2 flex-row items-center gap-[6px]'
                        style={{ backgroundColor: exporting ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.15)' }}
                        onPress={handleExportPDF}
                        disabled={exporting}
                    >
                        {exporting ? (
                            <ActivityIndicator size='small' color='#FFFFFF' />
                        ) : (
                            <>
                                <Ionicons name='download-outline' size={16} color='#FFFFFF' />
                                <Text className='text-white font-bold text-[13px]'>PDF</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Summary chips */}
                <View className='flex-row gap-2'>
                    <SummaryChip value={report.total_scanned} label='Scanned' color='#A8D5A2' />
                    <SummaryChip value={report.unique_isbns_scanned} label='Unique ISBNs' color='#A8D5A2' />
                    <SummaryChip value={totalDiscrepancies} label='Issues' color={totalDiscrepancies > 0 ? '#FCA5A5' : '#A8D5A2'} />
                </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}>
                {totalDiscrepancies === 0 && (
                    <View className='bg-[#DCFCE7] rounded-2xl p-5 items-center gap-2'>
                        <Ionicons name='checkmark-circle' size={40} color={LEAF} />
                        <Text className='text-base font-extrabold text-brand'>All Clear!</Text>
                        <Text className='text-[13px] text-[#5A7A5E] text-center'>
                            No discrepancies found. The physical inventory matches the catalog.
                        </Text>
                    </View>
                )}

                {/* Ghost Copies */}
                <Section
                    title='Ghost Copies'
                    count={report.ghost_copies.length}
                    icon='search-circle-outline'
                    color='#DC2626'
                    bg='#FEE2E2'
                    description='Available in catalog but not found on shelves'
                    emptyLabel='No ghost copies found'
                >
                    {report.ghost_copies.map((item) => (
                        <GhostRow key={item.resource_id} item={item} />
                    ))}
                </Section>

                {/* Phantom Returns */}
                <Section
                    title='Phantom Returns'
                    count={report.phantom_returns.length}
                    icon='return-down-back-outline'
                    color='#D97706'
                    bg='#FEF3C7'
                    description='Found on shelves but marked as borrowed — not checked in'
                    emptyLabel='No phantom returns found'
                >
                    {report.phantom_returns.map((item) => (
                        <PhantomRow key={item.resource_id} item={item} />
                    ))}
                </Section>

                {/* Unknown Scans */}
                <Section
                    title='Unknown Scans'
                    count={report.unknown_scans.length}
                    icon='help-circle-outline'
                    color='#7C3AED'
                    bg='#EDE9FE'
                    description='Scanned ISBNs not found in the catalog'
                    emptyLabel='No unknown scans'
                >
                    {report.unknown_scans.map((item) => (
                        <UnknownRow key={item.isbn} item={item} />
                    ))}
                </Section>

                {/* Extra Copies */}
                <Section
                    title='Extra Copies'
                    count={report.extra_copies.length}
                    icon='copy-outline'
                    color='#0369A1'
                    bg='#E0F2FE'
                    description='Scanned more copies than the catalog records — duplicate scan or unregistered copy'
                    emptyLabel='No extra copies found'
                >
                    {report.extra_copies.map((item) => (
                        <ExtraRow key={item.resource_id} item={item} />
                    ))}
                </Section>
            </ScrollView>
        </View>
    )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SummaryChip({ value, label, color }: { value: number; label: string; color: string }) {
    return (
        <View className='flex-1 bg-white/10 rounded-[10px] p-2 items-center'>
            <Text className='text-[18px] font-extrabold' style={{ color }}>
                {value}
            </Text>
            <Text className='text-[9px] font-semibold text-center text-white/65'>{label}</Text>
        </View>
    )
}

function Section({
    title,
    count,
    icon,
    color,
    bg,
    description,
    emptyLabel,
    children,
}: {
    title: string
    count: number
    icon: string
    color: string
    bg: string
    description: string
    emptyLabel: string
    children: React.ReactNode
}) {
    return (
        <View
            className='bg-white rounded-2xl overflow-hidden'
            style={{
                elevation: 1,
                shadowColor: '#2A5C33',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 3,
            }}
        >
            {/* Section header */}
            <View
                className='p-[14px] flex-row items-center gap-[10px]'
                style={{ borderBottomWidth: count > 0 ? 1 : 0, borderBottomColor: '#F1F5F9' }}
            >
                <View className='w-9 h-9 rounded-[18px] items-center justify-center' style={{ backgroundColor: bg }}>
                    <Ionicons name={icon as any} size={18} color={color} />
                </View>
                <View className='flex-1'>
                    <View className='flex-row items-center gap-2'>
                        <Text className='text-[14px] font-extrabold text-[#1C2B1E]'>{title}</Text>
                        <View className='rounded-[10px] px-[7px] py-[2px]' style={{ backgroundColor: count > 0 ? bg : '#F1F5F9' }}>
                            <Text className='text-[11px] font-bold' style={{ color: count > 0 ? color : '#94A3B8' }}>
                                {count}
                            </Text>
                        </View>
                    </View>
                    <Text className='text-[11px] text-[#7A9A7E] mt-[1px]'>{description}</Text>
                </View>
            </View>

            {count === 0 ? (
                <View className='py-4 items-center'>
                    <Text className='text-[12px] text-[#94A3B8]'>{emptyLabel}</Text>
                </View>
            ) : (
                <View>{children}</View>
            )}
        </View>
    )
}

function GhostRow({ item }: { item: GhostCopy }) {
    return (
        <View className='px-[14px] py-3 border-b border-[#F8FAFC]'>
            <View className='flex-row items-start gap-2'>
                <View className='flex-1'>
                    <Text className='text-[13px] font-bold text-[#1C2B1E]' numberOfLines={2}>
                        {item.title}
                    </Text>
                    <Text className='text-[11px] text-[#7A9A7E] mt-[2px]'>{item.author}</Text>
                    <View className='flex-row gap-2 mt-1'>
                        {item.call_number && <Text className='text-[10px] text-[#94A3B8]'>#{item.call_number}</Text>}
                        <Text className='text-[10px] text-[#94A3B8]'>ISBN {item.isbn}</Text>
                    </View>
                </View>
                <View className='items-end gap-1'>
                    <View className='bg-[#FEE2E2] rounded-lg px-2 py-1'>
                        <Text className='text-[12px] font-extrabold text-[#DC2626]'>-{item.missing_count} missing</Text>
                    </View>
                    <Text className='text-[10px] text-[#94A3B8]'>
                        {item.scan_count}/{item.db_available} found
                    </Text>
                </View>
            </View>
        </View>
    )
}

function PhantomRow({ item }: { item: PhantomReturn }) {
    return (
        <View className='px-[14px] py-3 border-b border-[#F8FAFC]'>
            <View className='flex-row items-start gap-2'>
                <View className='flex-1'>
                    <Text className='text-[13px] font-bold text-[#1C2B1E]' numberOfLines={2}>
                        {item.title}
                    </Text>
                    <Text className='text-[11px] text-[#7A9A7E] mt-[2px]'>{item.author}</Text>
                    <View className='flex-row gap-2 mt-1'>
                        {item.call_number && <Text className='text-[10px] text-[#94A3B8]'>#{item.call_number}</Text>}
                        <Text className='text-[10px] text-[#94A3B8]'>ISBN {item.isbn}</Text>
                    </View>
                </View>
                <View className='items-end gap-1'>
                    <View className='bg-[#FEF3C7] rounded-lg px-2 py-1'>
                        <Text className='text-[12px] font-extrabold text-[#D97706]'>{item.phantom_count} unreturned</Text>
                    </View>
                    <Text className='text-[10px] text-[#94A3B8]'>
                        {item.scan_count} found, {item.db_available} expected
                    </Text>
                </View>
            </View>
        </View>
    )
}

function UnknownRow({ item }: { item: UnknownScan }) {
    return (
        <View className='px-[14px] py-3 border-b border-[#F8FAFC] flex-row items-center'>
            <View className='flex-1'>
                <Text className='text-[13px] font-bold text-[#1C2B1E]'>ISBN {item.isbn}</Text>
                <Text className='text-[11px] text-[#7A9A7E] mt-[1px]'>Not in catalog</Text>
            </View>
            <View className='bg-[#EDE9FE] rounded-lg px-2 py-1'>
                <Text className='text-[12px] font-extrabold text-[#7C3AED]'>{item.scan_count}×</Text>
            </View>
        </View>
    )
}

function ExtraRow({ item }: { item: ExtraCopy }) {
    return (
        <View className='px-[14px] py-3 border-b border-[#F8FAFC]'>
            <View className='flex-row items-start gap-2'>
                <View className='flex-1'>
                    <Text className='text-[13px] font-bold text-[#1C2B1E]' numberOfLines={2}>
                        {item.title}
                    </Text>
                    <Text className='text-[11px] text-[#7A9A7E] mt-[2px]'>{item.author}</Text>
                    <View className='flex-row gap-2 mt-1'>
                        {item.call_number && <Text className='text-[10px] text-[#94A3B8]'>#{item.call_number}</Text>}
                        <Text className='text-[10px] text-[#94A3B8]'>ISBN {item.isbn}</Text>
                    </View>
                </View>
                <View className='items-end gap-1'>
                    <View className='bg-[#E0F2FE] rounded-lg px-2 py-1'>
                        <Text className='text-[12px] font-extrabold text-[#0369A1]'>+{item.extra_count} extra</Text>
                    </View>
                    <Text className='text-[10px] text-[#94A3B8]'>
                        {item.scan_count} scanned, {item.total_copies} in catalog
                    </Text>
                </View>
            </View>
        </View>
    )
}

// ── PDF builder ────────────────────────────────────────────────────────────────

function buildReportHtml(report: DiscrepancyReport, institutionName: string): string {
    const dateStr = new Date(report.started_at).toLocaleDateString([], {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    })
    const timeRange = `${new Date(report.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(report.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

    const ghostRows = report.ghost_copies
        .map(
            (i) =>
                `<tr><td>${i.title}</td><td>${i.author}</td><td>${i.isbn}</td><td>${i.call_number ?? '—'}</td><td>${i.db_available}</td><td>${i.scan_count}</td><td class="badge ghost">${i.missing_count} missing</td></tr>`
        )
        .join('')

    const phantomRows = report.phantom_returns
        .map(
            (i) =>
                `<tr><td>${i.title}</td><td>${i.author}</td><td>${i.isbn}</td><td>${i.call_number ?? '—'}</td><td>${i.db_available}</td><td>${i.scan_count}</td><td class="badge phantom">${i.phantom_count} unreturned</td></tr>`
        )
        .join('')

    const unknownRows = report.unknown_scans
        .map((i) => `<tr><td colspan="6">${i.isbn}</td><td class="badge unknown">${i.scan_count}×</td></tr>`)
        .join('')

    const extraRows = report.extra_copies
        .map(
            (i) =>
                `<tr><td>${i.title}</td><td>${i.author}</td><td>${i.isbn}</td><td>${i.call_number ?? '—'}</td><td>${i.total_copies}</td><td>${i.scan_count}</td><td class="badge extra">+${i.extra_count} extra</td></tr>`
        )
        .join('')

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: 'Helvetica Neue', sans-serif; color: #1C2B1E; margin: 0; padding: 32px; }
  .header { background: #2A5C33; color: white; padding: 24px 32px; margin: -32px -32px 32px; }
  .header h1 { margin: 0 0 4px; font-size: 22px; }
  .header p { margin: 0; opacity: 0.7; font-size: 13px; }
  .summary { display: flex; gap: 16px; margin-bottom: 32px; }
  .chip { flex: 1; background: #F4F9F4; border-radius: 10px; padding: 12px; text-align: center; }
  .chip .val { font-size: 24px; font-weight: 800; color: #2A5C33; }
  .chip .lbl { font-size: 10px; color: #7A9A7E; text-transform: uppercase; letter-spacing: 0.5px; }
  .section { margin-bottom: 28px; }
  .section h2 { font-size: 15px; font-weight: 800; margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
  .section h2 .cnt { font-size: 12px; font-weight: 700; border-radius: 8px; padding: 2px 8px; }
  .ghost-cnt { background: #FEE2E2; color: #DC2626; }
  .phantom-cnt { background: #FEF3C7; color: #D97706; }
  .unknown-cnt { background: #EDE9FE; color: #7C3AED; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #F8FAFC; text-align: left; padding: 8px 10px; font-weight: 700; color: #5A7A5E; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 8px 10px; border-bottom: 1px solid #F1F5F9; }
  .badge { font-weight: 700; border-radius: 6px; padding: 3px 8px; font-size: 11px; white-space: nowrap; }
  .ghost { background: #FEE2E2; color: #DC2626; }
  .phantom { background: #FEF3C7; color: #D97706; }
  .unknown { background: #EDE9FE; color: #7C3AED; }
  .extra { background: #E0F2FE; color: #0369A1; }
  .extra-cnt { background: #E0F2FE; color: #0369A1; }
  .empty { color: #94A3B8; font-style: italic; font-size: 12px; padding: 12px 0; }
  .footer { margin-top: 40px; font-size: 10px; color: #94A3B8; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <h1>${institutionName} — Inventory Report</h1>
    <p>${dateStr} &nbsp;·&nbsp; ${timeRange}</p>
  </div>

  <div class="summary">
    <div class="chip"><div class="val">${report.total_scanned}</div><div class="lbl">Total Scanned</div></div>
    <div class="chip"><div class="val">${report.unique_isbns_scanned}</div><div class="lbl">Unique ISBNs</div></div>
    <div class="chip"><div class="val">${report.ghost_copies.length}</div><div class="lbl">Ghost Copies</div></div>
    <div class="chip"><div class="val">${report.phantom_returns.length}</div><div class="lbl">Phantom Returns</div></div>
    <div class="chip"><div class="val">${report.unknown_scans.length}</div><div class="lbl">Unknown ISBNs</div></div>
    <div class="chip"><div class="val">${report.extra_copies.length}</div><div class="lbl">Extra Copies</div></div>
  </div>

  <div class="section">
    <h2>Ghost Copies <span class="cnt ghost-cnt">${report.ghost_copies.length}</span></h2>
    ${
        report.ghost_copies.length === 0
            ? '<p class="empty">No ghost copies found.</p>'
            : `<table><thead><tr><th>Title</th><th>Author</th><th>ISBN</th><th>Call #</th><th>DB Avail.</th><th>Scanned</th><th>Status</th></tr></thead><tbody>${ghostRows}</tbody></table>`
    }
  </div>

  <div class="section">
    <h2>Phantom Returns <span class="cnt phantom-cnt">${report.phantom_returns.length}</span></h2>
    ${
        report.phantom_returns.length === 0
            ? '<p class="empty">No phantom returns found.</p>'
            : `<table><thead><tr><th>Title</th><th>Author</th><th>ISBN</th><th>Call #</th><th>DB Avail.</th><th>Scanned</th><th>Status</th></tr></thead><tbody>${phantomRows}</tbody></table>`
    }
  </div>

  <div class="section">
    <h2>Unknown Scans <span class="cnt unknown-cnt">${report.unknown_scans.length}</span></h2>
    ${
        report.unknown_scans.length === 0
            ? '<p class="empty">No unknown scans.</p>'
            : `<table><thead><tr><th colspan="6">ISBN</th><th>Times Scanned</th></tr></thead><tbody>${unknownRows}</tbody></table>`
    }
  </div>

  <div class="section">
    <h2>Extra Copies <span class="cnt extra-cnt">${report.extra_copies.length}</span></h2>
    ${
        report.extra_copies.length === 0
            ? '<p class="empty">No extra copies found.</p>'
            : `<table><thead><tr><th>Title</th><th>Author</th><th>ISBN</th><th>Call #</th><th>In Catalog</th><th>Scanned</th><th>Status</th></tr></thead><tbody>${extraRows}</tbody></table>`
    }
  </div>

  <div class="footer">Generated by Bookleaf Library System &nbsp;·&nbsp; ${new Date().toLocaleDateString()}</div>
</body>
</html>`
}
