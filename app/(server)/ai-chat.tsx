import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, Keyboard } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChatMessage, LlmService, SYSTEM_PROMPT, TOOL_LABELS } from '../../src/services/LlmService'
import { useAppStore } from '../../src/store/appStore'

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
            <View className="flex-1 justify-center items-center bg-[#F8FAF8]">
                <ActivityIndicator size='large' color='#5CB85C' />
            </View>
        )
    }

    if (phase === 'not-downloaded') {
        return (
            <View
                className="flex-1 bg-[#F8FAF8] px-6 justify-center items-center"
                style={{ paddingTop: insets.top }}
            >
                <TouchableOpacity
                    onPress={() => router.back()}
                    className="absolute left-4"
                    style={{ top: insets.top + 16 }}
                >
                    <Ionicons name='arrow-back' size={24} color='#2A5C33' />
                </TouchableOpacity>

                <View className="w-[88px] h-[88px] rounded-full bg-[#EFF6EF] items-center justify-center">
                    <Ionicons name='sparkles' size={44} color='#5CB85C' />
                </View>
                <Text className="text-[26px] font-bold text-brand mt-5 text-center">Meet Leaf AI</Text>
                <Text className="text-[15px] text-[#64748B] mt-[10px] text-center leading-[22px]">
                    Your on-device AI assistant for the library.{'\n'}No internet required after setup.
                </Text>

                <View className="bg-[#EFF6EF] rounded-[14px] p-4 mt-8 w-full gap-[6px]">
                    <View className="flex-row items-center gap-2">
                        <Ionicons name='cube-outline' size={16} color='#2A5C33' />
                        <Text className="text-[13px] text-[#1E293B]">
                            Model: <Text className="font-semibold">Gemma 2 2B (Q4_K_M)</Text>
                        </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                        <Ionicons name='download-outline' size={16} color='#2A5C33' />
                        <Text className="text-[13px] text-[#1E293B]">
                            One-time download: <Text className="font-semibold">~1.5 GB</Text>
                        </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                        <Ionicons name='wifi-outline' size={16} color='#2A5C33' />
                        <Text className="text-[13px] text-[#1E293B]">Runs fully offline after download</Text>
                    </View>
                </View>

                <TouchableOpacity
                    onPress={downloadModel}
                    className="bg-leaf rounded-2xl py-4 px-12 mt-8"
                    style={{
                        elevation: 4,
                        shadowColor: '#5CB85C',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 8,
                    }}
                >
                    <Text className="text-white text-base font-bold">Download Model</Text>
                </TouchableOpacity>
                <Text className="text-[12px] text-[#94A3B8] mt-3 text-center">Use Wi-Fi for faster download.</Text>
            </View>
        )
    }

    if (phase === 'downloading') {
        const pct = Math.round(downloadProgress * 100)
        const downloaded = (downloadProgress * 1.5).toFixed(1)
        return (
            <View className="flex-1 bg-[#F8FAF8] p-6 justify-center items-center">
                <View className="w-20 h-20 rounded-full bg-[#EFF6EF] items-center justify-center">
                    <Ionicons name='cloud-download-outline' size={40} color='#5CB85C' />
                </View>
                <Text className="text-[22px] font-bold text-brand mt-5">Downloading Model</Text>
                <Text className="text-[14px] text-[#64748B] mt-[6px]">{downloaded} GB of ~1.5 GB</Text>

                <View className="w-full h-2 bg-[#E2E8F0] rounded mt-7">
                    <View style={{ width: `${pct}%` }} className="h-2 bg-leaf rounded" />
                </View>
                <Text className="text-[22px] font-bold text-brand mt-[10px]">{pct}%</Text>
                <Text className="text-[12px] text-[#94A3B8] mt-2 text-center">Keep the app open until complete.</Text>
            </View>
        )
    }

    if (phase === 'loading') {
        return (
            <View className="flex-1 justify-center items-center bg-[#F8FAF8]">
                <ActivityIndicator size='large' color='#5CB85C' />
                <Text className="text-[15px] text-[#64748B] mt-4">Loading model into memory…</Text>
                <Text className="text-[12px] text-[#94A3B8] mt-[6px]">This may take a few seconds.</Text>
            </View>
        )
    }

    if (phase === 'error') {
        return (
            <View className="flex-1 justify-center items-center bg-[#F8FAF8] p-6">
                <TouchableOpacity
                    onPress={() => router.back()}
                    className="absolute left-4"
                    style={{ top: insets.top + 16 }}
                >
                    <Ionicons name='arrow-back' size={24} color='#2A5C33' />
                </TouchableOpacity>
                <Ionicons name='alert-circle-outline' size={52} color='#EF4444' />
                <Text className="text-base text-[#EF4444] mt-4 text-center">{error}</Text>
                <TouchableOpacity
                    onPress={checkModel}
                    className="mt-6 bg-leaf py-[14px] px-8 rounded-[14px]"
                >
                    <Text className="text-white font-bold">Try Again</Text>
                </TouchableOpacity>
            </View>
        )
    }

    // ── Chat UI ──────────────────────────────────────────────────────────────────

    const displayMessages: UIMessage[] =
        isGenerating && streamingText ? [...messages, { id: 'streaming', role: 'assistant', content: streamingText }] : messages

    const showToolStatus = isGenerating && toolStatus && !streamingText

    return (
        <KeyboardAvoidingView
            className="flex-1 bg-[#F8FAF8]"
            style={{ marginBottom: Platform.OS === 'android' ? keyboardHeight + insets.bottom : 0 }}
            behavior='padding'
            enabled={Platform.OS === 'ios'}
        >
            {/* Header */}
            <View
                className="bg-white flex-row items-center border-b border-[#F1F5F1]"
                style={{
                    paddingTop: insets.top + 8,
                    paddingBottom: 12,
                    paddingHorizontal: 16,
                    elevation: 2,
                    shadowColor: '#2A5C33',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.06,
                    shadowRadius: 4,
                }}
            >
                <TouchableOpacity onPress={() => router.back()} className="mr-3">
                    <Ionicons name='arrow-back' size={24} color='#2A5C33' />
                </TouchableOpacity>
                <View className="w-[38px] h-[38px] rounded-full bg-leaf items-center justify-center mr-[10px]">
                    <Ionicons name='sparkles' size={18} color='#fff' />
                </View>
                <View className="flex-1">
                    <Text className="text-base font-bold text-brand">Leaf AI</Text>
                    <Text className="text-[11px] text-[#94A3B8]">On-device · Gemma 2 2B</Text>
                </View>
                {messages.length > 0 && (
                    <TouchableOpacity onPress={() => setMessages([])} className="p-[6px]">
                        <Ionicons name='trash-outline' size={18} color='#94A3B8' />
                    </TouchableOpacity>
                )}
            </View>

            {/* Messages */}
            <ScrollView
                ref={scrollRef}
                className="flex-1"
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
                    <View className="items-center mt-[60px] px-6">
                        <Ionicons name='chatbubbles-outline' size={52} color='#CBD5E1' />
                        <Text className="text-[#94A3B8] mt-[14px] text-[15px] text-center leading-[22px]">
                            Ask me anything about the library.
                        </Text>
                        <Text className="text-[#CBD5E1] mt-[6px] text-[13px] text-center">Books, members, borrowing, reports…</Text>
                    </View>
                )}
                {displayMessages.map((item) => (
                    <View
                        key={item.id}
                        className="mb-[10px] max-w-[80%]"
                        style={{ alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start' }}
                    >
                        {item.role === 'assistant' && (
                            <View className="flex-row items-center mb-1 gap-1">
                                <View className="w-[18px] h-[18px] rounded-full bg-leaf items-center justify-center">
                                    <Ionicons name='sparkles' size={10} color='#fff' />
                                </View>
                                <Text className="text-[11px] text-[#94A3B8] font-semibold">Leaf</Text>
                            </View>
                        )}
                        <View
                            style={{
                                backgroundColor: item.role === 'user' ? '#2A5C33' : '#fff',
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
                            <Text style={{ color: item.role === 'user' ? '#fff' : '#1E293B' }} className="text-[14px] leading-[21px]">{item.content}</Text>
                        </View>
                    </View>
                ))}
                {showToolStatus && (
                    <View className="flex-row items-center gap-2 py-[6px] px-1">
                        <View className="w-[18px] h-[18px] rounded-full bg-leaf items-center justify-center">
                            <Ionicons name='sparkles' size={10} color='#fff' />
                        </View>
                        <View
                            className="flex-row items-center bg-white rounded-[14px] px-3 py-2 gap-2"
                            style={{
                                elevation: 1,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 1 },
                                shadowOpacity: 0.06,
                                shadowRadius: 3,
                            }}
                        >
                            <ActivityIndicator size='small' color='#5CB85C' />
                            <Text className="text-[13px] text-[#64748B]">{toolStatus}</Text>
                        </View>
                    </View>
                )}
            </ScrollView>

            {/* Input bar */}
            <View
                className="bg-white border-t border-[#EEF2EE] px-4 pt-[10px] flex-row items-end gap-[10px]"
                style={{
                    paddingBottom: Platform.OS === 'android'
                        ? (keyboardHeight > 0 ? 10 : (insets.bottom > 0 ? insets.bottom : 10))
                        : (insets.bottom > 0 ? insets.bottom : 10),
                }}
            >
                <View className="flex-1 bg-[#F1F5F1] rounded-[22px] px-4 py-[10px] min-h-[44px] justify-center">
                    <TextInput
                        value={input}
                        onChangeText={setInput}
                        placeholder='Message Leaf…'
                        placeholderTextColor='#94A3B8'
                        multiline
                        className="text-[14px] text-[#1E293B] max-h-[100px] p-0"
                        editable={!isGenerating}
                    />
                </View>
                <TouchableOpacity
                    onPress={sendMessage}
                    disabled={!input.trim() || isGenerating}
                    className="w-11 h-11 rounded-full items-center justify-center"
                    style={{ backgroundColor: input.trim() && !isGenerating ? '#5CB85C' : '#E2E8F0' }}
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
