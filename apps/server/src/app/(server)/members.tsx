import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { queryKeys } from '../../src/lib/queryKeys'
import { ImportService, MemberImportRow } from '../../src/services/ImportService'
import { UserService } from '../../src/services/UserService'
import { useAppStore } from '../../src/store/appStore'
import { User } from '@bookleaf/types'

const ROLE_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
    admin: { bg: '#EDE9FE', text: '#7C3AED', dot: '#7C3AED' },
    librarian: { bg: '#E2EFE0', text: '#2A5C33', dot: '#2A5C33' },
    member: { bg: '#DCFCE7', text: '#15803D', dot: '#5CB85C' },
}

export default function MembersScreen() {
    const router = useRouter()
    const queryClient = useQueryClient()
    const institution = useAppStore((s) => s.institution)
    const [query, setQuery] = useState('')
    const [importVisible, setImportVisible] = useState(false)

    const {
        data: members = [],
        isFetching,
        refetch,
    } = useQuery({
        queryKey: queryKeys.members(institution?.id ?? 0, query),
        queryFn: () => (query.trim() ? UserService.search(institution!.id, query) : UserService.getAll(institution!.id)),
        enabled: !!institution,
    })

    const renderMember = useCallback(({ item }: { item: User }) => {
        const rs = ROLE_STYLE[item.role] ?? ROLE_STYLE.member
        return (
            <TouchableOpacity
                className='bg-white rounded-2xl flex-row items-center p-4 mb-3'
                style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                onPress={() => router.push(`/(server)/member/${item.id}`)}
                activeOpacity={0.75}
            >
                <View className='w-11 h-11 rounded-full items-center justify-center' style={{ backgroundColor: rs.bg }}>
                    <Text className='text-lg font-extrabold' style={{ color: rs.text }}>
                        {item.name.charAt(0).toUpperCase()}
                    </Text>
                </View>
                <View className='flex-1 ml-3'>
                    <View className='flex-row items-center gap-2'>
                        <Text className='text-sm font-bold text-[#1C2B1E]'>{item.name}</Text>
                        {!item.is_active && (
                            <View className='bg-red-100 rounded px-1.5 py-0.5'>
                                <Text className='text-[10px] font-bold text-red-600'>Inactive</Text>
                            </View>
                        )}
                    </View>
                    <Text className='text-xs text-[#5A7A5E] mt-0.5'>ID: {item.id_number}</Text>
                    <View className='self-start rounded-md px-2 py-0.5 mt-1' style={{ backgroundColor: rs.bg }}>
                        <Text className='text-[10px] font-bold uppercase tracking-wider' style={{ color: rs.text }}>
                            {item.role}
                        </Text>
                    </View>
                </View>
                <Ionicons name='chevron-forward' size={16} color='#C8DFC5' />
            </TouchableOpacity>
        )
    }, [router])

    return (
        <View className='flex-1 bg-bio'>
            <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />

            <View className='bg-brand px-5 pb-5 pt-[52px] rounded-b-[28px]'>
                <View className='flex-row items-center justify-between mb-4'>
                    <Text className='text-2xl font-extrabold text-white'>Members</Text>
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
                            onPress={() => router.push('/(server)/member/add')}
                            style={{ elevation: 3, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 }}
                        >
                            <Ionicons name='add' size={16} color='#FFFFFF' />
                            <Text className='text-white font-bold text-sm'>Add Member</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                <View className='bg-white rounded-2xl flex-row items-center px-3 overflow-hidden'>
                    <Ionicons name='search-outline' size={18} color='#94A3B8' />
                    <TextInput
                        className='flex-1 px-2 py-3 text-sm text-[#1C2B1E]'
                        value={query}
                        onChangeText={setQuery}
                        placeholder='Search name or ID number…'
                        placeholderTextColor='#94A3B8'
                        clearButtonMode='while-editing'
                    />
                </View>
            </View>

            <ImportMembersModal
                visible={importVisible}
                onClose={() => setImportVisible(false)}
                institutionId={institution?.id ?? 0}
                onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ['members'] })
                    setImportVisible(false)
                }}
            />

            <FlatList
                data={members}
                keyExtractor={(m) => String(m.id)}
                renderItem={renderMember}
                contentContainerStyle={{ padding: 16, paddingBottom: 150 }}
                onRefresh={refetch}
                refreshing={isFetching}
                removeClippedSubviews
                initialNumToRender={15}
                maxToRenderPerBatch={10}
                windowSize={5}
                ListEmptyComponent={
                    <View className='items-center pt-16'>
                        <Ionicons name='people-outline' size={48} color='#C8DFC5' />
                        <Text className='text-sm text-[#94A3B8] mt-3'>{isFetching ? 'Loading…' : 'No members found'}</Text>
                    </View>
                }
            />
        </View>
    )
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

type ImportStage = 'idle' | 'previewing' | 'importing' | 'done'

function ImportMembersModal({ visible, onClose, institutionId, onSuccess }: {
    visible: boolean
    onClose: () => void
    institutionId: number
    onSuccess: () => void
}) {
    const [stage, setStage] = useState<ImportStage>('idle')
    const [parsed, setParsed] = useState<{ valid: MemberImportRow[]; errors: { row: number; message: string }[]; total: number } | null>(null)
    const [result, setResult] = useState<{ success: number; failed: number } | null>(null)
    const [downloading, setDownloading] = useState(false)

    const reset = () => { setStage('idle'); setParsed(null); setResult(null) }

    const handleClose = () => { reset(); onClose() }

    const handleDownload = async () => {
        setDownloading(true)
        try { await ImportService.downloadTemplate('members') }
        catch { Alert.alert('Error', 'Could not share template file.') }
        finally { setDownloading(false) }
    }

    const handlePick = async () => {
        try {
            const text = await ImportService.pickCsvFile()
            if (!text) return
            const r = ImportService.parseMembers(text)
            setParsed(r)
            setStage('previewing')
        } catch {
            Alert.alert('Error', 'Could not read the file. Make sure it is a valid CSV.')
        }
    }

    const handleImport = async () => {
        if (!parsed) return
        setStage('importing')
        const r = await ImportService.importMembers(parsed.valid, institutionId)
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
                    <Text className='text-white font-extrabold text-base'>Import Members</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                    {stage === 'idle' && (
                        <>
                            <View className='bg-mint rounded-2xl px-4 py-3 flex-row items-start gap-3'>
                                <Ionicons name='information-circle-outline' size={20} color='#2A5C33' />
                                <Text className='flex-1 text-xs text-brand leading-5'>
                                    Download the template, fill in your member data, then upload it here. Name, ID number, PIN, and role are required.
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
                                    <Text className='text-xs text-[#7A9A7E] mt-0.5'>bookleaf_members_template.csv</Text>
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
                                            <Text className='text-sm font-semibold text-[#1C2B1E]' numberOfLines={1}>{row.name}</Text>
                                            <Text className='text-xs text-[#7A9A7E] mt-0.5'>{row.id_number} · {row.role}{row.user_type ? ` · ${row.user_type}` : ''}</Text>
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
                                        <Text className='text-white font-bold text-sm'>Import {parsed.valid.length} Member{parsed.valid.length !== 1 ? 's' : ''}</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </>
                    )}

                    {stage === 'importing' && (
                        <View className='items-center py-12 gap-4'>
                            <ActivityIndicator size='large' color='#2A5C33' />
                            <Text className='text-sm font-semibold text-[#5A7A5E]'>Importing members…</Text>
                        </View>
                    )}

                    {stage === 'done' && result && (
                        <>
                            <View className='bg-white rounded-2xl p-6 items-center gap-3'
                                style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}>
                                <Ionicons name='checkmark-circle' size={48} color='#16A34A' />
                                <Text className='text-lg font-extrabold text-[#1C2B1E]'>Import Complete</Text>
                                <Text className='text-sm text-[#5A7A5E] text-center'>
                                    {result.success} member{result.success !== 1 ? 's' : ''} imported successfully.
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
