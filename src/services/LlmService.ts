import * as FileSystem from 'expo-file-system/legacy'
import { initLlama, LlamaContext } from 'llama.rn'

const MODEL_DIR = `${FileSystem.documentDirectory}models/`
const MODEL_FILE = 'gemma-2-2b-it-Q4_K_M.gguf'
const MODEL_PATH = MODEL_DIR + MODEL_FILE
const MODEL_URL =
  'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf'

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
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
      }
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
    onToken: (token: string) => void
  ): Promise<string> {
    if (!ctx) throw new Error('Model not loaded')
    let full = ''
    await ctx.completion(
      {
        messages,
        n_predict: 512,
        temperature: 0.7,
        stop: ['<end_of_turn>', '<eos>', '<|im_end|>'],
      },
      (data) => {
        if (data.token) {
          full += data.token
          onToken(data.token)
        }
      }
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
