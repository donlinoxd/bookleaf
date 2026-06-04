import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Constants from 'expo-constants'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Modal, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { ServerStatusCard } from '../../components/common/ServerStatusCard'
import { queryKeys } from '../../lib/queryKeys'
import { BackupService } from '../../services/BackupService'
import { seedDummyData } from '../../utils/seedDummy'
import { SettingsService } from '../../services/SettingsService'
import { useAppStore } from '../../store/appStore'
import { Settings } from '@bookleaf/types'

export default function SettingsScreen() {
    const queryClient = useQueryClient()
    const institution = useAppStore((s) => s.institution)
    const { data: saved } = useQuery({ queryKey: queryKeys.settings(), queryFn: () => SettingsService.getAll() })
    const [form, setForm] = useState<Partial<Settings>>({})
    const [saving, setSaving] = useState(false)
    const [exportingDb, setExportingDb] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [importing, setImporting] = useState(false)
    const [seeding, setSeeding] = useState(false)
    const [pwModal, setPwModal] = useState<{ open: boolean; mode: 'export' | 'import' }>({ open: false, mode: 'export' })
    const [pwPass, setPwPass] = useState('')
    const [pwConfirm, setPwConfirm] = useState('')
    const [pwBusy, setPwBusy] = useState(false)

    useEffect(() => {
        if (saved) setForm(saved)
    }, [saved])

    const openPwModal = (mode: 'export' | 'import') => {
        setPwPass('')
        setPwConfirm('')
        setPwModal({ open: true, mode })
    }

    const closePwModal = () => {
        if (pwBusy) return
        if (pwModal.mode === 'export') setExporting(false)
        else setImporting(false)
        setPwModal({ open: false, mode: pwModal.mode })
        setPwPass('')
        setPwConfirm('')
    }

    const handlePwSubmit = async () => {
        if (pwModal.mode === 'export') {
            if (pwPass.length < 6) {
                Alert.alert('Passphrase too short', 'Use at least 6 characters.')
                return
            }
            if (pwPass !== pwConfirm) {
                Alert.alert('Passphrases do not match', 'Re-type the same passphrase in both fields.')
                return
            }
        } else if (!pwPass) {
            Alert.alert('Passphrase required', 'Enter the passphrase used when the backup was created.')
            return
        }

        setPwBusy(true)
        try {
            if (pwModal.mode === 'export') {
                await BackupService.exportJson(pwPass)
                setExporting(false)
                setPwModal({ open: false, mode: 'export' })
                setPwPass(''); setPwConfirm('')
                Alert.alert(
                    'Backup Created',
                    'Save the passphrase somewhere safe — restoring this backup requires it. Without the passphrase the file cannot be opened.',
                )
            } else {
                await BackupService.importJson(pwPass)
                await queryClient.invalidateQueries()
                setImporting(false)
                setPwModal({ open: false, mode: 'import' })
                setPwPass(''); setPwConfirm('')
                Alert.alert('Restored', 'Backup restored successfully. Please restart the app.')
            }
        } catch (e) {
            Alert.alert(
                pwModal.mode === 'export' ? 'Export Failed' : 'Import Failed',
                e instanceof Error ? e.message : 'Operation failed.',
            )
        } finally {
            setPwBusy(false)
        }
    }

    const set = (key: keyof Settings, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

    const handleSave = async () => {
        setSaving(true)
        try {
            await SettingsService.update({
                institution_name: String(form.institution_name ?? ''),
                fine_per_day: Number(form.fine_per_day ?? 0),
                max_borrow_days: Number(form.max_borrow_days ?? 0),
                max_books_per_member: Number(form.max_books_per_member ?? 0),
                grace_period_days: Number(form.grace_period_days ?? 0),
                max_renewals: Number(form.max_renewals ?? 2),
            })
            await queryClient.invalidateQueries({ queryKey: queryKeys.settings() })
            Alert.alert('Saved', 'Settings updated successfully.')
        } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save settings.')
        } finally {
            setSaving(false)
        }
    }

    const handleExport = () => {
        setExporting(true)
        openPwModal('export')
    }

    const handleExportDatabase = async () => {
        setExportingDb(true)
        try {
            const dbPath = `${FileSystem.documentDirectory}SQLite/library.db`
            const fileInfo = await FileSystem.getInfoAsync(dbPath)
            if (!fileInfo.exists) {
                Alert.alert('Export Failed', 'Database file not found. Make sure the library has been used at least once.')
                return
            }
            const canShare = await Sharing.isAvailableAsync()
            if (!canShare) {
                Alert.alert('Export Failed', 'Sharing is not available on this device.')
                return
            }
            await Sharing.shareAsync(dbPath, {
                mimeType: 'application/x-sqlite3',
                dialogTitle: 'Export Library Database',
                UTI: 'public.database',
            })
        } catch (e) {
            Alert.alert('Export Failed', e instanceof Error ? e.message : 'An error occurred.')
        } finally {
            setExportingDb(false)
        }
    }

    const handleSeedDummy = () => {
        Alert.alert(
            'Load Demo Data',
            'This will insert 19 users, 20 resources, 44 copies, borrowing records, fines, gate logs, and more. All demo accounts use PIN 1234. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Load',
                    onPress: async () => {
                        setSeeding(true)
                        try {
                            await seedDummyData()
                            await queryClient.invalidateQueries()
                            Alert.alert('Done', 'Demo data loaded successfully. All accounts use PIN: 1234')
                        } catch (e) {
                            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to seed data.')
                        } finally {
                            setSeeding(false)
                        }
                    },
                },
            ],
        )
    }

    const handleImport = () => {
        Alert.alert('Restore Backup', 'This will permanently replace ALL current data. This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Restore',
                style: 'destructive',
                onPress: () => {
                    setImporting(true)
                    openPwModal('import')
                },
            },
        ])
    }

    return (
        <ScrollView className='flex-1 bg-bio' contentContainerStyle={{ paddingBottom: 150 }}>
            <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />

            <View className='bg-brand px-5 pb-6 pt-[52px] rounded-b-[28px]'>
                <Text className='text-2xl font-extrabold text-white'>Settings</Text>
                <Text className='text-xs text-[#A8D5A2] mt-1'>Library configuration & backup</Text>
            </View>

            <View className='px-4 pt-4 gap-4'>
                {/* Server control */}
                {institution && (
                    <View>
                        <Text className='text-xs font-bold text-brand uppercase tracking-wider mb-2 px-1'>Server</Text>
                        <ServerStatusCard institutionId={institution.id} />
                    </View>
                )}

                {/* Library config */}
                <View
                    className='bg-white rounded-2xl p-4 gap-3'
                    style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                >
                    <Text className='text-sm font-bold text-[#1C2B1E]'>Library Configuration</Text>

                    <Field label='Institution Name'>
                        <TextInput
                            className='bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]'
                            value={String(form.institution_name ?? '')}
                            onChangeText={(v) => set('institution_name', v)}
                            placeholder='My School Library'
                            placeholderTextColor='#94A3B8'
                        />
                    </Field>
                    <Field label='Fine per Day (₱)'>
                        <TextInput
                            className='bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]'
                            value={String(form.fine_per_day ?? '')}
                            onChangeText={(v) => set('fine_per_day', v)}
                            keyboardType='numeric'
                            placeholder='5'
                            placeholderTextColor='#94A3B8'
                        />
                    </Field>
                    <Field label='Max Borrow Days'>
                        <TextInput
                            className='bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]'
                            value={String(form.max_borrow_days ?? '')}
                            onChangeText={(v) => set('max_borrow_days', v)}
                            keyboardType='numeric'
                            placeholder='7'
                            placeholderTextColor='#94A3B8'
                        />
                    </Field>
                    <Field label='Max Books per Member'>
                        <TextInput
                            className='bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]'
                            value={String(form.max_books_per_member ?? '')}
                            onChangeText={(v) => set('max_books_per_member', v)}
                            keyboardType='numeric'
                            placeholder='3'
                            placeholderTextColor='#94A3B8'
                        />
                    </Field>
                    <Field label='Grace Period (days before fine starts)'>
                        <TextInput
                            className='bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]'
                            value={String(form.grace_period_days ?? '')}
                            onChangeText={(v) => set('grace_period_days', v)}
                            keyboardType='numeric'
                            placeholder='0'
                            placeholderTextColor='#94A3B8'
                        />
                    </Field>
                    <Field label='Max Renewals per Borrow'>
                        <TextInput
                            className='bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]'
                            value={String(form.max_renewals ?? '')}
                            onChangeText={(v) => set('max_renewals', v)}
                            keyboardType='numeric'
                            placeholder='2'
                            placeholderTextColor='#94A3B8'
                        />
                    </Field>

                    <TouchableOpacity
                        className='bg-leaf rounded-xl py-3.5 items-center'
                        onPress={handleSave}
                        disabled={saving}
                        style={{ elevation: 3, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }}
                    >
                        <Text className='text-white font-bold'>{saving ? 'Saving…' : 'Save Changes'}</Text>
                    </TouchableOpacity>
                </View>

                {/* Backup */}
                <View
                    className='bg-white rounded-2xl p-4 gap-3'
                    style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                >
                    <Text className='text-sm font-bold text-[#1C2B1E]'>Backup & Restore</Text>
                    <Text className='text-xs text-[#7A9A7E] leading-4'>
                        Export saves all books, members, and records to a JSON file. Restoring replaces all current data.
                    </Text>

                    <TouchableOpacity
                        className='bg-mint border border-[#C8DFC5] rounded-xl py-3.5 flex-row items-center justify-center gap-2'
                        onPress={handleExport}
                        disabled={exporting}
                    >
                        <Ionicons name='cloud-upload-outline' size={18} color='#2A5C33' />
                        <Text className='text-brand font-bold'>{exporting ? 'Preparing…' : 'Export Backup'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        className='bg-orange-50 border border-orange-200 rounded-xl py-3.5 flex-row items-center justify-center gap-2'
                        onPress={handleImport}
                        disabled={importing}
                    >
                        <Ionicons name='cloud-download-outline' size={18} color='#C2410C' />
                        <Text className='text-orange-700 font-bold'>{importing ? 'Restoring…' : 'Restore from Backup'}</Text>
                    </TouchableOpacity>

                    {__DEV__ && (
                        <TouchableOpacity
                            className='bg-violet-50 border border-violet-200 rounded-xl py-3.5 flex-row items-center justify-center gap-2'
                            onPress={handleSeedDummy}
                            disabled={seeding}
                        >
                            <Ionicons name='flask-outline' size={18} color='#7C3AED' />
                            <Text className='text-violet-700 font-bold'>{seeding ? 'Loading…' : 'Load Demo Data (dev only)'}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Database Export */}
                <View
                    className='bg-white rounded-2xl px-4 py-4 gap-3'
                    style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 }}
                >
                    <Text className='text-sm font-bold text-[#1C2B1E]'>Database Export</Text>
                    <Text className='text-xs text-[#7A9A7E] leading-4'>
                        Export the raw SQLite database file to migrate your library data to the Bookleaf Desktop app.
                    </Text>
                    <TouchableOpacity
                        className='bg-mint rounded-xl py-3 flex-row items-center justify-center gap-2'
                        onPress={handleExportDatabase}
                        disabled={exportingDb}
                    >
                        {exportingDb
                            ? <ActivityIndicator size='small' color='#2A5C33' />
                            : <Ionicons name='archive-outline' size={18} color='#2A5C33' />}
                        <Text className='text-brand font-bold text-sm'>
                            {exportingDb ? 'Exporting…' : 'Export Database (.db)'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* About / version footer */}
                <View className='items-center pt-4 pb-2 gap-1'>
                    <Text className='text-xs font-semibold text-[#7A9A7E]' selectable>
                        Bookleaf v{Constants.expoConfig?.version ?? '?'}
                        {Constants.expoConfig?.android?.versionCode != null
                            ? ` (build ${Constants.expoConfig.android.versionCode})`
                            : ''}
                        {__DEV__ ? ' · dev' : ''}
                    </Text>
                    <Text className='text-[10px] text-[#94A3B8]' selectable>
                        Expo SDK {Constants.expoConfig?.sdkVersion ?? '?'}
                    </Text>
                </View>
            </View>

            <Modal visible={pwModal.open} transparent animationType='fade' onRequestClose={closePwModal}>
                <View className='flex-1 bg-black/50 justify-center px-6'>
                    <View className='bg-white rounded-3xl p-6 gap-4'>
                        <Text className='text-lg font-extrabold text-[#1C2B1E]'>
                            {pwModal.mode === 'export' ? 'Set a Backup Passphrase' : 'Enter Backup Passphrase'}
                        </Text>
                        <Text className='text-xs text-[#5A7A5E] leading-5'>
                            {pwModal.mode === 'export'
                                ? 'Choose a passphrase to encrypt this backup. You will need the exact same passphrase to restore it later. There is no recovery if you forget it.'
                                : 'Enter the passphrase that was used when this backup was created. Without it the file cannot be opened.'}
                        </Text>

                        <View className='gap-1'>
                            <Text className='text-xs font-bold text-brand uppercase tracking-wider'>Passphrase</Text>
                            <TextInput
                                className='bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]'
                                value={pwPass}
                                onChangeText={setPwPass}
                                secureTextEntry
                                autoCapitalize='none'
                                autoCorrect={false}
                                placeholder={pwModal.mode === 'export' ? 'At least 6 characters' : 'Backup passphrase'}
                                placeholderTextColor='#94A3B8'
                                editable={!pwBusy}
                            />
                        </View>

                        {pwModal.mode === 'export' && (
                            <View className='gap-1'>
                                <Text className='text-xs font-bold text-brand uppercase tracking-wider'>Confirm Passphrase</Text>
                                <TextInput
                                    className='bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]'
                                    value={pwConfirm}
                                    onChangeText={setPwConfirm}
                                    secureTextEntry
                                    autoCapitalize='none'
                                    autoCorrect={false}
                                    placeholder='Type the passphrase again'
                                    placeholderTextColor='#94A3B8'
                                    editable={!pwBusy}
                                />
                            </View>
                        )}

                        <View className='flex-row gap-3 mt-2'>
                            <TouchableOpacity
                                className='flex-1 bg-bio border border-mint rounded-xl py-3 items-center'
                                onPress={closePwModal}
                                disabled={pwBusy}
                            >
                                <Text className='font-bold text-[#5A7A5E]'>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className='flex-1 bg-brand rounded-xl py-3 items-center'
                                onPress={handlePwSubmit}
                                disabled={pwBusy}
                            >
                                {pwBusy
                                    ? <ActivityIndicator color='#fff' size='small' />
                                    : <Text className='text-white font-bold'>{pwModal.mode === 'export' ? 'Create Backup' : 'Restore'}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <View className='gap-1'>
            <Text className='text-xs font-bold text-brand uppercase tracking-wider'>{label}</Text>
            {children}
        </View>
    )
}
