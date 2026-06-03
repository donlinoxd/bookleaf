import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Image, Modal, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { MATERIAL_TYPE_META } from '../../src/lib/materialTypes'
import { queryKeys } from '../../src/lib/queryKeys'
import { ImportService, BookImportRow } from '../../src/services/ImportService'
import { ResourceService } from '../../src/services/ResourceService'
import { useAppStore } from '../../src/store/appStore'
import { Resource } from '../../src/types'

export default function CatalogScreen() {
    const router = useRouter()
    const queryClient = useQueryClient()
    const institution = useAppStore((s) => s.institution)
    const [query, setQuery] = useState('')
    const [importVisible, setImportVisible] = useState(false)

    const {
        data: items = [],
        isFetching,
        refetch,
    } = useQuery({
        queryKey: queryKeys.resources(institution?.id ?? 0, query),
        queryFn: () => (query.trim() ? ResourceService.search(institution!.id, query) : ResourceService.getAll(institution!.id)),
        enabled: !!institution,
    })

    const renderItem = useCallback(({ item }: { item: Resource }) => {
        const meta = MATERIAL_TYPE_META[item.material_type]
        return (
            <TouchableOpacity
                className='bg-white rounded-2xl flex-row p-4 mb-3'
                style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                onPress={() => router.push(`/(server)/book/${item.id}`)}
                activeOpacity={0.75}
            >
                {item.cover_uri ? (
                    <Image source={{ uri: item.cover_uri }} className='w-12 h-16 rounded-xl' resizeMode='cover' />
                ) : (
                    <View className='w-12 h-16 bg-mint rounded-xl items-center justify-center'>
                        <Ionicons name={meta.icon as any} size={22} color='#2A5C33' />
                    </View>
                )}
                <View className='flex-1 ml-3'>
                    <Text className='text-sm font-bold text-[#1C2B1E] leading-5' numberOfLines={2}>
                        {item.title}
                    </Text>
                    <Text className='text-xs text-[#5A7A5E] mt-0.5 font-medium'>{item.author}</Text>
                    <View className='flex-row items-center gap-1.5 mt-1.5 flex-wrap'>
                        <View className='bg-[#E8F4E8] rounded-md px-2 py-0.5'>
                            <Text className='text-[10px] font-bold text-brand'>{meta.label}</Text>
                        </View>
                        {item.genre && <Text className='text-xs text-[#94A3B8]'>{item.genre}</Text>}
                    </View>
                    <View className='flex-row items-center gap-2 mt-1.5'>
                        <View className={`rounded-md px-2 py-0.5 ${item.available_copies > 0 ? 'bg-mint' : 'bg-red-100'}`}>
                            <Text className={`text-xs font-bold ${item.available_copies > 0 ? 'text-brand' : 'text-red-600'}`}>
                                {item.available_copies > 0 ? `${item.available_copies} available` : 'Unavailable'}
                            </Text>
                        </View>
                        <Text className='text-xs text-[#94A3B8]'>{item.total_copies} total</Text>
                    </View>
                </View>
                <Ionicons name='chevron-forward' size={16} color='#C8DFC5' className='self-center' />
            </TouchableOpacity>
        )
    }, [router])

    return (
        <View className='flex-1 bg-bio'>
            <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />

            <View className='bg-brand px-5 pb-5 pt-[52px] rounded-b-[28px]'>
                <View className='flex-row items-center justify-between mb-4'>
                    <Text className='text-2xl font-extrabold text-white'>Catalog</Text>
                    <View className='flex-row gap-2'>
                        <TouchableOpacity
                            className='bg-[#1C3E23] rounded-xl px-3 py-2 flex-row items-center gap-1'
                            onPress={() => setImportVisible(true)}
                        >
                            <Ionicons name='cloud-upload-outline' size={15} color='#A8D5A2' />
                            <Text className='text-[#A8D5A2] font-bold text-sm'>Import</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            className='bg-leaf rounded-xl px-4 py-2 flex-row items-center gap-1'
                            onPress={() => router.push('/(server)/book/add')}
                            style={{ elevation: 3, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 }}
                        >
                            <Ionicons name='add' size={16} color='#FFFFFF' />
                            <Text className='text-white font-bold text-sm'>Add</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                <View className='bg-white rounded-2xl flex-row items-center px-3 overflow-hidden'>
                    <Ionicons name='search-outline' size={18} color='#94A3B8' />
                    <TextInput
                        className='flex-1 px-2 py-3 text-sm text-[#1C2B1E]'
                        value={query}
                        onChangeText={setQuery}
                        placeholder='Search title, author, ISBN, type…'
                        placeholderTextColor='#94A3B8'
                        clearButtonMode='while-editing'
                    />
                </View>
            </View>

            <ImportBooksModal
                visible={importVisible}
                onClose={() => setImportVisible(false)}
                institutionId={institution?.id ?? 0}
                onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ['resources'] })
                    setImportVisible(false)
                }}
            />

            <FlatList
                data={items}
                keyExtractor={(b) => String(b.id)}
                renderItem={renderItem}
                contentContainerStyle={{ padding: 16, paddingBottom: 150 }}
                onRefresh={refetch}
                refreshing={isFetching}
                removeClippedSubviews
                initialNumToRender={15}
                maxToRenderPerBatch={10}
                windowSize={5}
                ListEmptyComponent={
                    <View className='items-center pt-16'>
                        <Ionicons name='library-outline' size={48} color='#C8DFC5' />
                        <Text className='text-sm text-[#94A3B8] mt-3'>{isFetching ? 'Loading…' : 'No resources found'}</Text>
                    </View>
                }
            />
        </View>
    )
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

type ImportStage = 'idle' | 'previewing' | 'importing' | 'done'

function ImportBooksModal({ visible, onClose, institutionId, onSuccess }: {
    visible: boolean
    onClose: () => void
    institutionId: number
    onSuccess: () => void
}) {
    const [stage, setStage] = useState<ImportStage>('idle')
    const [parsed, setParsed] = useState<{ valid: BookImportRow[]; errors: { row: number; message: string }[]; total: number } | null>(null)
    const [result, setResult] = useState<{ success: number; failed: number } | null>(null)
    const [downloading, setDownloading] = useState(false)

    const reset = () => { setStage('idle'); setParsed(null); setResult(null) }

    const handleClose = () => { reset(); onClose() }

    const handleDownload = async () => {
        setDownloading(true)
        try { await ImportService.downloadTemplate('books') }
        catch { Alert.alert('Error', 'Could not share template file.') }
        finally { setDownloading(false) }
    }

    const handlePick = async () => {
        try {
            const text = await ImportService.pickCsvFile()
            if (!text) return
            const result = ImportService.parseBooks(text)
            setParsed(result)
            setStage('previewing')
        } catch {
            Alert.alert('Error', 'Could not read the file. Make sure it is a valid CSV.')
        }
    }

    const handleImport = async () => {
        if (!parsed) return
        setStage('importing')
        const r = await ImportService.importBooks(parsed.valid, institutionId)
        setResult(r)
        setStage('done')
        onSuccess()
    }

    return (
        <Modal visible={visible} animationType='slide' presentationStyle='pageSheet'>
            <View className='flex-1 bg-bio'>
                <View className='bg-brand flex-row items-center justify-between px-5 pb-4 pt-16 rounded-b-[20px]'>
                    <TouchableOpacity onPress={handleClose}>
                        <Text className='text-[#A8D5A2] text-sm font-medium'>Close</Text>
                    </TouchableOpacity>
                    <Text className='text-white font-extrabold text-base'>Import Books</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                    {stage === 'idle' && (
                        <>
                            <View className='bg-mint rounded-2xl px-4 py-3 flex-row items-start gap-3'>
                                <Ionicons name='information-circle-outline' size={20} color='#2A5C33' />
                                <Text className='flex-1 text-xs text-brand leading-5'>
                                    Download the template, fill in your book data, then upload it here. All fields except title and author are optional.
                                </Text>
                            </View>

                            <TouchableOpacity
                                className='bg-white rounded-2xl p-4 flex-row items-center gap-3'
                                style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                                onPress={handleDownload}
                                disabled={downloading}
                            >
                                <View className='w-10 h-10 bg-mint rounded-xl items-center justify-center'>
                                    <Ionicons name='download-outline' size={20} color='#2A5C33' />
                                </View>
                                <View className='flex-1'>
                                    <Text className='text-sm font-bold text-[#1C2B1E]'>Download Template</Text>
                                    <Text className='text-xs text-[#7A9A7E] mt-0.5'>bookleaf_books_template.csv</Text>
                                </View>
                                {downloading && <ActivityIndicator size='small' color='#2A5C33' />}
                            </TouchableOpacity>

                            <TouchableOpacity
                                className='bg-brand rounded-2xl p-4 flex-row items-center gap-3'
                                style={{ elevation: 3, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6 }}
                                onPress={handlePick}
                            >
                                <View className='w-10 h-10 bg-[#1C3E23] rounded-xl items-center justify-center'>
                                    <Ionicons name='cloud-upload-outline' size={20} color='#A8D5A2' />
                                </View>
                                <View className='flex-1'>
                                    <Text className='text-sm font-bold text-white'>Pick CSV File</Text>
                                    <Text className='text-xs text-[#A8D5A2] mt-0.5'>Select a .csv file from your device</Text>
                                </View>
                            </TouchableOpacity>
                        </>
                    )}

                    {stage === 'previewing' && parsed && (
                        <>
                            <View className='bg-white rounded-2xl p-4 flex-row gap-4'
                                style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
                                <View className='flex-1 items-center'>
                                    <Text className='text-2xl font-extrabold text-brand'>{parsed.valid.length}</Text>
                                    <Text className='text-xs text-[#7A9A7E] mt-0.5'>Ready to import</Text>
                                </View>
                                <View className='w-px bg-mint' />
                                <View className='flex-1 items-center'>
                                    <Text className={`text-2xl font-extrabold ${parsed.errors.length > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'}`}>{parsed.errors.length}</Text>
                                    <Text className='text-xs text-[#7A9A7E] mt-0.5'>Errors (skipped)</Text>
                                </View>
                                <View className='w-px bg-mint' />
                                <View className='flex-1 items-center'>
                                    <Text className='text-2xl font-extrabold text-[#1C2B1E]'>{parsed.total}</Text>
                                    <Text className='text-xs text-[#7A9A7E] mt-0.5'>Total rows</Text>
                                </View>
                            </View>

                            {parsed.errors.length > 0 && (
                                <View className='bg-white rounded-2xl p-4'
                                    style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
                                    <Text className='text-xs font-bold text-[#DC2626] uppercase tracking-widest mb-2'>Errors — these rows will be skipped</Text>
                                    {parsed.errors.slice(0, 5).map((e, i) => (
                                        <Text key={i} className='text-xs text-[#DC2626] py-1 border-t border-[#FEE2E2]'>Row {e.row}: {e.message}</Text>
                                    ))}
                                    {parsed.errors.length > 5 && (
                                        <Text className='text-xs text-[#94A3B8] mt-1'>…and {parsed.errors.length - 5} more</Text>
                                    )}
                                </View>
                            )}

                            {parsed.valid.length > 0 && (
                                <View className='bg-white rounded-2xl p-4'
                                    style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
                                    <Text className='text-xs font-bold text-brand uppercase tracking-widest mb-2'>Preview (first 5)</Text>
                                    {parsed.valid.slice(0, 5).map((row, i) => (
                                        <View key={i} className='py-2 border-t border-[#F1F5F9]'>
                                            <Text className='text-sm font-semibold text-[#1C2B1E]' numberOfLines={1}>{row.title}</Text>
                                            <Text className='text-xs text-[#7A9A7E] mt-0.5'>{row.author} · {row.material_type} · {row.copies} cop{row.copies === 1 ? 'y' : 'ies'}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            <View className='flex-row gap-3'>
                                <TouchableOpacity className='flex-1 bg-white border border-mint rounded-2xl py-3.5 items-center' onPress={reset}>
                                    <Text className='text-sm font-bold text-brand'>Pick Another</Text>
                                </TouchableOpacity>
                                {parsed.valid.length > 0 && (
                                    <TouchableOpacity
                                        className='flex-[2] bg-leaf rounded-2xl py-3.5 items-center'
                                        style={{ elevation: 3, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 }}
                                        onPress={handleImport}
                                    >
                                        <Text className='text-white font-bold text-sm'>Import {parsed.valid.length} Book{parsed.valid.length !== 1 ? 's' : ''}</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </>
                    )}

                    {stage === 'importing' && (
                        <View className='items-center py-12 gap-4'>
                            <ActivityIndicator size='large' color='#2A5C33' />
                            <Text className='text-sm font-semibold text-[#5A7A5E]'>Importing books…</Text>
                        </View>
                    )}

                    {stage === 'done' && result && (
                        <>
                            <View className='bg-white rounded-2xl p-6 items-center gap-3'
                                style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
                                <Ionicons name='checkmark-circle' size={48} color='#16A34A' />
                                <Text className='text-lg font-extrabold text-[#1C2B1E]'>Import Complete</Text>
                                <Text className='text-sm text-[#5A7A5E] text-center'>
                                    {result.success} book{result.success !== 1 ? 's' : ''} imported successfully.
                                    {result.failed > 0 ? ` ${result.failed} failed.` : ''}
                                </Text>
                            </View>
                            <TouchableOpacity className='bg-brand rounded-2xl py-4 items-center' onPress={handleClose}>
                                <Text className='text-white font-bold'>Done</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </ScrollView>
            </View>
        </Modal>
    )
}
