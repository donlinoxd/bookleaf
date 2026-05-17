import * as FileSystem from 'expo-file-system/legacy'
import { initLlama, LlamaContext } from 'llama.rn'
import { executeTool, isOffTopic, TOOL_DEFINITIONS } from './LibraryTools'

const MODEL_DIR = `${FileSystem.documentDirectory}models/`
const MODEL_FILE = 'gemma-2-2b-it-Q4_K_M.gguf'
const MODEL_PATH = MODEL_DIR + MODEL_FILE
const MODEL_URL =
  'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf'

export const SYSTEM_PROMPT = `You are Leaf, an AI assistant embedded in Bookleaf — a library management system.
You help librarians and library patrons with library-related tasks.

You have access to the following library database tools — use them whenever the user asks about real data:
- search_resources: find books/resources by title, author, or ISBN
- get_patron_info: look up a patron by name or ID
- get_patron_fines: check outstanding fines for a patron or all patrons
- get_overdue_books: list all currently overdue books
- get_circulation_stats: get borrowing and lending statistics
- get_today_gate_activity: get today's visitor and attendance data

Always call the appropriate tool when real library data is needed. Never make up book titles, patron names, or statistics.
For general library knowledge questions (cataloging systems, best practices, etc.), answer directly without tools.
If asked about something completely unrelated to libraries, politely decline.
Keep responses concise and professional.`

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    function: { name: string; arguments: string }
  }>
}

export type ChatOptions = {
  institutionId?: number
  onToolCall?: (toolName: string) => void
}

export const TOOL_LABELS: Record<string, string> = {
  search_resources: 'Searching catalog…',
  get_patron_info: 'Looking up patron…',
  get_patron_fines: 'Checking fines…',
  get_overdue_books: 'Fetching overdue books…',
  get_circulation_stats: 'Loading circulation stats…',
  get_today_gate_activity: 'Checking gate activity…',
}

const COMPLETION_PARAMS = {
  n_predict: 512,
  temperature: 0.7,
  stop: ['<end_of_turn>', '<eos>', '<|im_end|>'],
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

    // Fast off-topic guardrail — never reaches the model
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUserMsg && isOffTopic(lastUserMsg.content)) {
      const reply =
        "I'm Leaf, a library assistant — I can only help with library-related questions like finding books, checking patron fines, or viewing circulation stats. Is there something library-related I can help you with?"
      for (const char of reply) onToken(char)
      return reply
    }

    // Phase 1: Let the model decide whether to call tools (non-streaming)
    const phase1 = await (ctx as any).completion({
      messages,
      tools: TOOL_DEFINITIONS,
      tool_choice: 'auto',
      ...COMPLETION_PARAMS,
    })

    const toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> =
      phase1.tool_calls ?? []

    // No tool calls — stream a fresh completion so tokens arrive incrementally
    if (!toolCalls.length || !options?.institutionId) {
      let full = ''
      await ctx.completion(
        { messages, ...COMPLETION_PARAMS },
        (data) => {
          if (data.token) {
            full += data.token
            onToken(data.token)
          }
        },
      )
      return full
    }

    // Phase 2: Execute each tool the model requested
    const toolResultMessages: ChatMessage[] = []
    for (const call of toolCalls) {
      options.onToolCall?.(call.function.name)
      let args: Record<string, any> = {}
      try {
        args = JSON.parse(call.function.arguments)
      } catch {
        args = {}
      }
      const result = await executeTool(call.function.name, args, options.institutionId)
      toolResultMessages.push({
        role: 'tool',
        content: result,
        tool_call_id: call.id,
      })
    }

    // Build the extended message history with tool results
    const messagesWithTools: ChatMessage[] = [
      ...messages,
      {
        role: 'assistant',
        content: phase1.content ?? '',
        tool_calls: toolCalls,
      },
      ...toolResultMessages,
    ]

    // Phase 3: Stream the final response grounded in tool results
    let full = ''
    await ctx.completion(
      { messages: messagesWithTools, ...COMPLETION_PARAMS },
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
