import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, Keyboard } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChatMessage, LlmService, SYSTEM_PROMPT, TOOL_LABELS } from '../../src/services/LlmService'
import { useAppStore } from '../../src/store/appStore'

const BRAND = '#2A5C33'
const LEAF = '#5CB85C'

type Phase = 'checking' | 'not-downloaded' | 'downloading' | 'loading' | 'ready' | 'error'

type UIMessage = {
    id: string
    role: 'user' | 'assistant'
    content: string
}

export default function AiChatScreen() {
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const { institution } = useAppStore()
    const [phase, setPhase] = useState<Phase>('checking')
    const [downloadProgress, setDownloadProgress] = useState(0)
    const [messages, setMessages] = useState<UIMessage[]>([])
    const [input, setInput] = useState('')
    const [isGenerating, setIsGenerating] = useState(false)
    const [streamingText, setStreamingText] = useState('')
    const [toolStatus, setToolStatus] = useState('')
    const [error, setError] = useState('')
    const [keyboardHeight, setKeyboardHeight] = useState(0)
    const scrollRef = useRef<ScrollView>(null)
    const isNearBottomRef = useRef(true)

    useEffect(() => {
        const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height))
        const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0))
        return () => { show.remove(); hide.remove() }
    }, [])

    useEffect(() => {
        checkModel()
    }, [])

    async function checkModel() {
        setPhase('checking')
        try {
            if (LlmService.isLoaded()) {
                setPhase('ready')
                return
            }
            const downloaded = await LlmService.isModelDownloaded()
            if (downloaded) {
                await loadModel()
            } else {
                setPhase('not-downloaded')
            }
        } catch (e) {
            setError(String(e))
            setPhase('error')
        }
    }

    async function downloadModel() {
        setPhase('downloading')
        setDownloadProgress(0)
        try {
            await LlmService.downloadModel((p) => setDownloadProgress(p))
            await loadModel()
        } catch (e) {
            setError(String(e))
            setPhase('error')
        }
    }

    async function loadModel() {
        setPhase('loading')
        try {
            await LlmService.loadModel()
            setPhase('ready')
        } catch (e) {
            setError(String(e))
            setPhase('error')
        }
    }

    async function sendMessage() {
        if (!input.trim() || isGenerating) return

        const userMsg: UIMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
        }
        const next = [...messages, userMsg]
        setMessages(next)
        setInput('')
        setIsGenerating(true)
        setStreamingText('')
        setToolStatus('')
        isNearBottomRef.current = true
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)

        try {
            const apiMessages: ChatMessage[] = [
                { role: 'system', content: SYSTEM_PROMPT },
                ...next.map((m) => ({ role: m.role, content: m.content })),
            ]
            let full = ''
            await LlmService.chat(
                apiMessages,
                (token) => {
                    setToolStatus('')
                    full += token
                    setStreamingText(full)
                },
                {
                    institutionId: institution?.id,
                    onToolCall: (tool: string) => setToolStatus(TOOL_LABELS[tool] || ''),
                },
            )
            setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: full }])
            setStreamingText('')
        } catch (e) {
            setError(String(e))
        } finally {
            setIsGenerating(false)
            setToolStatus('')
        }
    }

    // ── Phases ──────────────────────────────────────────────────────────────────

    if (phase === 'checking') {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAF8' }}>
                <ActivityIndicator size='large' color={LEAF} />
            </View>
        )
    }

    if (phase === 'not-downloaded') {
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: '#F8FAF8',
                    paddingTop: insets.top,
                    paddingHorizontal: 24,
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                <TouchableOpacity onPress={() => router.back()} style={{ position: 'absolute', top: insets.top + 16, left: 16 }}>
                    <Ionicons name='arrow-back' size={24} color={BRAND} />
                </TouchableOpacity>

                <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#EFF6EF', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name='sparkles' size={44} color={LEAF} />
                </View>
                <Text style={{ fontSize: 26, fontWeight: '700', color: BRAND, marginTop: 20, textAlign: 'center' }}>Meet Leaf AI</Text>
                <Text style={{ fontSize: 15, color: '#64748B', marginTop: 10, textAlign: 'center', lineHeight: 22 }}>
                    Your on-device AI assistant for the library.{'\n'}No internet required after setup.
                </Text>

                <View style={{ backgroundColor: '#EFF6EF', borderRadius: 14, padding: 16, marginTop: 32, width: '100%', gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name='cube-outline' size={16} color={BRAND} />
                        <Text style={{ fontSize: 13, color: '#1E293B' }}>
                            Model: <Text style={{ fontWeight: '600' }}>Gemma 2 2B (Q4_K_M)</Text>
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name='download-outline' size={16} color={BRAND} />
                        <Text style={{ fontSize: 13, color: '#1E293B' }}>
                            One-time download: <Text style={{ fontWeight: '600' }}>~1.5 GB</Text>
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name='wifi-outline' size={16} color={BRAND} />
                        <Text style={{ fontSize: 13, color: '#1E293B' }}>Runs fully offline after download</Text>
                    </View>
                </View>

                <TouchableOpacity
                    onPress={downloadModel}
                    style={{
                        backgroundColor: LEAF,
                        borderRadius: 16,
                        paddingVertical: 16,
                        paddingHorizontal: 48,
                        marginTop: 32,
                        elevation: 4,
                        shadowColor: LEAF,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 8,
                    }}
                >
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Download Model</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 12, textAlign: 'center' }}>Use Wi-Fi for faster download.</Text>
            </View>
        )
    }

    if (phase === 'downloading') {
        const pct = Math.round(downloadProgress * 100)
        const downloaded = (downloadProgress * 1.5).toFixed(1)
        return (
            <View style={{ flex: 1, backgroundColor: '#F8FAF8', padding: 24, justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#EFF6EF', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name='cloud-download-outline' size={40} color={LEAF} />
                </View>
                <Text style={{ fontSize: 22, fontWeight: '700', color: BRAND, marginTop: 20 }}>Downloading Model</Text>
                <Text style={{ fontSize: 14, color: '#64748B', marginTop: 6 }}>{downloaded} GB of ~1.5 GB</Text>

                <View style={{ width: '100%', height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, marginTop: 28 }}>
                    <View style={{ width: `${pct}%`, height: 8, backgroundColor: LEAF, borderRadius: 4 }} />
                </View>
                <Text style={{ fontSize: 22, fontWeight: '700', color: BRAND, marginTop: 10 }}>{pct}%</Text>
                <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 8, textAlign: 'center' }}>Keep the app open until complete.</Text>
            </View>
        )
    }

    if (phase === 'loading') {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAF8' }}>
                <ActivityIndicator size='large' color={LEAF} />
                <Text style={{ fontSize: 15, color: '#64748B', marginTop: 16 }}>Loading model into memory…</Text>
                <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>This may take a few seconds.</Text>
            </View>
        )
    }

    if (phase === 'error') {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAF8', padding: 24 }}>
                <TouchableOpacity onPress={() => router.back()} style={{ position: 'absolute', top: insets.top + 16, left: 16 }}>
                    <Ionicons name='arrow-back' size={24} color={BRAND} />
                </TouchableOpacity>
                <Ionicons name='alert-circle-outline' size={52} color='#EF4444' />
                <Text style={{ fontSize: 16, color: '#EF4444', marginTop: 16, textAlign: 'center' }}>{error}</Text>
                <TouchableOpacity
                    onPress={checkModel}
                    style={{ marginTop: 24, backgroundColor: LEAF, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 14 }}
                >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Try Again</Text>
                </TouchableOpacity>
            </View>
        )
    }

    // ── Chat UI ──────────────────────────────────────────────────────────────────

    const displayMessages: UIMessage[] =
        isGenerating && streamingText ? [...messages, { id: 'streaming', role: 'assistant', content: streamingText }] : messages

    const showToolStatus = isGenerating && toolStatus && !streamingText

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#F8FAF8', marginBottom: Platform.OS === 'android' ? keyboardHeight + insets.bottom : 0 }} behavior='padding' enabled={Platform.OS === 'ios'}>
            {/* Header */}
            <View
                style={{
                    paddingTop: insets.top + 8,
                    paddingBottom: 12,
                    paddingHorizontal: 16,
                    backgroundColor: '#fff',
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderBottomWidth: 1,
                    borderBottomColor: '#F1F5F1',
                    elevation: 2,
                    shadowColor: '#2A5C33',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.06,
                    shadowRadius: 4,
                }}
            >
                <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
                    <Ionicons name='arrow-back' size={24} color={BRAND} />
                </TouchableOpacity>
                <View
                    style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: LEAF,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 10,
                    }}
                >
                    <Ionicons name='sparkles' size={18} color='#fff' />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: BRAND }}>Leaf AI</Text>
                    <Text style={{ fontSize: 11, color: '#94A3B8' }}>On-device · Gemma 2 2B</Text>
                </View>
                {messages.length > 0 && (
                    <TouchableOpacity onPress={() => setMessages([])} style={{ padding: 6 }}>
                        <Ionicons name='trash-outline' size={18} color='#94A3B8' />
                    </TouchableOpacity>
                )}
            </View>

            {/* Messages */}
            <ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
                onScroll={(e) => {
                    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
                    isNearBottomRef.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80
                }}
                scrollEventThrottle={100}
                onContentSizeChange={() => {
                    if (isNearBottomRef.current) scrollRef.current?.scrollToEnd({ animated: true })
                }}
                keyboardShouldPersistTaps='handled'
            >
                {displayMessages.length === 0 && (
                    <View style={{ alignItems: 'center', marginTop: 60, paddingHorizontal: 24 }}>
                        <Ionicons name='chatbubbles-outline' size={52} color='#CBD5E1' />
                        <Text style={{ color: '#94A3B8', marginTop: 14, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
                            Ask me anything about the library.
                        </Text>
                        <Text style={{ color: '#CBD5E1', marginTop: 6, fontSize: 13, textAlign: 'center' }}>Books, members, borrowing, reports…</Text>
                    </View>
                )}
                {displayMessages.map((item) => (
                    <View key={item.id} style={{ alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%', marginBottom: 10 }}>
                        {item.role === 'assistant' && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 4 }}>
                                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: LEAF, alignItems: 'center', justifyContent: 'center' }}>
                                    <Ionicons name='sparkles' size={10} color='#fff' />
                                </View>
                                <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '600' }}>Leaf</Text>
                            </View>
                        )}
                        <View
                            style={{
                                backgroundColor: item.role === 'user' ? BRAND : '#fff',
                                borderRadius: 18,
                                borderBottomRightRadius: item.role === 'user' ? 4 : 18,
                                borderBottomLeftRadius: item.role === 'user' ? 18 : 4,
                                paddingHorizontal: 14,
                                paddingVertical: 10,
                                elevation: 1,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 1 },
                                shadowOpacity: 0.06,
                                shadowRadius: 3,
                            }}
                        >
                            <Text style={{ color: item.role === 'user' ? '#fff' : '#1E293B', fontSize: 14, lineHeight: 21 }}>{item.content}</Text>
                        </View>
                    </View>
                ))}
                {showToolStatus && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 4 }}>
                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: LEAF, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name='sparkles' size={10} color='#fff' />
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 8, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 }}>
                            <ActivityIndicator size='small' color={LEAF} />
                            <Text style={{ fontSize: 13, color: '#64748B' }}>{toolStatus}</Text>
                        </View>
                    </View>
                )}
            </ScrollView>

            {/* Input bar */}
            <View
                style={{
                    backgroundColor: '#fff',
                    borderTopWidth: 1,
                    borderTopColor: '#EEF2EE',
                    paddingHorizontal: 16,
                    paddingTop: 10,
                    paddingBottom: Platform.OS === 'android'
                        ? (keyboardHeight > 0 ? 10 : (insets.bottom > 0 ? insets.bottom : 10))
                        : (insets.bottom > 0 ? insets.bottom : 10),
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    gap: 10,
                }}
            >
                <View
                    style={{
                        flex: 1,
                        backgroundColor: '#F1F5F1',
                        borderRadius: 22,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        minHeight: 44,
                        justifyContent: 'center',
                    }}
                >
                    <TextInput
                        value={input}
                        onChangeText={setInput}
                        placeholder='Message Leaf…'
                        placeholderTextColor='#94A3B8'
                        multiline
                        style={{ fontSize: 14, color: '#1E293B', maxHeight: 100, padding: 0 }}
                        editable={!isGenerating}
                    />
                </View>
                <TouchableOpacity
                    onPress={sendMessage}
                    disabled={!input.trim() || isGenerating}
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: input.trim() && !isGenerating ? LEAF : '#E2E8F0',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {isGenerating ? (
                        <ActivityIndicator size='small' color='#fff' />
                    ) : (
                        <Ionicons name='arrow-up' size={20} color={input.trim() ? '#fff' : '#94A3B8'} />
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    )
}
