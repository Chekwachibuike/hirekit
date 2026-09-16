// AI client — server-side only. Never import in a Client Component.
// Rule: only import from files inside /src/app/api/** or /src/lib/ai/**
import Groq from 'groq-sdk'

if (!process.env.GROQ_API_KEY) {
  throw new Error('GROQ_API_KEY is not set. Add it to .env.local (no NEXT_PUBLIC_ prefix).')
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

export const AI_MODELS = {
  // Fast + free tier — extraction, analysis, short tasks
  flash: 'llama-3.1-8b-instant',
  // High quality — cover letters, interview prep, project suggestions
  pro: 'llama-3.3-70b-versatile',
} as const

export type AiModel = (typeof AI_MODELS)[keyof typeof AI_MODELS]

interface GenerateOptions {
  model?: AiModel
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
}

export async function generate(
  prompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const {
    model = AI_MODELS.flash,
    systemPrompt,
    temperature = 0.7,
    maxTokens = 2048,
  } = options

  const messages: Groq.Chat.ChatCompletionMessageParam[] = []

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  const completion = await groq.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  })

  return completion.choices[0]?.message?.content ?? ''
}

// Parses a JSON block out of an AI response that may wrap it in markdown fences
export function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned) as T
}
