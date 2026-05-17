import * as FileSystem from 'expo-file-system/legacy'
import { initLlama, LlamaContext } from 'llama.rn'
import { detectIntent, executeTool, ToolName } from './LibraryTools'

const MODEL_DIR = `${FileSystem.documentDirectory}models/`
const MODEL_FILE = 'gemma-2-2b-it-Q4_K_M.gguf'
const MODEL_PATH = MODEL_DIR + MODEL_FILE
const MODEL_URL =
  'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf'

export const SYSTEM_PROMPT = `You are Leaf, an AI assistant embedded in Bookleaf — a library management system.
You help librarians and library patrons with library-related tasks only.

When library data is provided in a [LIBRARY DATA] block, use it to give accurate, specific answers.
Do NOT make up book titles, patron names, fines, or any library data — only reference what is provided.

You can help with:
- Finding books and resources in the catalog
- Checking book availability and copy counts
- Looking up patron information and borrowing history
- Checking fines, overdue books, and circulation statistics
- Gate and attendance logs
- General questions about library management, cataloging systems, and best practices

If asked about something completely unrelated to libraries (recipes, sports, movies, music, etc.),
politely decline and explain you can only assist with library matters.

Keep responses concise, helpful, and professional.`

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ChatOptions = {
  institutionId?: number
  onToolCall?: (tool: ToolName, query: string) => void
}

export const TOOL_LABELS: Record<ToolName, string> = {
  search_resources: 'Searching catalog…',
  get_patron_info: 'Looking up patron…',
  get_patron_fines: 'Checking fines…',
  get_overdue_books: 'Fetching overdue books…',
  get_circulation_stats: 'Loading circulation stats…',
  get_today_gate_activity: 'Checking gate activity…',
  general: '',
  off_topic: '',
}

let ctx: LlamaContext | null = null

export const LlmService = {
  async isModelDownloaded(): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(MODEL_PATH)
    return info.exists
  },

  async downloadModel(onProgress: (progress: number) => void): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(MODEL_DIR)
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true })
    }
    const dl = FileSystem.createDownloadResumable(
      MODEL_URL,
      MODEL_PATH,
      {},
      (p) => {
        const pct = p.totalBytesExpectedToWrite > 0
          ? p.totalBytesWritten / p.totalBytesExpectedToWrite
          : 0
        onProgress(pct)
      },
    )
    const result = await dl.downloadAsync()
    if (!result || result.status !== 200) {
      await FileSystem.deleteAsync(MODEL_PATH, { idempotent: true })
      throw new Error(`Download failed with status ${result?.status}`)
    }
  },

  async loadModel(): Promise<void> {
    if (ctx) return
    const path = MODEL_PATH.replace('file://', '')
    ctx = await initLlama({
      model: path,
      use_mlock: true,
      n_ctx: 2048,
      n_gpu_layers: 0,
    })
  },

  isLoaded(): boolean {
    return ctx !== null
  },

  async chat(
    messages: ChatMessage[],
    onToken: (token: string) => void,
    options?: ChatOptions,
  ): Promise<string> {
    if (!ctx) throw new Error('Model not loaded')

    // Find the last user message for intent detection
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')

    let contextBlock: string | null = null

    if (lastUserMsg && options?.institutionId) {
      const intent = detectIntent(lastUserMsg.content)

      // Hard guardrail: off-topic requests never reach the model
      if (intent.tool === 'off_topic') {
        const reply =
          "I'm Leaf, a library assistant — I can only help with library-related questions like finding books, checking patron fines, or viewing circulation stats. Is there something library-related I can help you with?"
        for (const char of reply) onToken(char)
        return reply
      }

      // Tool execution (RAG)
      if (intent.tool !== 'general') {
        options.onToolCall?.(intent.tool, intent.query)
        contextBlock = await executeTool(intent, options.institutionId)
      }
    }

    // Build the messages array, injecting context into the last user message
    const enhanced: ChatMessage[] = messages.map((m, i) => {
      const isLast = i === messages.length - 1
      if (isLast && m.role === 'user' && contextBlock) {
        return {
          ...m,
          content: `[LIBRARY DATA]\n${contextBlock}\n[/LIBRARY DATA]\n\n${m.content}`,
        }
      }
      return m
    })

    let full = ''
    await ctx.completion(
      {
        messages: enhanced,
        n_predict: 512,
        temperature: 0.7,
        stop: ['<end_of_turn>', '<eos>', '<|im_end|>'],
      },
      (data) => {
        if (data.token) {
          full += data.token
          onToken(data.token)
        }
      },
    )
    return full
  },

  async release(): Promise<void> {
    if (ctx) {
      await ctx.release()
      ctx = null
    }
  },
}
