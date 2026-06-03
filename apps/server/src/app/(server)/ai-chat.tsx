import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChatMessage, LlmService, SYSTEM_PROMPT, TOOL_LABELS } from '../../src/services/LlmService'
import { useAppStore } from '../../src/store/appStore'

import MASCOT from '../../assets/images/leaf-listening.png'
import MASCOT_PUSH_UP from '../../assets/images/leaf-pushing-up.png'

const LOADING_WORDS = ['Thinking', 'Reading', 'Searching', 'Leafing', 'Browsing', 'Scanning', 'Checking', 'Indexing', 'Sorting', 'Fetching']

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
    const [loadingWordIndex, setLoadingWordIndex] = useState(0)
    const scrollRef = useRef<ScrollView>(null)
    const isNearBottomRef = useRef(true)

    useEffect(() => {
        const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height))
        const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0))
        return () => {
            show.remove()
            hide.remove()
        }
    }, [])

    useEffect(() => {
        if (!isGenerating || streamingText || toolStatus) return
        const interval = setInterval(() => {
            setLoadingWordIndex((i) => (i + 1) % LOADING_WORDS.length)
        }, 1500)
        return () => clearInterval(interval)
    }, [isGenerating, streamingText, toolStatus])

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
                }
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
            <View className='flex-1 justify-center items-center bg-bio'>
                <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />
                <ActivityIndicator size='large' color='#5CB85C' />
            </View>
        )
    }

    if (phase === 'not-downloaded') {
        return (
            <View className='flex-1 bg-bio'>
                <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />
                <View className='bg-brand px-5 pb-6 rounded-b-[28px]' style={{ paddingTop: insets.top + 12 }}>
                    <View className='flex-row items-center'>
                        <TouchableOpacity
                            onPress={() => router.back()}
                            className='w-9 h-9 rounded-full items-center justify-center mr-3'
                            style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
                        >
                            <Ionicons name='arrow-back' size={20} color='#fff' />
                        </TouchableOpacity>
                        <Text className='text-lg font-bold text-white'>Leaf AI</Text>
                    </View>
                </View>

                <View className='flex-1 px-6 justify-center items-center'>
                    <View className='w-[88px] h-[88px] rounded-full bg-mint items-center justify-center'>
                        <Ionicons name='sparkles' size={44} color='#5CB85C' />
                    </View>
                    <Text className='text-[26px] font-extrabold text-brand mt-5 text-center'>Meet Leaf AI</Text>
                    <Text className='text-[15px] text-[#64748B] mt-[10px] text-center leading-[22px]'>
                        Your on-device AI assistant for the library.{'\n'}No internet required after setup.
                    </Text>

                    <View className='bg-mint rounded-[18px] p-4 mt-8 w-full gap-[10px]'>
                        <View className='flex-row items-center gap-3'>
                            <View className='w-8 h-8 rounded-full bg-white items-center justify-center'>
                                <Ionicons name='download-outline' size={16} color='#2A5C33' />
                            </View>
                            <Text className='text-[13px] text-[#1E293B]'>
                                One-time download: <Text className='font-semibold'>~1.5 GB</Text>
                            </Text>
                        </View>
                        <View className='flex-row items-center gap-3'>
                            <View className='w-8 h-8 rounded-full bg-white items-center justify-center'>
                                <Ionicons name='wifi-outline' size={16} color='#2A5C33' />
                            </View>
                            <Text className='text-[13px] text-[#1E293B]'>Runs fully offline after download</Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        onPress={downloadModel}
                        className='bg-leaf rounded-2xl py-4 px-12 mt-8'
                        style={{
                            elevation: 4,
                            shadowColor: '#5CB85C',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.3,
                            shadowRadius: 8,
                        }}
                    >
                        <Text className='text-white text-base font-bold'>Download Model</Text>
                    </TouchableOpacity>
                    <Text className='text-[12px] text-[#94A3B8] mt-3 text-center'>Use Wi-Fi for faster download.</Text>
                </View>
            </View>
        )
    }

    if (phase === 'downloading') {
        const pct = Math.round(downloadProgress * 100)
        const downloaded = (downloadProgress * 1.5).toFixed(1)
        return (
            <View className='flex-1 bg-bio p-6 justify-center items-center'>
                <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />
                <Image source={MASCOT_PUSH_UP} className="w-40 h-40 mb-4" resizeMode="contain" />
                <Text className='text-[22px] font-extrabold text-brand mt-5'>Downloading Leaf AI</Text>
                <Text className='text-[14px] text-[#64748B] mt-[6px]'>{downloaded} GB of ~1.5 GB</Text>

                <View className='w-full h-2 bg-mint-dark rounded mt-7'>
                    <View style={{ width: `${pct}%` }} className='h-2 bg-leaf rounded' />
                </View>
                <Text className='text-[22px] font-extrabold text-brand mt-[10px]'>{pct}%</Text>
                <Text className='text-[12px] text-[#94A3B8] mt-2 text-center'>Keep the app open until complete.</Text>
            </View>
        )
    }

    if (phase === 'loading') {
        return (
            <View className='flex-1 justify-center items-center bg-bio'>
                <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />
                <ActivityIndicator size='large' color='#5CB85C' />
                <Text className='text-[15px] text-[#64748B] mt-4'>Leaf is loading into memory…</Text>
                <Text className='text-[12px] text-[#94A3B8] mt-[6px]'>This may take a few seconds.</Text>
            </View>
        )
    }

    if (phase === 'error') {
        return (
            <View className='flex-1 bg-bio'>
                <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />
                <View className='bg-brand px-5 pb-6 rounded-b-[28px]' style={{ paddingTop: insets.top + 12 }}>
                    <View className='flex-row items-center'>
                        <TouchableOpacity
                            onPress={() => router.back()}
                            className='w-9 h-9 rounded-full items-center justify-center mr-3'
                            style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
                        >
                            <Ionicons name='arrow-back' size={20} color='#fff' />
                        </TouchableOpacity>
                        <Text className='text-lg font-bold text-white'>Leaf AI</Text>
                    </View>
                </View>
                <View className='flex-1 justify-center items-center p-6'>
                    <View className='w-16 h-16 rounded-full bg-red-50 items-center justify-center'>
                        <Ionicons name='alert-circle-outline' size={36} color='#EF4444' />
                    </View>
                    <Text className='text-base text-[#EF4444] mt-4 text-center'>{error}</Text>
                    <TouchableOpacity onPress={checkModel} className='mt-6 bg-leaf py-[14px] px-8 rounded-2xl'>
                        <Text className='text-white font-bold'>Try Again</Text>
                    </TouchableOpacity>
                </View>
            </View>
        )
    }

    // ── Chat UI ──────────────────────────────────────────────────────────────────

    const displayMessages: UIMessage[] =
        isGenerating && streamingText ? [...messages, { id: 'streaming', role: 'assistant', content: streamingText }] : messages

    const showToolStatus = isGenerating && toolStatus && !streamingText

    return (
        <KeyboardAvoidingView
            className='flex-1 bg-bio'
            style={{ marginBottom: Platform.OS === 'android' ? keyboardHeight + insets.bottom : 0 }}
            behavior='padding'
            enabled={Platform.OS === 'ios'}
        >
            <StatusBar barStyle='light-content' backgroundColor='#2A5C33' />

            {/* Header */}
            <View
                className='bg-brand px-5 pb-5 rounded-b-[28px]'
                style={{
                    paddingTop: insets.top + 12,
                    elevation: 6,
                    shadowColor: '#2A5C33',
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.18,
                    shadowRadius: 8,
                }}
            >
                <View className='flex-row items-center'>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        className='w-9 h-9 rounded-full items-center justify-center mr-3'
                        style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
                    >
                        <Ionicons name='arrow-back' size={20} color='#fff' />
                    </TouchableOpacity>
                    <View className='w-9 h-9 rounded-full bg-leaf items-center justify-center mr-3'>
                        <Ionicons name='sparkles' size={18} color='#fff' />
                    </View>
                    <View className='flex-1'>
                        <Text className='text-base font-extrabold text-white'>Leaf AI</Text>
                        <Text className='text-[11px] text-white/60'>Your AI Library Assistant</Text>
                    </View>
                    {messages.length > 0 && (
                        <TouchableOpacity
                            onPress={() => setMessages([])}
                            className='w-9 h-9 rounded-full items-center justify-center'
                            style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
                        >
                            <Ionicons name='trash-outline' size={18} color='#fff' />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Messages */}
            <ScrollView
                ref={scrollRef}
                className='flex-1'
                contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
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
                    <View className='items-center mt-[60px] px-6'>
                        <View className='w-32 h-32 rounded-full items-center justify-center'>
                            <Image source={MASCOT} className='w-32 h-32 -mb-2' resizeMode='contain' />
                        </View>
                        <Text className='text-brand mt-[14px] text-[15px] font-semibold text-center'>Ask Leaf anything</Text>
                        <Text className='text-[#94A3B8] mt-[6px] text-[13px] text-center leading-[20px]'>Books, members, borrowing, reports…</Text>
                    </View>
                )}
                {displayMessages.map((item) => (
                    <View key={item.id} className='mb-3 max-w-[82%]' style={{ alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        {item.role === 'assistant' && (
                            <View className='flex-row items-center mb-1 gap-1'>
                                <View className='w-[18px] h-[18px] rounded-full bg-leaf items-center justify-center'>
                                    <Ionicons name='sparkles' size={10} color='#fff' />
                                </View>
                                <Text className='text-[11px] text-[#94A3B8] font-semibold'>Leaf</Text>
                            </View>
                        )}
                        <View
                            style={{
                                backgroundColor: item.role === 'user' ? '#2A5C33' : '#fff',
                                borderRadius: 20,
                                borderBottomRightRadius: item.role === 'user' ? 4 : 20,
                                borderBottomLeftRadius: item.role === 'user' ? 20 : 4,
                                paddingHorizontal: 14,
                                paddingVertical: 10,
                                elevation: 2,
                                shadowColor: item.role === 'user' ? '#2A5C33' : '#000',
                                shadowOffset: { width: 0, height: 1 },
                                shadowOpacity: item.role === 'user' ? 0.15 : 0.06,
                                shadowRadius: 4,
                            }}
                        >
                            <Text style={{ color: item.role === 'user' ? '#fff' : '#1E293B' }} className='text-[14px] leading-[21px]'>
                                {item.content}
                            </Text>
                        </View>
                    </View>
                ))}
                {isGenerating && !streamingText && !toolStatus && (
                    <View className='flex-row items-center gap-2 py-[6px] px-1 mb-1'>
                        <View className='w-[18px] h-[18px] rounded-full bg-leaf items-center justify-center'>
                            <Ionicons name='sparkles' size={10} color='#fff' />
                        </View>
                        <View
                            className='flex-row items-center bg-white rounded-2xl px-3 py-2 gap-2'
                            style={{ elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 }}
                        >
                            <ActivityIndicator size='small' color='#5CB85C' />
                            <Text className='text-[11px] text-[#64748B]'>{LOADING_WORDS[loadingWordIndex]}…</Text>
                        </View>
                    </View>
                )}
                {showToolStatus && (
                    <View className='flex-row items-center gap-2 py-[6px] px-1 mb-1'>
                        <View className='w-[18px] h-[18px] rounded-full bg-leaf items-center justify-center'>
                            <Ionicons name='sparkles' size={10} color='#fff' />
                        </View>
                        <View
                            className='flex-row items-center bg-white rounded-2xl px-3 py-2 gap-2'
                            style={{ elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 }}
                        >
                            <ActivityIndicator size='small' color='#5CB85C' />
                            <Text className='text-[11px] text-[#64748B]'>{toolStatus}</Text>
                        </View>
                    </View>
                )}
            </ScrollView>

            {/* Input bar */}
            <View
                className='bg-white px-4 pt-3'
                style={{
                    paddingBottom: Platform.OS === 'android' ? (keyboardHeight > 0 ? 12 : 8) : insets.bottom > 0 ? insets.bottom : 12,
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    elevation: 8,
                    shadowColor: '#2A5C33',
                    shadowOffset: { width: 0, height: -2 },
                    shadowOpacity: 0.07,
                    shadowRadius: 12,
                }}
            >
                <View className='flex-row items-end bg-[#F1F5F1] rounded-[24px] px-4 py-2' style={{ minHeight: 48 }}>
                    <TextInput
                        value={input}
                        onChangeText={setInput}
                        placeholder='Message Leaf…'
                        placeholderTextColor='#94A3B8'
                        multiline
                        className='flex-1 text-[14px] text-[#1E293B] max-h-[100px] py-1 p-0 mr-2'
                        editable={!isGenerating}
                    />
                    <TouchableOpacity
                        onPress={sendMessage}
                        disabled={!input.trim() || isGenerating}
                        className='w-9 h-9 rounded-full items-center justify-center self-end mb-[2px]'
                        style={{ backgroundColor: input.trim() && !isGenerating ? '#5CB85C' : '#E2E8F0' }}
                    >
                        {isGenerating ? (
                            <ActivityIndicator size='small' color='#fff' />
                        ) : (
                            <Ionicons name='arrow-up' size={18} color={input.trim() ? '#fff' : '#94A3B8'} />
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
    )
}
